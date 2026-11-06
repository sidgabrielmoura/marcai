import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const email = "demo-suspensa@tarefai.test";
  const slug = "academia-forca-total";
  const orgName = "Academia Força Total";
  const password = "Password@123";
  const pin = "123456";

  const passwordHash = await bcrypt.hash(password, 10);
  const pinHash = await bcrypt.hash(pin, 10);

  const org = await prisma.organization.upsert({
    where: { slug },
    update: { name: orgName, status: "SUSPENDED" },
    create: { name: orgName, slug, status: "SUSPENDED" },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "Carlos Gerente", passwordHash, status: "ACTIVE" },
    create: { name: "Carlos Gerente", email, passwordHash, status: "ACTIVE" },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    update: {
      role: "MANAGER",
      status: "ACTIVE",
      employeeCode: "1001",
      pinHash,
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "MANAGER",
      status: "ACTIVE",
      employeeCode: "1001",
      pinHash,
    },
  });

  console.log("Seeded demo suspended organization and user successfully!");
}

main().catch(console.error);
