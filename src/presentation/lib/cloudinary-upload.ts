export interface DirectUploadOptions {
  file: File | Blob;
  fileName?: string;
  scope: "evidence" | "form";
  roundId: string;
  taskId?: string;
  requirementId?: string;
  fieldId?: string;
  onProgress?: (progress: number) => void;
}

export interface DirectUploadResult {
  fileUrl: string;
  publicId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  resourceType: string;
  format?: string;
  width?: number;
  height?: number;
}

/**
 * Realiza o upload direto do navegador para o Cloudinary via assinatura pré-autenticada,
 * garantindo que nenhum byte binário pesado passe pelo Next.js (evitando erro 413).
 */
export async function uploadDirectToCloudinary(
  options: DirectUploadOptions,
): Promise<DirectUploadResult> {
  const fileName =
    options.fileName ||
    (options.file instanceof File ? options.file.name : "arquivo");
  const fileType = options.file.type || "application/octet-stream";
  const fileSize = options.file.size;

  // 1. Solicita parâmetros assinados ao backend
  const signResponse = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: options.scope,
      roundId: options.roundId,
      taskId: options.taskId,
      requirementId: options.requirementId,
      fieldId: options.fieldId,
      fileName,
      fileType,
      fileSize,
    }),
  });

  const signResult = await signResponse.json().catch(() => ({}));

  if (!signResponse.ok || signResult.error || !signResult.credentials) {
    throw new Error(
      signResult.error || "Falha ao obter credenciais de upload.",
    );
  }

  const { uploadUrl, uploadParams } = signResult.credentials;

  // 2. Prepara o FormData para envio direto ao Cloudinary
  const formData = new FormData();
  formData.append("file", options.file, fileName);
  for (const [name, value] of Object.entries(uploadParams))
    formData.append(name, String(value));

  // 3. Executa o POST diretamente para a API do Cloudinary
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.error?.message ||
      `Erro no upload direto (status ${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();

  return {
    fileUrl: data.secure_url || data.url,
    publicId: data.public_id,
    fileName,
    fileSize: data.bytes || fileSize,
    mimeType: fileType,
    resourceType: data.resource_type || "auto",
    format: data.format,
    width: data.width,
    height: data.height,
  };
}
