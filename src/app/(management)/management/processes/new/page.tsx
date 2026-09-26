import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessEditorWizard } from "@/presentation/components/processes/process-editor-wizard";
import { processEditorOptions } from "@/application/processes/editor-options";

export default async function NewProcessPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const options = await processEditorOptions(context);

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ProcessEditorWizard {...options} />
    </ManagementShell>
  );
}
