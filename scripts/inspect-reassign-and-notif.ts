import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  console.log("=== INSPECTION START ===");

  const tasks = await prisma.task.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" },
    include: {
      assignments: {
        include: {
          member: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      },
      dependencies: true,
      dependentTasks: true,
    },
  });

  console.log("\n--- RECENT 5 TASKS ---");
  for (const t of tasks) {
    console.log({
      id: t.id,
      title: t.title,
      status: t.status,
      origin: t.origin,
      managementBlocked: t.managementBlocked,
      managementBlockReason: t.managementBlockReason,
      deadlineAt: t.deadlineAt,
      slaDueAt: t.slaDueAt,
      scheduledDate: t.scheduledDate,
      startedAt: t.startedAt,
      updatedAt: t.updatedAt,
      assignees: t.assignments.map((a) => ({
        memberId: a.memberId,
        userName: a.member?.user?.name,
        userEmail: a.member?.user?.email,
        isPrimary: a.isPrimary,
      })),
      dependenciesCount: t.dependencies.length,
    });
  }

  // 2. Recent Notifications
  const notifs = await prisma.notification.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  console.log("\n--- RECENT 5 NOTIFICATIONS ---");
  console.log(notifs);

  // 3. Native Installations (mobile_installations)
  const installations = await prisma.nativeInstallation.findMany({
    take: 10,
    orderBy: { lastSyncAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });
  console.log("\n--- NATIVE INSTALLATIONS (mobile_installations) ---");
  console.log(
    installations.map((i) => ({
      id: i.id,
      userName: i.user?.name,
      userEmail: i.user?.email,
      platform: i.platform,
      permission: i.permission,
      tokenPrefix: i.token ? i.token.substring(0, 15) + "..." : null,
      lastSyncAt: i.lastSyncAt,
      revokedAt: i.revokedAt,
    }))
  );

  // 4. User Device Tokens
  const deviceTokens = await prisma.userDeviceToken.findMany({
    take: 10,
    orderBy: { updatedAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });
  console.log("\n--- USER DEVICE TOKENS ---");
  console.log(
    deviceTokens.map((d) => ({
      id: d.id,
      userName: d.user?.name,
      userEmail: d.user?.email,
      platform: d.platform,
      tokenPrefix: d.token ? d.token.substring(0, 15) + "..." : null,
      updatedAt: d.updatedAt,
    }))
  );

  // 5. Recent Mobile Push Deliveries (if table exists)
  try {
    const deliveries = await (prisma as any).$queryRawUnsafe(
      `SELECT * FROM mobile_push_deliveries ORDER BY created_at DESC LIMIT 5`
    );
    console.log("\n--- RECENT MOBILE PUSH DELIVERIES ---");
    console.log(deliveries);
  } catch (err: any) {
    console.log("mobile_push_deliveries query error:", err.message);
  }

  console.log("=== INSPECTION END ===");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
