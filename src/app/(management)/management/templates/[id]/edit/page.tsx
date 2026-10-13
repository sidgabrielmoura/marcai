import { notFound } from "next/navigation";
import { getManagementContext } from "@/application/security/auth-context";
import { templateForEditor } from "@/application/templates/template-library";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ReusableTemplateEditor } from "@/presentation/components/templates/template-editor";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getManagementContext(); if (!c) return null; const { id } = await params;
  const t = await templateForEditor(c, id); if (!t || t.status === "ARCHIVED") notFound();
  return <ManagementShell userName={c.userName} orgName={c.organizationName} role={c.role}><ReusableTemplateEditor templateId={t.id} revision={t.revision} initial={t.definition} /></ManagementShell>;
}
