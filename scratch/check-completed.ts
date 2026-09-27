import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function run() {
  const tasks = await prisma.task.findMany({
    where: { status: "COMPLETED" },
    select: {
      id: true,
      title: true,
      completedAt: true,
      assignments: { select: { memberId: true } },
    },
  });
  console.log(JSON.stringify(tasks, null, 2));
}

run().finally(() => prisma.$disconnect());
