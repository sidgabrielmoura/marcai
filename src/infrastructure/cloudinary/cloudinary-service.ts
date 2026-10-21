import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

export interface SignUploadOptions {
  folder?: string;
  publicId?: string;
  tags?: string[];
  resourceType?: "image" | "video" | "raw" | "auto";
  allowedFormats?: string[];
  transformation?: string;
  context?: Record<string, string>;
  eager?: string;
  overwrite?: boolean;
}

export interface SignedUploadCredentials {
  uploadUrl: string;
  apiKey: string;
  cloudName: string;
  timestamp: number;
  signature: string;
  folder?: string;
  publicId?: string;
  tags?: string;
  resourceType: string;
  uploadParams: Record<string, string | number>;
}

export interface CloudinaryAssetMetadata {
  publicId: string;
  secureUrl: string;
  url: string;
  format?: string;
  resourceType: string;
  bytes?: number;
  width?: number;
  height?: number;
  originalFilename?: string;
  createdAt?: string;
}

/**
 * Retorna as credenciais configuradas do Cloudinary
 */
export function getCloudinaryConfig() {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Configurações do Cloudinary ausentes no ambiente (.env).");
  }

  return { cloudName, apiKey, apiSecret };
}

/**
 * Gera a assinatura oficial criptográfica do Cloudinary para uploads diretos
 */
export function createUploadSignature(
  options: SignUploadOptions = {},
): SignedUploadCredentials {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const resourceType = options.resourceType || "auto";

  // Parâmetros a serem assinados (ordenados alfabeticamente)
  const paramsToSign: Record<string, string | number> = {
    timestamp,
  };

  if (options.folder) {
    paramsToSign.folder = options.folder;
  }

  if (options.publicId) {
    paramsToSign.public_id = options.publicId;
  }
  if (options.overwrite !== undefined)
    paramsToSign.overwrite = String(options.overwrite);

  if (options.tags && options.tags.length > 0) {
    paramsToSign.tags = options.tags.join(",");
  }

  if (options.allowedFormats && options.allowedFormats.length > 0) {
    paramsToSign.allowed_formats = options.allowedFormats.join(",");
  }

  if (options.transformation) {
    paramsToSign.transformation = options.transformation;
  }

  if (options.eager) {
    paramsToSign.eager = options.eager;
  }

  if (options.context && Object.keys(options.context).length > 0) {
    paramsToSign.context = Object.entries(options.context)
      .map(([k, v]) => `${k}=${v}`)
      .join("|");
  }

  // Ordena alfabeticamente as chaves para a assinatura canônica
  const sortedKeys = Object.keys(paramsToSign).sort();
  const stringToSign = sortedKeys
    .map((k) => `${k}=${paramsToSign[k]}`)
    .join("&");

  // Assinatura SHA-1 oficial do Cloudinary
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  return {
    uploadUrl,
    apiKey,
    cloudName,
    timestamp,
    signature,
    folder: options.folder,
    publicId: options.publicId,
    tags: paramsToSign.tags as string | undefined,
    resourceType,
    uploadParams: {
      ...paramsToSign,
      api_key: apiKey,
      signature,
    },
  };
}

/**
 * Cria credenciais de upload seguras e com isolamento multitenant
 */
export function createTenantUploadCredentials(params: {
  organizationId: string;
  scope: "evidence" | "form" | "avatar" | "logo" | "general";
  taskId?: string;
  requirementId?: string;
  fieldId?: string;
  fileName?: string;
  publicId?: string;
  resourceType?: "image" | "video" | "raw";
  allowedFormats?: string[];
}): SignedUploadCredentials {
  const { organizationId, scope, taskId, requirementId, fieldId } = params;

  // Isolamento estrito de diretórios por tenant
  let folder = `tarefai/orgs/${organizationId}/${scope}`;
  if (taskId) {
    folder = `tarefai/orgs/${organizationId}/tasks/${taskId}/${scope}`;
  }

  const tags = [`org_${organizationId}`, `scope_${scope}`];
  if (taskId) tags.push(`task_${taskId}`);
  if (requirementId) tags.push(`req_${requirementId}`);
  if (fieldId) tags.push(`field_${fieldId}`);

  return createUploadSignature({
    folder,
    tags,
    resourceType: params.resourceType ?? "auto",
    publicId: params.publicId ?? crypto.randomUUID(),
    allowedFormats: params.allowedFormats,
    overwrite: false,
  });
}

