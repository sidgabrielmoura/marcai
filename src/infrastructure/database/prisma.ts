import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { databasePoolConfig, databaseQuerySampleRate } from "./config";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

const pool =
  globalForPrisma.pgPool ??
  new Pool(databasePoolConfig());

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
    !("scheduledJobState" in globalForPrisma.prisma) ||
    !("operationalAgenda" in globalForPrisma.prisma) ||
    !("whatsAppWebhookEvent" in globalForPrisma.prisma) ||
    !("platformTemplate" in globalForPrisma.prisma))
) {
  globalForPrisma.prisma = undefined;
}

function createClient() {
  const sampleRate = databaseQuerySampleRate();
  const client = new PrismaClient({
    adapter,
    log: [
      { emit: "stdout", level: "error" },
      ...(process.env.NODE_ENV === "development" ? [{ emit: "stdout" as const, level: "warn" as const }] : []),
      ...(sampleRate > 0 ? [{ emit: "event" as const, level: "query" as const }] : []),
    ],
  });
  if (sampleRate > 0) client.$on("query", event => {
    if (Math.random() >= sampleRate) return;
    // Never record SQL, parameters, tenant IDs or credentials.
    console.info("[database-sample]", JSON.stringify({ durationMs: event.duration, connections: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }));
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
