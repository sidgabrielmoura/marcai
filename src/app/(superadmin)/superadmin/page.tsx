import { Prisma } from "@prisma/client";
import { getSuperadminContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import {
  readManualSubscription,
  DEFAULT_PLATFORM_PLANS,
  type PlatformPlanModel,
  getSubscriptionNotice,
} from "@/application/superadmin/manual-subscription";
import {
  SuperadminDashboardClient,
  type GlobalLog,
  type GlobalOrg,
  type GlobalUser,
  type PlatformView,
} from "@/presentation/components/superadmin/superadmin-dashboard-client";
import type { PlatformOverviewData } from "@/presentation/components/superadmin/platform-overview";
import type { MapOrganization } from "@/presentation/components/superadmin/superadmin-map";
import { buildMapOrganizations } from "@/application/superadmin/map-data";
import {
  listPlatformBusinessSegments,
  listPlatformTemplatesBySegment,
  type BusinessSegmentWithCounts,
  type PlatformTemplateModel,
} from "@/application/superadmin/business-segment-service";

const views: PlatformView[] = ["overview", "organizations", "users", "subscriptions", "templates", "usage", "audit", "support", "map"];

const pageSize = 10;

export default async function SuperadminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getSuperadminContext(true);
  if (!actor) return null;
  const params = await searchParams;
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const view = views.includes(one("view") as PlatformView) ? one("view") as PlatformView : "overview";
  const query = one("q").trim().slice(0, 100);
  const status = ["ACTIVE", "SUSPENDED"].includes(one("status")) ? one("status") : "ALL";
  const organizationId = one("organization").slice(0, 128);
  const selectedOrganization = organizationId ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }) : null;
  const orgWhere: Prisma.OrganizationWhereInput = {
    ...(organizationId ? { id: organizationId } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }] } : {}),
  };
  const userWhere: Prisma.UserWhereInput = {
    ...(organizationId ? { memberships: { some: { organizationId } } } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
  };
  const logWhere: Prisma.ActivityLogWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(view === "support" ? { action: "SUPPORT_NOTE_ADDED" } : {}),
    ...(query ? { OR: [{ action: { contains: query, mode: "insensitive" } }, { entityType: { contains: query, mode: "insensitive" } }, { organization: { name: { contains: query, mode: "insensitive" } } }] } : {}),
  };
  const isLogView = view === "audit" || view === "support";
  const [totalOrgs, activeOrgs, suspendedOrgs, totalUsers, totalProcesses, totalTasks, total] = await Promise.all([
    prisma.organization.count(), prisma.organization.count({ where: { status: "ACTIVE" } }), prisma.organization.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count(), prisma.process.count(), prisma.task.count({ where: { deletedAt: null } }),
    view === "users" ? prisma.user.count({ where: userWhere }) : isLogView ? prisma.activityLog.count({ where: logWhere }) : prisma.organization.count({ where: orgWhere }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number(one("page"));
  const page = Math.min(pages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const paging = { skip: (page - 1) * pageSize, take: pageSize };
  let organizations: GlobalOrg[] = [];
  let users: GlobalUser[] = [];
  let logs: GlobalLog[] = [];
  if (view === "users") {
    const rows = await prisma.user.findMany({ where: userWhere, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, name: true, email: true, status: true, platformRole: true, twoFactorEnabled: true, createdAt: true, memberships: { select: { role: true, status: true, organization: { select: { id: true, name: true } } } } } });
    users = rows.map((user) => ({ ...user, createdAt: user.createdAt.toISOString(), memberships: user.memberships.map((member) => ({ organizationId: member.organization.id, organizationName: member.organization.name, role: member.role, status: member.status })) }));
  } else if (isLogView) {
    const rows = await prisma.activityLog.findMany({ where: logWhere, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { organization: { select: { name: true } } } });
    const actorIds = [...new Set(rows.flatMap((row) => row.actorId ? [row.actorId] : []))];
    // Administrative events store user IDs; operational events store membership IDs.
    const [actors, actorMemberships] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
      prisma.organizationMember.findMany({ where: { id: { in: actorIds } }, select: { id: true, user: { select: { name: true } } } }),
    ]);
    const actorNames = new Map([
      ...actors.map((user) => [user.id, user.name] as const),
      ...actorMemberships.map((member) => [member.id, member.user.name] as const),
    ]);
    logs = rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
      return { id: row.id, action: row.action, entityType: row.entityType, entityId: row.entityId, createdAt: row.createdAt.toISOString(), organizationId: row.organizationId, orgName: row.organization.name, actorName: row.actorId ? actorNames.get(row.actorId) ?? "Usuário removido" : "Sistema", note: typeof metadata.note === "string" ? metadata.note : typeof metadata.reason === "string" ? metadata.reason : null, supportStatus: typeof metadata.status === "string" ? metadata.status : null };
    });
  } else {
    const rows = await prisma.organization.findMany({
      where: view === "overview" ? {} : orgWhere,
      ...(view === "overview" ? { skip: 0, take: 4 } : paging),
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: {
        businessSegment: { select: { id: true, name: true } },
        _count: {
          select: {
            members: { where: { status: "ACTIVE", user: { status: "ACTIVE" } } },
            locations: { where: { status: "ACTIVE" } },
            processes: true,
            tasks: { where: { deletedAt: null } },
            executions: true,
          },
        },
      },
    });
    organizations = rows.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt.toISOString(),
      businessSegmentId: org.businessSegmentId,
      businessSegmentName: org.businessSegment?.name || null,
      membersCount: org._count.members,
      locationsCount: org._count.locations,
      processesCount: org._count.processes,
      tasksCount: org._count.tasks,
      executionsCount: org._count.executions,
      subscription: readManualSubscription(org.settings),
    }));
  }

  const allOrganizations = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true, status: true },
    orderBy: { name: "asc" },
  });

  // Overview aggregates cover the entire platform, independently of list filters.
  let overviewData: PlatformOverviewData | undefined;
  if (view === "overview") {
    const overviewRows = await prisma.organization.findMany({
      select: {
        id: true, name: true, settings: true,
        _count: { select: {
          members: { where: { status: "ACTIVE", user: { status: "ACTIVE" } } },
          locations: { where: { status: "ACTIVE" } },
        } },
      },
    });
    const summaries = overviewRows.map((org) => ({ ...org, subscription: readManualSubscription(org.settings) }));
    overviewData = {
      contractedOrganizations: summaries.filter((org) => org.subscription !== null).length,
      expiringOrganizations: summaries.filter((org) => {
        const notice = getSubscriptionNotice(org.subscription);
        return notice && (notice.isExpired || notice.daysRemaining <= 7);
      }).length,
      overLimitOrganizations: summaries.filter((org) =>
        (org.subscription?.memberLimit != null && org._count.members > org.subscription.memberLimit) ||
        (org.subscription?.locationLimit != null && org._count.locations > org.subscription.locationLimit)
      ).length,
      largestOrganizations: summaries.sort((a, b) => b._count.members - a._count.members || a.name.localeCompare(b.name, "pt-BR"))
        .slice(0, 6).map((org) => ({ id: org.id, name: org.name, membersCount: org._count.members })),
    };
  }

  let rawPlans: Array<any> = [];
  if (prisma.platformPlan) {
    try {
      rawPlans = await prisma.platformPlan.findMany({
        orderBy: [{ createdAt: "asc" }],
      });

      if (rawPlans.length === 0) {
        for (const plan of DEFAULT_PLATFORM_PLANS) {
          await prisma.platformPlan.create({ data: plan });
        }
        rawPlans = await prisma.platformPlan.findMany({
          orderBy: [{ createdAt: "asc" }],
        });
      }
    } catch {
      rawPlans = [];
    }
  }

  const platformPlans: PlatformPlanModel[] = rawPlans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    cycle: p.cycle,
    amountCents: p.amountCents,
    memberLimit: p.memberLimit,
    locationLimit: p.locationLimit,
    features: p.features,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  let mapOrganizations: MapOrganization[] = [];
  if (view === "map") {
    const mapRows = await prisma.organization.findMany({
      where: { ...(organizationId ? { id: organizationId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: {
        locations: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, name: true, address: true, status: true, createdAt: true },
        },
        _count: {
          select: {
            members: { where: { status: "ACTIVE", user: { status: "ACTIVE" } } },
            locations: true,
            processes: true,
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    });

    mapOrganizations = buildMapOrganizations(mapRows);
  }

  const businessSegments = await listPlatformBusinessSegments(true);
  const selectedSegmentId = one("segment");
  let platformTemplates: PlatformTemplateModel[] = [];
  let selectedSegment: BusinessSegmentWithCounts | null = null;
  if (selectedSegmentId) {
    selectedSegment = businessSegments.find((s) => s.id === selectedSegmentId) || null;
    if (selectedSegment) {
      platformTemplates = await listPlatformTemplatesBySegment(selectedSegmentId, true);
    }
  }

  return (
    <SuperadminDashboardClient
      userName={actor.userName}
      currentUserId={actor.userId}
      view={view}
      query={query}
      status={status}
      selectedOrganization={selectedOrganization}
      organizationFilter={organizationId}
      metrics={{ totalOrgs, activeOrgs, suspendedOrgs, totalUsers, totalProcesses, totalTasks }}
      organizations={organizations}
      users={users}
      logs={logs}
      allOrganizations={allOrganizations}
      platformPlans={platformPlans}
      overviewData={overviewData}
      mapOrganizations={mapOrganizations}
      businessSegments={businessSegments}
      platformTemplates={platformTemplates}
      selectedSegmentId={selectedSegmentId}
      selectedSegment={selectedSegment}
      pagination={{ page, pages, total, pageSize }}
    />
  );
}
