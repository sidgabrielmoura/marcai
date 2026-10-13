import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { prisma } from "@/infrastructure/database/prisma";
import { readEvidence } from "@/infrastructure/storage/evidence-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; key: string }> }
) {
  const c = await getAuthenticatedContext(false);
  if (!c) return new Response(null, { status: 401 });
  const { id, key } = await params;

  // Proteção contra path traversal: valida que é um UUID padrão
  if (!/^[a-f0-9-]{36}$/.test(key)) {
    return new Response(null, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: {
      id,
      ...taskScope(c),
      deletedAt: null,
    },
    select: { formAnswers: true },
  });
  if (!task) return new Response(null, { status: 404 });

  // Validação: a chave deve pertencer aos formAnswers desta tarefa
  const answers = (task.formAnswers || {}) as Record<string, any>;
  let foundFileName = "arquivo";
  let foundMime = "application/octet-stream";
  let found = false;

  for (const val of Object.values(answers)) {
    if (val && typeof val === "object" && val.storageKey === key) {
      found = true;
      foundFileName = val.fileName || "arquivo";
      foundMime = val.mimeType || "application/octet-stream";
      break;
    }
  }

  if (!found) return new Response(null, { status: 403 });

  try {
    const bytes = await readEvidence(key);
    return new Response(bytes, {
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
