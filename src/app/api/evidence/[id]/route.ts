import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { prisma } from "@/infrastructure/database/prisma";
import { readEvidence } from "@/infrastructure/storage/evidence-storage";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await getAuthenticatedContext(false); if (!c) return new Response(null, { status: 401 });
  const { id } = await params;
  const submission = await prisma.evidenceSubmission.findFirst({ where: { id, validationStatus: "VALID", requirement: { task: { ...taskScope(c), deletedAt: null } } } });
  if (!submission?.storageKey) return new Response(null, { status: 404 });
  try { const bytes = await readEvidence(submission.storageKey); return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(submission.value || "evidencia")}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); } catch { return new Response(null, { status: 404 }); }
}
