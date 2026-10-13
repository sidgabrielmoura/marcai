import { getManagementContext } from "@/application/security/auth-context";
import Link from "next/link";
import { canManageTemplates, resolvePublishedTemplate } from "@/application/templates/template-library";
import { TemplatePicker } from "@/presentation/components/templates/template-picker";
import { TemplateProcessStarter } from "@/presentation/components/templates/template-process-starter";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessEditorWizard } from "@/presentation/components/processes/process-editor-wizard";
import { processEditorOptions } from "@/application/processes/editor-options";

export default async function NewProcessPage({ searchParams }: { searchParams: Promise<{ template?: string; choose?: string }> }) {
  const context = await getManagementContext();
  if (!context) return null;

  const options = await processEditorOptions(context);
  const query = await searchParams;
  const template = query.template ? await resolvePublishedTemplate(context, query.template) : null;

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      {query.template ? template ? <TemplateProcessStarter template={template} {...options} /> : <div className="page-stack"><h1 className="text-xl font-semibold">Template indisponível</h1><p className="text-sm text-muted-foreground">A publicação foi atualizada ou arquivada. Escolha um template da biblioteca.</p><Link href="/management/templates" className="text-brand-900 underline">Abrir biblioteca</Link></div> : <><div className="mb-4"><TemplatePicker initialOpen={query.choose === "template"} canManage={canManageTemplates(context)} /></div><ProcessEditorWizard {...options} /></>}
    </ManagementShell>
  );
}
