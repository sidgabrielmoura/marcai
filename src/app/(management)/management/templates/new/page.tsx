import { notFound } from "next/navigation";
import { getManagementContext } from "@/application/security/auth-context";
import { canManageTemplates } from "@/application/templates/template-library";
import { emptyReusableTemplate } from "@/domain/rules/reusable-template-definition";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ReusableTemplateEditor } from "@/presentation/components/templates/template-editor";

export default async function NewTemplatePage() {
  const c = await getManagementContext(); if (!c) return null; if (!canManageTemplates(c)) notFound();
  return <ManagementShell userName={c.userName} orgName={c.organizationName} role={c.role}><ReusableTemplateEditor initial={emptyReusableTemplate()} /></ManagementShell>;
}
