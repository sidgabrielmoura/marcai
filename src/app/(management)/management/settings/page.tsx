import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { SettingsClient } from "@/presentation/components/organization/settings-client";

export const maxDuration = 60;

export default async function ManagementSettingsPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const org = await prisma.organization.findUnique({
    where: { id: context.organizationId },
  });

  if (!org) return null;

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <SettingsClient
        organization={{
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          settings: (() => { const {waha, whatsappAlerts, ...safe} = (org.settings || {}) as Record<string,unknown>; return context.role === "OWNER" ? {...safe,whatsappAlerts} : safe; })(),
        }}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
