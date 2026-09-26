import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pool;
}

const adapter = new PrismaPg(pool);

// Invalida cliente em memória se estiver desatualizado em relação aos modelos recentes (ex: taskDependency)
if (globalForPrisma.prisma && !("taskDependency" in globalForPrisma.prisma)) {
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
