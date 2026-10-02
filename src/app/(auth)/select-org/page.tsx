import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/security/session";
import { prisma } from "@/infrastructure/database/prisma";
import {
  SelectOrgClient,
  type SelectOrgMembership,
} from "@/presentation/components/auth/select-org-client";

export const metadata = {
  title: "Selecionar Organização | Marcaí",
  description: "Escolha o espaço de trabalho em que deseja operar.",
};

export default async function SelectOrganizationPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      memberships: {
        where: {
          status: "ACTIVE",
          organization: { status: "ACTIVE" },
        },
        select: {
          id: true,
          role: true,
          employeeCode: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              _count: {
                select: {
                  members: { where: { status: "ACTIVE" } },
                  locations: true,
                },
              },
            },
          },
        },
        orderBy: { organization: { name: "asc" } },
      },
    },
  });

  if (!user || user.status !== "ACTIVE" || user.memberships.length === 0) {
    redirect("/login");
  }

  const memberships: SelectOrgMembership[] = user.memberships.map((m) => ({
    id: m.id,
    role: m.role,
    employeeCode: m.employeeCode,
    organization: {
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      logoUrl: m.organization.logoUrl,
      memberCount: m.organization._count.members,
      locationCount: m.organization._count.locations,
    },
    isActive: m.organization.id === session.activeOrgId,
  }));

  const currentMembership = memberships.find((m) => m.isActive);
  const currentOrgName = currentMembership?.organization.name ?? null;

  return (
    <SelectOrgClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
      }}
      currentOrgId={session.activeOrgId ?? null}
      currentOrgName={currentOrgName}
      currentRole={session.role ?? null}
      memberships={memberships}
    />
  );
}
