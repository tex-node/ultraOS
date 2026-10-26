import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  // Connection-pool sizing (streak v15, Prompt 1). The v14 stress test measured the failure this prevents: 40
  // simultaneous interactive transactions rejected 27 of 40 with "Unable to start a transaction in the given time",
  // because the pool defaulted to ~2xCPUs+1 (13 on the 6-core host) with a 5s wait. The limit and the wait are now
  // explicit rather than inherited from a default, and they are applied HERE as well as in the URL so a deployment
  // that forgets the query string still gets the tuned pool.
  //
  // PRISMA_POOL_SIZE / PRISMA_POOL_TIMEOUT are read from the environment so staging and production can differ without
  // a code change; the defaults are the numbers the stress test was tuned against.
  const poolSize = Number(process.env.PRISMA_POOL_SIZE ?? 20);
  const poolTimeoutSeconds = Number(process.env.PRISMA_POOL_TIMEOUT ?? 15);
  const url = new URL(connectionString);
  if (!url.searchParams.has("connection_limit") && Number.isFinite(poolSize)) url.searchParams.set("connection_limit", String(poolSize));
  if (!url.searchParams.has("pool_timeout") && Number.isFinite(poolTimeoutSeconds)) url.searchParams.set("pool_timeout", String(poolTimeoutSeconds));

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
