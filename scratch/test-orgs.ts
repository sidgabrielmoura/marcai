import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      name: true,
      slug: true,
      locations: { select: { name: true, address: true } }
    }
  });
  console.log("=== EMPRESAS E SUAS UNIDADES NO BANCO ===");
  for (const o of orgs) {
    console.log(`[${o.name}] (${o.locations.length} unidades):`);
    for (const l of o.locations) {
      console.log(`   - ${l.name}: ${l.address}`);
    }
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
