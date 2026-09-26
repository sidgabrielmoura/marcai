import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const processes = await prisma.process.findMany({
    include: {
      location: true,
      routines: true,
    },
  });

  console.log(`=== PROCESSES (${processes.length}) ===`);
  for (const p of processes) {
    console.log(`- ${p.name} (${p.id}) | Status: ${p.status} | Location: ${p.location?.name}`);
  }
}

main().finally(() => prisma.$disconnect());
