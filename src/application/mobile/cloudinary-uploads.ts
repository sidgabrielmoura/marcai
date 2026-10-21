import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { getEvidenceRound } from "@/application/tasks/evidence-round";
import { lockTask } from "@/application/tasks/task-lock";
import {
  createTenantUploadCredentials,
  inspectCloudinaryAsset,
  isAuthorizedCloudinaryUrl,
} from "@/infrastructure/cloudinary/cloudinary-service";
import { mutable } from "./task-access";
import { fail } from "./http";

export const cloudinaryUploadSchema = z
  .object({
    scope: z.enum(["evidence", "form"]),
    taskId: z.string().min(1).max(128),
    requirementId: z.string().min(1).max(128).optional(),
    fieldId: z.string().min(1).max(128).optional(),
    roundId: z.string().min(1).max(128),
    fileName: z.string().min(1).max(200),
    fileType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "application/pdf",
    ]),
    fileSize: z
      .number()
      .int()
      .positive()
      .max(12 * 1024 * 1024),
  })
  .strict()
  .refine((input) =>
    input.scope === "form"
      ? !!input.fieldId && !input.requirementId
      : !!input.requirementId && !input.fieldId,
  );

const formats: Record<string, string[]> = {
  PHOTO: ["jpg", "jpeg", "png", "webp"],
  SIGNATURE: ["png"],
  VIDEO: ["mp4"],
  FILE: ["jpg", "jpeg", "png", "webp", "mp4", "pdf"],
};
const mimeFormat: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};
type UploadRow = {
  id: string;
  task_id: string;
  field_id: string | null;
  requirement_id: string | null;
  round_id: string;
  name: string;
  mime: string;
  size: number;
  attachment: Record<string, unknown>;
};
export type CloudinaryFile = {
  fileUrl: string;
  publicId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

export async function signEmployeeUpload(
  context: AuthenticatedContext,
  input: unknown,
) {
  const data = cloudinaryUploadSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockTask(tx, context.organizationId, data.taskId);
    const task = await mutable(tx, context, data.taskId);
    const round = await getEvidenceRound(
      tx,
      context.organizationId,
      data.taskId,
    );
    if (data.roundId !== (round?.id ?? "initial"))
      fail(409, "ROUND_CHANGED", "A rodada mudou. Atualize a tarefa.");
    const field =
      data.scope === "form"
        ? (Array.isArray(task.formFields)
            ? (task.formFields as Array<{ id: string; type: string }>)
            : []
          ).find((field) => field.id === data.fieldId)
        : task.evidenceRequirements.find(
            (requirement) => requirement.id === data.requirementId,
          );
    if (!field || !formats[field.type])
      fail(400, "UPLOAD_TARGET", "Este campo não aceita este arquivo.");
    const format = mimeFormat[data.fileType];
    if (!formats[field.type].includes(format))
      fail(
        400,
        "FILE_CONTENT",
        "O formato do arquivo não corresponde à comprovação.",
      );
    if (data.scope === "evidence" && data.fileSize > 10 * 1024 * 1024)
      fail(413, "FILE_LIMIT", "A comprovação deve ter até 10 MB.");
    const resourceType =
      data.fileType === "video/mp4"
        ? "video"
        : data.fileType === "application/pdf"
          ? "raw"
          : "image";
    const id = randomUUID();
    const credentials = createTenantUploadCredentials({
      ...data,
      organizationId: context.organizationId,
      publicId: resourceType === "raw" ? `${id}.pdf` : id,
      resourceType,
      allowedFormats: formats[field.type],
    });
    const publicId = `${credentials.folder}/${credentials.publicId}`;
    const pending = { kind: "CLOUDINARY_PENDING", publicId, resourceType };
    await tx.$executeRaw`INSERT INTO mobile_uploads(id,user_id,organization_id,task_id,field_id,requirement_id,round_id,name,mime,size,attachment,expires_at) VALUES(${id}::uuid,${context.userId},${context.organizationId},${data.taskId},${data.fieldId ?? null},${data.requirementId ?? null},${data.roundId},${data.fileName},${data.fileType},${data.fileSize},${JSON.stringify(pending)}::jsonb,now()+interval '24 hours')`;
    return { ...credentials, uploadId: id };
  });
}

