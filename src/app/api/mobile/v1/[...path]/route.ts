import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { z } from "zod";
import { recordTaskView } from "@/application/mobile/task-views";
import { eventStream } from "@/application/mobile/event-stream";
import { realtimeAuthorization } from "@/infrastructure/realtime/sync";
import { resolveDestination } from "@/application/mobile/destinations";
import { prisma } from "@/infrastructure/database/prisma";
import { json, failure, fail, MobileError } from "@/application/mobile/http";
import {
  login,
  refresh,
  revoke,
  secondFactor,
  withAuth,
  logout,
  switchOrg,
  identity,
  rateRequest,
  rate,
} from "@/application/mobile/security";
import {
  listTasks,
  taskDetail,
  taskDetailScope,
  history,
  execution,
  searchTasks,
} from "@/application/mobile/data";
import { operate } from "@/application/mobile/operations";
import { completeExecution } from "@/application/mobile/execution-operations";
import {
  completeTask,
  saveEvidence,
  startTask,
} from "@/application/mobile/task-submission";
import {
  createUpload,
  chunk,
  assemble,
  finalizeForm,
  ownedUpload,
  registerCloudinaryFormAttachment,
} from "@/application/mobile/attachments";
import {
  notices,
  read,
  register,
  installationStatus,
  replay,
  acknowledge,
} from "@/application/mobile/notifications";
import {
  authenticationOptions,
  authenticationVerify,
  registrationOptions,
  registrationVerify,
} from "@/application/mobile/passkeys";
import { readEvidence } from "@/infrastructure/storage/evidence-storage";
import { taskScope } from "@/application/security/operational-scope";
import { isAuthorizedCloudinaryUrl } from "@/infrastructure/cloudinary/cloudinary-service";
import { signEmployeeUpload } from "@/application/mobile/cloudinary-uploads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
const id = (value: string) =>
  z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,128}$/)
    .parse(value);
