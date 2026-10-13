import { getManagementContext } from "@/application/security/auth-context";
import { canManageTemplates, listTemplateLibrary } from "@/application/templates/template-library";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { TemplateLibraryClient } from "@/presentation/components/templates/template-library-client";

export default async function TemplatesPage() {
  const c = await getManagementContext(); if (!c) return null;
  const [items, publishedItems] = await Promise.all([listTemplateLibrary(c, true), listTemplateLibrary(c, false, true)]);
  return <ManagementShell userName={c.userName} orgName={c.organizationName} role={c.role}><TemplateLibraryClient items={items} publishedItems={publishedItems} canManage={canManageTemplates(c)} /></ManagementShell>;
}
