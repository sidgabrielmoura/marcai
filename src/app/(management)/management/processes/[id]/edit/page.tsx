import { getManagementContext } from "@/application/security/auth-context";
import { processScope } from "@/application/security/operational-scope";
import { processEditorOptions } from "@/application/processes/editor-options";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { readSchedule } from "@/domain/rules/schedule";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessEditorWizard } from "@/presentation/components/processes/process-editor-wizard";
import { notFound } from "next/navigation";
export default async function EditProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getManagementContext(), { id } = await params;
  const process = await prisma.process.findFirst({ where: { ...processScope(context), id }, include: { sourceTemplateVersion: true, routines: { orderBy: { createdAt: "asc" } } } });
  if (!process || process.status === "ARCHIVED") notFound();
  const definition = readProcessDefinition(process.sourceTemplateVersion?.definition);
  if (context.role === "MANAGER" && definition?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) notFound();
  const options = await processEditorOptions(context);
  const routine = process.routines.find(r => r.status === "ACTIVE") ?? process.routines[0];
  const base = definition ?? { name: process.name, description: process.description ?? "", locationId: process.locationId ?? "", criticality: process.criticality, validFrom: process.validFrom?.toISOString().slice(0, 10) ?? "", validUntil: process.validUntil?.toISOString().slice(0, 10) ?? "", tasks: [], schedule: null };
  const initial = { ...base, schedule: routine?.status === "ACTIVE" ? readSchedule(routine.recurrenceRule) : null };
  return <ManagementShell userName={context.userName} orgName={context.organizationName} role={context.role}><ProcessEditorWizard {...options} initial={initial} processId={id} routineId={routine?.id} routinesCount={process.routines.length} /></ManagementShell>;
}
