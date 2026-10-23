"use server";
import { revalidatePath } from "@/infrastructure/realtime/revalidate";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import {
  changeTemplateArchive, duplicateReusableTemplate, listTemplateLibrary, processTemplateSourceOptions,
  saveProcessAsReusableTemplate, saveReusableTemplate, TemplateInputError,
} from "@/application/templates/template-library";

async function run(operation: (context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>) => Promise<{ id: string; revision?: number }>) {
  const context = await getAuthenticatedContext(false);
  if (!context) return { error: "Sua sessão expirou. Entre novamente." };
  try {
    const data = await operation(context);
    revalidatePath("/management/templates");
    revalidatePath("/management/templates/" + data.id + "/edit");
    revalidatePath("/management/processes");
    return { success: true, data };
  } catch (error) {
    return { error: error instanceof TemplateInputError ? error.message : "Não foi possível salvar. Seu conteúdo permanece nesta tela; tente novamente." };
  }
}
export async function saveTemplateAction(input: unknown) { return run(c => saveReusableTemplate(c, input)); }
export async function duplicateTemplateAction(reference: string) { return run(c => duplicateReusableTemplate(c, reference)); }
export async function archiveTemplateAction(id: string, revision: number, archive: boolean) { return run(c => changeTemplateArchive(c, id, revision, archive)); }
export async function saveProcessTemplateAction(input: unknown) { return run(c => saveProcessAsReusableTemplate(c, input)); }
export async function getTemplateLibraryAction() {
  const context = await getAuthenticatedContext(false);
  if (!context) return { error: "Sua sessão expirou." };
  try { return { data: await listTemplateLibrary(context, false, true) }; }
  catch { return { error: "Não foi possível carregar os templates. Tente novamente." }; }
}
export async function getProcessTemplateOptionsAction(processId: string) {
  const context = await getAuthenticatedContext(false);
  if (!context) return { error: "Sua sessão expirou." };
  try { return { data: await processTemplateSourceOptions(context, processId) }; }
  catch (error) { return { error: error instanceof TemplateInputError ? error.message : "Não foi possível carregar o processo." }; }
}