async function body(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 128000)
    fail(413, "BODY_LIMIT", "Os dados excedem o limite permitido.");
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > 128000) {
      await reader.cancel();
      fail(413, "BODY_LIMIT", "Os dados excedem o limite permitido.");
    }
    chunks.push(r.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "BODY_INVALID", "Dados inválidos.");
  }
}
async function handle(req: Request, ctx: Context) {
  try {
    const parts = (await ctx.params).path.map(id),
      route = parts.join("/"),
      url = new URL(req.url),
      method = req.method;
    if (method === "POST" && route.startsWith("auth/")) {
      const b = await body(req);
      const identifier =
        typeof b === "object" &&
        b &&
        (b.employeeCode || b.email || b.challengeId)
          ? String(b.organizationSlug ?? "")
              .trim()
              .toLowerCase() +
            ":" +
            String(b.employeeCode ?? b.email ?? b.challengeId)
              .trim()
              .toLowerCase()
          : "";
      await rateRequest(req, route, identifier);
      if (route === "auth/pin") return json(await login(b, "pin"));
      if (route === "auth/password") return json(await login(b, "password"));
      if (route === "auth/refresh") return json(await refresh(b));
      if (route === "auth/revoke") return json(await revoke(b));
      if (route === "auth/second-factor") return json(await secondFactor(b));
      if (route === "auth/passkeys/options")
        return json(await authenticationOptions(b));
      if (route === "auth/passkeys/verify")
        return json(await authenticationVerify(b));
      fail(404, "ENDPOINT_UNKNOWN", "Recurso indisponível.");
    }
    return await withAuth(
      req,
      async (auth, c) => {
        if (method === "GET" && route === "session")
          return json(identity(auth.member));
        if (method === "GET" && route === "realtime/token") {
          const token = await realtimeAuthorization(c, url.searchParams.get("protocol"));
          if (!token) fail(503, "REALTIME_UNAVAILABLE", "Tempo real temporariamente indisponível.");
          return json(token);
        }
        if (method === "GET" && route === "notifications/unread-count") {
          return json({ unreadCount: await prisma.notification.count({ where: {
            organizationId: c.organizationId, userId: c.userId, readAt: null,
          } }) });
        }
        if (method === "POST" && route === "logout") {
          await logout(auth.session);
          return json({ success: true });
        }
        if (method === "GET" && route === "organizations") {
          const members = await prisma.organizationMember.findMany({
            where: {
              userId: c.userId,
              status: "ACTIVE",
              organization: { status: "ACTIVE" },
              user: { status: "ACTIVE" },
            },
            select: {
              role: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { organization: { name: "asc" } },
          });
          return json(
            members.map((m) => ({ ...m.organization, role: m.role })),
          );
        }
        if (method === "POST" && route === "organizations/switch") {
          const b = z
            .object({ organizationId: z.string().min(1).max(128) })
            .strict()
            .parse(await body(req));
          return json(await switchOrg(auth.session, b.organizationId));
        }
        if (method === "GET" && route === "destinations/resolve") {
          const b = z
            .object({
              taskId: z
                .string()
                .regex(/^[a-zA-Z0-9_-]{1,128}$/)
                .optional(),
              executionId: z
                .string()
                .regex(/^[a-zA-Z0-9_-]{1,128}$/)
                .optional(),
            })
            .refine((v) => !!v.taskId !== !!v.executionId)
            .parse(Object.fromEntries(url.searchParams));
          return json(await resolveDestination(c, b));
        }
        if (method === "GET" && route === "tasks")
          return json(
            await listTasks(
              c,
              url.searchParams.get("cursor"),
              z
                .string()
                .max(100)
                .parse(url.searchParams.get("q") ?? ""),
              z
                .enum(["all", "standard", "form"])
                .parse(url.searchParams.get("type") ?? "all"),
              new Date(),
              undefined,
              { includeCounts: !url.searchParams.get("cursor") },
            ),
          );
        if (method === "GET" && route === "search")
          return json(
            await searchTasks(
              c,
              z
                .string()
                .trim()
                .min(2)
                .max(100)
                .parse(url.searchParams.get("q")),
            ),
          );
        if (method === "GET" && route === "history") {
          const period = z
            .enum(["7", "30", "90", "365"])
            .parse(url.searchParams.get("period") ?? "30");
          const status = z
            .enum(["ALL", "COMPLETED", "CANCELLED", "NOT_COMPLETED"])
            .parse(url.searchParams.get("status") ?? "ALL");
          return json(
            await history(
              c,
              Number(period),
              status,
              url.searchParams.get("cursor"),
            ),
          );
        }
        if (method === "POST" && route === "uploads/sign")
          return json(await signEmployeeUpload(c, await body(req)));
        if (method === "GET" && parts[0] === "tasks" && parts.length === 2)
          return json(await taskDetail(c, parts[1]!));
        if (
          method === "POST" &&
          parts[0] === "executions" &&
          parts.length === 3 &&
          parts[2] === "complete"
        )
          return json(await completeExecution(req, c, parts[1]!));
        if (method === "GET" && parts[0] === "executions" && parts.length === 2)
          return json(await execution(c, parts[1]!));
        if (method === "POST" && parts[0] === "tasks" && parts.length === 3) {
          const taskId = parts[1]!,
            action = parts[2]!,
            b = await body(req);
          // All reads happen again on the server; a push is not permission.
          let result;
          if (action === "view") {
            z.object({}).strict().parse(b);
            return json(await recordTaskView(req, c, taskId));
          } else if (action === "start") {
            const input = z
              .object({
                justification: z.string().trim().min(3).max(1000).optional(),
              })
              .strict()
              .parse(b);
            result = await startTask(req, taskId, input.justification);
          } else if (action === "complete") {
            const input = z
              .object({
                answers: z.record(z.string(), z.unknown()).optional(),
                roundId: z.string().max(128),
              })
              .strict()
              .parse(b);
            const current = await taskDetail(c, taskId);
            if (current.roundId !== input.roundId)
              fail(
                409,
                "ROUND_CHANGED",
                "A correção abriu uma nova rodada. Revise as respostas.",
              );
            result = await completeTask(
              req,
              taskId,
              input.answers,
              input.roundId,
            );
          } else if (action === "evidence") {
            const input = z
              .object({
                requirementId: z.string().min(1).max(128),
                value: z.string().max(10000),
                roundId: z.string().max(128),
                uploadId: z.string().uuid().optional(),
                fileUrl: z.string().url().optional(),
                publicId: z.string().optional(),
                fileName: z.string().optional(),
                fileSize: z.number().int().optional(),
                mimeType: z.string().optional(),
              })
              .strict()
              .parse(b);
            const current = await taskDetail(c, taskId);
            if (current.roundId !== input.roundId)
              fail(409, "ROUND_CHANGED", "Esta rodada de comprovação mudou.");
            let file: File | null = null;
            let cloudinaryData = undefined;
            if (input.fileUrl) {
              if (!isAuthorizedCloudinaryUrl(input.fileUrl))
                fail(400, "INVALID_URL", "URL de arquivo não autorizada.");
              cloudinaryData = {
                fileUrl: input.fileUrl,
                publicId: input.publicId,
                fileName: input.fileName,
                fileSize: input.fileSize,
                mimeType: input.mimeType,
              };
            } else if (input.uploadId) {
              const { upload, bytes } = await assemble(c, input.uploadId);
              if (
                upload.task_id !== taskId ||
                upload.requirement_id !== input.requirementId ||
                upload.round_id !== input.roundId
              )
                fail(403, "UPLOAD_OWNER", "Arquivo de outra tarefa ou rodada.");
              file = new File([new Uint8Array(bytes)], upload.name, {
                type: upload.mime,
              });
            }
            result = await saveEvidence(
              req,
              taskId,
              input.requirementId,
              input.value,
              file,
              input.roundId,
              cloudinaryData,
            );
          } else if (action === "form-file") {
            const input = z
              .object({
                fieldId: z.string().min(1).max(128),
                roundId: z.string().max(128),
                fileUrl: z.string().url(),
                publicId: z.string().optional(),
                fileName: z.string().min(1).max(255),
                fileSize: z.number().int().positive(),
                mimeType: z.string().min(1).max(100),
              })
              .strict()
              .parse(b);
            return json(
              await registerCloudinaryFormAttachment(req, c, taskId, input),
            );
          } else if (["claim", "resume", "impediment"].includes(action))
            result = await operate(req, taskId, action, b);
          else if (action === "uploads")
            return json(await createUpload(req, c, taskId, b));
          else fail(404, "ACTION_UNKNOWN", "Ação indisponível.");
          return json({
            ...result,
            code:
              "error" in result && result.error
                ? action === "evidence"
                  ? "EVIDENCE_REJECTED"
                  : "TASK_RULE_REJECTED"
                : null,
            task: await taskDetail(c, taskId),
          });
        }
        if (parts[0] === "uploads" && parts.length === 3) {
          if (method === "PUT" && parts[2] === "chunk") {
            const part = Number(url.searchParams.get("part"));
            if (Number(req.headers.get("content-length") ?? 0) > 1048576)
              fail(413, "CHUNK_LIMIT", "Envie partes de até 1 MB.");
            const reader = req.body?.getReader();
            if (!reader) fail(400, "FILE_EMPTY", "Arquivo vazio.");
            const buffers: Uint8Array[] = [];
            let size = 0;
            while (true) {
              const r = await reader.read();
              if (r.done) break;
              size += r.value.length;
              if (size > 1048576) {
                await reader.cancel();
                fail(413, "CHUNK_LIMIT", "Envie partes de até 1 MB.");
              }
              buffers.push(r.value);
            }
            return json(
              await chunk(c, parts[1]!, part, Buffer.concat(buffers)),
            );
          }
          if (method === "POST" && parts[2] === "finalize")
            return json(await finalizeForm(req, c, parts[1]!));
        }
        if (method === "GET" && route === "notifications")
          return json(
            await notices(
              c,
              z
                .enum(["all", "unread", "read"])
                .parse(url.searchParams.get("filter") ?? "all"),
              url.searchParams.get("cursor"),
            ),
          );
        if (
          method === "POST" &&
          parts[0] === "notifications" &&
          parts[2] === "read" &&
          parts.length === 3
        )
          return json(await read(c, parts[1]!));
        if (method === "POST" && route === "installations") {
          await rate("installation:" + c.userId, 120);
          return json(
            await register(
              c,
              auth.session.id,
              auth.session.installation_id,
              await body(req),
            ),
          );
        }
        if (method === "GET" && route === "installations/status")
          return json(
            await installationStatus(c, auth.session.installation_id),
          );
        if (method === "DELETE" && route === "installations") {
          await prisma.$executeRaw`UPDATE mobile_installations SET revoked_at=now() WHERE id=${auth.session.installation_id}::uuid AND user_id=${c.userId}`;
          return json({ success: true });
        }
        if (method === "POST" && route === "installations/ack")
          return json(
            await acknowledge(c, auth.session.installation_id, await body(req)),
          );
        if (method === "POST" && route === "installations/test") {
          await rateRequest(req, "push-test", c.userId);
          const notice = await notificationTransaction(tx=>tx.notification.create({
            data: {
              organizationId: c.organizationId,
              userId: c.userId,
              type: "OPERATIONAL_ALERT",
              priority: "MEDIUM",
              title: "Teste solicitado",
              message: "Este é o teste solicitado neste aparelho.",
              data: { testInstallationId: auth.session.installation_id },
            },
          }));
          return json({ notificationId: notice.id, status: "QUEUED" });
        }
        if (method === "GET" && route === "events")
          return json(await replay(c, url.searchParams.get("cursor")));
        if (method === "GET" && route === "events/stream") {
            return eventStream({ request: req, initialContext: c, mobile: true, authenticate: () => withAuth(req, async (_, fresh) => fresh) });
        }
        if (method === "POST" && route === "passkeys/register/options") {
          await rateRequest(req, "passkey-register", c.userId);
          return json(await registrationOptions(c));
        }
        if (method === "POST" && route === "passkeys/register/verify") {
          await rateRequest(req, "passkey-register-verify", c.userId);
          return json(await registrationVerify(c, await body(req)));
        }
        if (method === "GET" && parts[0] === "files" && parts.length >= 3) {
          let bytes: Buffer | undefined;
          if (parts[1] === "evidence" && parts.length === 3) {
            const evidence = await prisma.evidenceSubmission.findFirst({
              where: {
                id: parts[2],
                validationStatus: "VALID",
                requirement: { task: taskDetailScope(c) },
              },
              select: { storageKey: true, fileUrl: true, metadata: true },
            });
            if (
              evidence?.fileUrl ||
              (evidence?.storageKey && evidence.storageKey.startsWith("http"))
            ) {
              const metadata = evidence.metadata as {
                name?: string;
                mime?: string;
                size?: number;
              } | null;
              return json({
                directUrl: evidence.fileUrl || evidence.storageKey,
                name: metadata?.name ?? "comprovacao",
                mime: metadata?.mime ?? "application/octet-stream",
                size: metadata?.size ?? 0,
                chunkSize: 1048576,
              });
            }
            if (evidence?.storageKey)
              bytes = await readEvidence(evidence.storageKey).catch(
                () => undefined,
              );
          } else if (parts[1] === "form" && parts.length === 4) {
            const task = await prisma.task.findFirst({
              where: { ...taskDetailScope(c), id: parts[2] },
              select: { formAnswers: true },
            });
            const answers = task?.formAnswers as Record<
              string,
              {
                storageKey?: string;
                fileUrl?: string;
                fileName?: string;
                mimeType?: string;
                fileSize?: number;
              }
            > | null;
            const matched = answers
              ? Object.values(answers).find(
                  (v) => v?.storageKey === parts[3] || v?.fileUrl === parts[3],
                )
              : null;
            if (
              matched?.fileUrl ||
              (matched?.storageKey && matched.storageKey.startsWith("http"))
            ) {
              return json({
                directUrl: matched.fileUrl || matched.storageKey,
                name: matched.fileName ?? "anexo",
                mime: matched.mimeType ?? "application/octet-stream",
                size: matched.fileSize ?? 0,
                chunkSize: 1048576,
              });
            }
            if (matched?.storageKey)
              bytes = await readEvidence(matched.storageKey).catch(
                () => undefined,
              );
          }
          if (!bytes)
            fail(
              404,
              "FILE_UNAVAILABLE",
              "Comprovação removida pela retenção ou indisponível.",
            );
          const part = url.searchParams.get("part");
          if (part === null) {
            const mime =
              bytes[0] === 255 && bytes[1] === 216
                ? "image/jpeg"
                : bytes.toString("ascii", 0, 5) === "%PDF-"
                  ? "application/pdf"
                  : bytes.toString("ascii", 4, 8) === "ftyp"
                    ? "video/mp4"
                    : bytes.toString("ascii", 0, 4) === "RIFF"
                      ? "image/webp"
                      : "image/png";
            return json({ size: bytes.length, chunkSize: 1048576, mime });
          }
          const p = z.coerce.number().int().min(0).max(23).parse(part);
          return new Response(
            new Uint8Array(bytes.subarray(p * 1048576, (p + 1) * 1048576)),
            {
              headers: {
                "Content-Type": "application/octet-stream",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        }
        fail(404, "ENDPOINT_UNKNOWN", "Recurso indisponível.");
      },
      ["session", "logout", "organizations", "organizations/switch"].includes(
        route,
      )
        ? false
        : true,
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return failure(
        new MobileError(400, "INVALID_INPUT", "Revise os dados informados."),
      );
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
