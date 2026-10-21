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
    // PrismaPg normalizes timestamptz results as UTC; keep every connection in UTC.
    // Operational display and business rules still use each location timezone.
    options: "-c timezone=UTC",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pool;
}

const adapter = new PrismaPg(pool);

// Invalida o cliente em memória quando faltam modelos adicionados ao projeto.
if (
  globalForPrisma.prisma &&
  (!("platformPlan" in globalForPrisma.prisma) ||
    !("reusableProcessTemplate" in globalForPrisma.prisma) ||
    !("platformBusinessSegment" in globalForPrisma.prisma) ||
    !("platformTemplate" in globalForPrisma.prisma))
) {
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
