import { getAuthenticatedContext } from "@/application/security/auth-context";

import { prisma } from "@/infrastructure/database/prisma";
import { readEvidence } from "@/infrastructure/storage/evidence-storage";
import { isAuthorizedCloudinaryUrl } from "@/infrastructure/cloudinary/cloudinary-service";
import { taskDetailScope } from "@/application/mobile/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; key: string }> }
) {
  const c = await getAuthenticatedContext(false);
  if (!c) return new Response(null, { status: 401 });
  const { id, key } = await params;

  // The opaque key must first match a persisted answer in the authorized task.
  if (!key || key.length > 2048) {
    return new Response(null, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: {
      id,
      ...taskDetailScope(c),
    },
    select: { formAnswers: true },
  });
  if (!task) return new Response(null, { status: 404 });

  // Validação: a chave deve pertencer aos formAnswers desta tarefa
  const answers = (task.formAnswers || {}) as Record<string, any>;
  let foundFileName = "arquivo";
  let foundMime = "application/octet-stream";
  let found = false;
  let fileUrl: string | null = null;

  for (const val of Object.values(answers)) {
    if (val && typeof val === "object" && val.storageKey === key) {
      found = true;
      foundFileName = val.fileName || "arquivo";
      foundMime = val.mimeType || "application/octet-stream";
      fileUrl = typeof val.fileUrl === "string" ? val.fileUrl : null;
      break;
    }
  }

  if (!found) return new Response(null, { status: 403 });
  if (fileUrl) return isAuthorizedCloudinaryUrl(fileUrl)
    ? new Response(null, { status: 307, headers: { Location: fileUrl, "Cache-Control": "private, no-store" } })
    : new Response(null, { status: 404 });
  if (!/^[a-f0-9-]{36}$/.test(key)) return new Response(null, { status: 404 });

  try {
    const bytes = await readEvidence(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": foundMime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(foundFileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
