import type { Prisma } from "@prisma/client";
export async function notifyManagers(tx: Prisma.TransactionClient, task: { organizationId: string; locationId: string | null; teamId: string | null; id: string }, title: string, message: string) {
  const members = await tx.organizationMember.findMany({ where: { organizationId: task.organizationId, status: "ACTIVE", OR: [{ role: { in: ["OWNER", "ADMIN"] } }, { role: "MANAGER", locationAccesses: { some: { locationId: task.locationId ?? "__none__", AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] } }, teamMemberships: { some: { teamId: task.teamId ?? "__none__" } } }] }, select: { userId: true } });
  if (members.length) await tx.notification.createMany({ data: members.map(m => ({ organizationId: task.organizationId, userId: m.userId, type: "OPERATIONAL_ALERT", priority: "HIGH" as const, title, message, data: { taskId: task.id } })) });
}