/**
 * Valida se uma URL pertence estritamente ao Cloudinary oficial da organização
 */
export function isAuthorizedCloudinaryUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "res.cloudinary.com" ||
      parsed.username ||
      parsed.password
    )
      return false;
    // O caminho deve conter o cloudName oficial
    const segments = parsed.pathname.split("/").filter(Boolean);
    return (
      segments[0] === cloudName &&
      ["image", "video", "raw"].includes(segments[1]) &&
      segments[2] === "upload"
    );
  } catch {
    return false;
  }
}

/** Read trusted asset metadata from Cloudinary, rather than accepting client claims. */
export async function inspectCloudinaryAsset(
  publicId: string,
  resourceType: "image" | "video" | "raw",
) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const asset = await cloudinary.api.resource(publicId, {
    resource_type: resourceType,
    type: "upload",
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    timeout: 10_000,
  });
  return {
    publicId: String(asset.public_id),
    fileUrl: String(asset.secure_url),
    fileSize: Number(asset.bytes),
    format: String(asset.format ?? publicId.split(".").at(-1) ?? ""),
    resourceType: String(asset.resource_type),
  };
}

/**
 * Exclui um asset do Cloudinary diretamente pela API de destruição
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
): Promise<boolean> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);

  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto
    .createHash("sha1")
    .update(stringToSign)
    .digest("hex");

  const formData = new URLSearchParams();
  formData.append("public_id", publicId);
  formData.append("timestamp", String(timestamp));
  formData.append("api_key", apiKey);
  formData.append("signature", signature);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const result = await response.json();
    return result.result === "ok";
  } catch (err) {
    console.error("Falha ao excluir asset do Cloudinary:", err);
    return false;
  }
}

/**
 * Gera URL de visualização otimizada com transformações automáticas (f_auto, q_auto, thumbnails)
 */
export function getOptimizedCloudinaryUrl(
  publicIdOrUrl: string,
  options: {
    width?: number;
    height?: number;
    crop?: "fill" | "limit" | "thumb" | "fit" | "scale";
    quality?: "auto" | number;
    format?: "auto" | "webp" | "jpg" | "png";
  } = {},
): string {
  if (!publicIdOrUrl) return "";

  // Se já for uma URL do Cloudinary com /upload/
  if (
    publicIdOrUrl.startsWith("http://") ||
    publicIdOrUrl.startsWith("https://")
  ) {
    const uploadIndex = publicIdOrUrl.indexOf("/upload/");
    if (uploadIndex === -1) return publicIdOrUrl;

    const transformations: string[] = [];
    transformations.push(`f_${options.format || "auto"}`);
    transformations.push(`q_${options.quality || "auto"}`);

    if (options.width) transformations.push(`w_${options.width}`);
    if (options.height) transformations.push(`h_${options.height}`);
    if (options.crop) transformations.push(`c_${options.crop}`);

    const transformStr = transformations.join(",");
    const prefix = publicIdOrUrl.slice(0, uploadIndex + "/upload/".length);
    const suffix = publicIdOrUrl.slice(uploadIndex + "/upload/".length);

    // Evita duplicar transformações se já houver
    if (
      suffix.startsWith("f_") ||
      suffix.startsWith("w_") ||
      suffix.startsWith("c_")
    ) {
      return publicIdOrUrl;
    }

    return `${prefix}${transformStr}/${suffix}`;
  }

  // Se for apenas public_id
  const { cloudName } = getCloudinaryConfig();
  const transformations: string[] = [
    `f_${options.format || "auto"}`,
    `q_${options.quality || "auto"}`,
  ];
  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.crop) transformations.push(`c_${options.crop}`);

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformations.join(",")}/${publicIdOrUrl}`;
}
