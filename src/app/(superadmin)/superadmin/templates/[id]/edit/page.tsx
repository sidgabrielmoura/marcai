import { notFound } from "next/navigation";
import { getSuperadminContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { AppShell } from "@/presentation/components/shared/app-shell";
import { PageHeader } from "@/presentation/components/shared/page-header";
import { PlatformPage } from "@/presentation/components/superadmin/superadmin-ui";
import { SuperadminTemplateEditor } from "@/presentation/components/superadmin/superadmin-template-editor";
import {
  emptyReusableTemplate,
  type ReusableTemplateDefinition,
} from "@/domain/rules/reusable-template-definition";

export default async function EditSuperadminTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getSuperadminContext(true);
  if (!actor) return null;

  const { id } = await params;
  const template = await prisma.platformTemplate.findUnique({
    where: { id },
    include: {
      segment: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  if (!template) {
    notFound();
  }

  const rawDef = template.definition as any;
  const definition: ReusableTemplateDefinition =
    rawDef && typeof rawDef === "object" && Array.isArray(rawDef.tasks)
      ? {
          schemaVersion: 1,
          name: template.name || rawDef.name || "",
          description: template.description || rawDef.description || "",
          jobKey: rawDef.jobKey || "CUSTOM",
          criticality: rawDef.criticality || "MEDIUM",
          teamSlots:
            Array.isArray(rawDef.teamSlots) && rawDef.teamSlots.length > 0
              ? rawDef.teamSlots
              : [{ id: "team-1", label: "Operação" }],
          memberSlots:
            Array.isArray(rawDef.memberSlots) && rawDef.memberSlots.length > 0
              ? rawDef.memberSlots
              : [
                  { id: "executor-1", label: "Executor", kind: "EXECUTOR" },
                  { id: "approver-1", label: "Gestor", kind: "APPROVER" },
                ],
          tasks: rawDef.tasks || [],
          schedule: rawDef.schedule || null,
        }
      : {
          ...emptyReusableTemplate(),
          name: template.name,
          description: template.description || "",
        };

  return (
    <AppShell
      userName={actor.userName}
      orgName="Plataforma Tarefaí"
      role="SUPERADMIN"
      mode="platform"
      activeView="templates"
    >
      <PlatformPage>
        <PageHeader
          backHref={`/superadmin?view=templates&segment=${template.segmentId}`}
          backLabel="Voltar para templates"
          title={`Editar template: ${template.name}`}
          subtitle={`Segmento: ${template.segment.name} · Versão v${template.version}`}
        />
        <SuperadminTemplateEditor
          segment={template.segment}
          templateId={template.id}
          initial={definition}
        />
      </PlatformPage>
    </AppShell>
  );
}
