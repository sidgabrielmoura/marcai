import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskDetailScope } from "@/application/mobile/data";
import { prisma } from "@/infrastructure/database/prisma";
import { readEvidence } from "@/infrastructure/storage/evidence-storage";
import { isAuthorizedCloudinaryUrl } from "@/infrastructure/cloudinary/cloudinary-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthenticatedContext(false);
  if (!context) return new Response(null, { status: 401 });
  const { id } = await params;
  const submission = await prisma.evidenceSubmission.findFirst({
    where: {
      id,
      validationStatus: "VALID",
      requirement: { task: taskDetailScope(context) },
    },
  });
  if (!submission?.storageKey) return new Response(null, { status: 404 });
  const url =
    submission.fileUrl ??
    (submission.storageKey.startsWith("https:") ? submission.storageKey : null);
  if (url)
    return isAuthorizedCloudinaryUrl(url)
      ? Response.redirect(url, 307)
      : new Response(null, { status: 404 });
  try {
    const bytes = await readEvidence(submission.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(submission.value || "evidencia")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
