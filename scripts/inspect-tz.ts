import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const org = await prisma.organization.findUnique({
    where: { slug: "barbearia-sg" },
    include: {
      locations: true,
      processes: {
        include: {
          routines: true,
          executions: {
            include: {
              tasks: {
                select: {
                  id: true,
                  title: true,
                  scheduledDate: true,
                  deadlineAt: true,
                  slaDueAt: true,
                  startedAt: true,
                  completedAt: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          origin: true,
          scheduledDate: true,
          deadlineAt: true,
          slaDueAt: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  });

  console.log(JSON.stringify(org, null, 2));
}

main().finally(() => prisma.$disconnect());