/** Network verification occurs before acquiring a task transaction lock. */
export async function resolveEmployeeUpload(
  context: AuthenticatedContext,
  taskId: string,
  target: { fieldId?: string; requirementId?: string; roundId: string },
  file: CloudinaryFile,
) {
  if (!file.publicId || !isAuthorizedCloudinaryUrl(file.fileUrl))
    fail(400, "INVALID_URL", "Arquivo de armazenamento não autorizado.");
  const [upload] = await prisma.$queryRaw<
    UploadRow[]
  >`SELECT * FROM mobile_uploads WHERE user_id=${context.userId} AND organization_id=${context.organizationId} AND task_id=${taskId} AND round_id=${target.roundId} AND attachment->>'publicId'=${file.publicId} AND expires_at>now() ORDER BY expires_at DESC LIMIT 1`;
  if (
    !upload ||
    upload.field_id !== (target.fieldId ?? null) ||
    upload.requirement_id !== (target.requirementId ?? null)
  )
    fail(
      403,
      "UPLOAD_OWNER",
      "Este arquivo não pertence a esta tarefa, campo e rodada.",
    );
  const resourceType = upload.attachment.resourceType;
  if (!["image", "video", "raw"].includes(String(resourceType)))
    fail(400, "UPLOAD_TARGET", "Envio inválido.");
  let asset: Awaited<ReturnType<typeof inspectCloudinaryAsset>>;
  try {
    asset = await inspectCloudinaryAsset(
      file.publicId,
      resourceType as "image" | "video" | "raw",
    );
  } catch {
    fail(
      503,
      "CLOUDINARY_UNAVAILABLE",
      "Não foi possível conferir o arquivo no Cloudinary. Tente novamente.",
    );
  }
  const expectedFormat = mimeFormat[upload.mime];
  const sizeLimit = target.fieldId ? 12 * 1024 * 1024 : 10 * 1024 * 1024;
  // Cloudinary can normalize the bytes; enforce the product limit against its trusted metadata.
  if (
    asset.publicId !== file.publicId ||
    asset.resourceType !== resourceType ||
    !Number.isFinite(asset.fileSize) ||
    asset.fileSize <= 0 ||
    asset.fileSize > sizeLimit ||
    ![expectedFormat, ...(expectedFormat === "jpg" ? ["jpeg"] : [])].includes(
      asset.format,
    ) ||
    !isAuthorizedCloudinaryUrl(asset.fileUrl) ||
    file.fileUrl !== asset.fileUrl ||
    (file.fileSize !== undefined && file.fileSize !== asset.fileSize) ||
    (file.mimeType !== undefined && file.mimeType !== upload.mime)
  )
    fail(
      400,
      "ATTACHMENT_METADATA",
      "O arquivo enviado difere do envio autorizado.",
    );
  // The persisted URL always comes from the verified provider response.
  return {
    uploadId: upload.id,
    roundId: upload.round_id,
    taskId,
    fieldId: upload.field_id,
    requirementId: upload.requirement_id,
    attachment: {
      storageKey: target.fieldId ? upload.id : asset.fileUrl,
      fileUrl: asset.fileUrl,
      publicId: asset.publicId,
      fileName: upload.name,
      fileSize: asset.fileSize,
      mimeType: upload.mime,
      resourceType: asset.resourceType,
    },
  };
}

export async function commitEmployeeUpload(
  tx: Prisma.TransactionClient,
  context: AuthenticatedContext,
  proof: Awaited<ReturnType<typeof resolveEmployeeUpload>>,
) {
  const round = await getEvidenceRound(
    tx,
    context.organizationId,
    proof.taskId,
  );
  if (proof.roundId !== (round?.id ?? "initial"))
    fail(409, "ROUND_CHANGED", "A rodada mudou durante o envio.");
  const affected =
    await tx.$executeRaw`UPDATE mobile_uploads SET attachment=${JSON.stringify(proof.attachment)}::jsonb WHERE id=${proof.uploadId}::uuid AND user_id=${context.userId} AND organization_id=${context.organizationId} AND task_id=${proof.taskId} AND round_id=${proof.roundId} AND expires_at>now()`;
  if (affected !== 1)
    fail(
      409,
      "UPLOAD_EXPIRED",
      "O envio expirou. Selecione o arquivo novamente.",
    );
  return proof.attachment;
}
