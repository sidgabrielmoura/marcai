import { z } from "zod";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { signEmployeeUpload } from "@/application/mobile/cloudinary-uploads";
import { MobileError } from "@/application/mobile/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(false);
  if (!context)
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  try {
    const credentials = await signEmployeeUpload(context, await request.json());
    return Response.json(
      { success: true, credentials },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof MobileError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Dados de upload inválidos." },
        { status: 400 },
      );
    return Response.json(
      { error: "Não foi possível preparar o upload. Tente novamente." },
      { status: 503 },
    );
  }
}
