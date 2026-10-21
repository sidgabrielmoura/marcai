import { redirect } from "next/navigation";
import { getSuperadminContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { AppShell } from "@/presentation/components/shared/app-shell";
import { PageHeader } from "@/presentation/components/shared/page-header";
import { PlatformPage } from "@/presentation/components/superadmin/superadmin-ui";
import { SuperadminTemplateEditor } from "@/presentation/components/superadmin/superadmin-template-editor";
import {
  DEFAULT_BUSINESS_SEGMENTS,
  ensureDefaultSegmentsAndTemplates,
} from "@/application/superadmin/business-segment-service";
import { emptyReusableTemplate } from "@/domain/rules/reusable-template-definition";

export default async function NewSuperadminTemplatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getSuperadminContext(true);
  if (!actor) return null;

  await ensureDefaultSegmentsAndTemplates();

  const params = await searchParams;
  const segmentId =
    typeof params.segmentId === "string" ? params.segmentId.trim() : "";

  let segment = segmentId
    ? await prisma.platformBusinessSegment.findUnique({
        where: { id: segmentId },
        select: { id: true, name: true, slug: true },
      })
    : null;

  if (!segment) {
    segment = await prisma.platformBusinessSegment.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
  }

  if (!segment) {
    redirect("/superadmin?view=templates");
  }

  const initialDefinition = emptyReusableTemplate();
  const matchedDef = DEFAULT_BUSINESS_SEGMENTS.find(
    (s) => s.slug === segment.slug
  );
  if (matchedDef) {
    initialDefinition.jobKey = matchedDef.catalogJobKey as any;
  }

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
          backHref={`/superadmin?view=templates&segment=${segment.id}`}
          backLabel="Voltar para templates"
          title="Novo template pronto"
          subtitle={`Segmento: ${segment.name} — Defina os papéis, etapas e rotinas do modelo.`}
        />
        <SuperadminTemplateEditor
          segment={segment}
          initial={initialDefinition}
        />
      </PlatformPage>
    </AppShell>
  );
}
