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
  // 40 is the MEASURED requirement, not a guess: with 30 slots a 40-write burst still rejected 13 of 40 (P2028), and
  // with 40 it completed 40/40 in 1.9 s. Each interactive transaction holds a connection for its whole duration, so
  // the pool has to cover the burst rather than the steady state (which needs ~5). Postgres here allows 100
  // connections for the whole server, shared with Supabase, so an instance that shares the server with another busy
  // one should lower this with PRISMA_POOL_SIZE.
  const poolSize = Number(process.env.PRISMA_POOL_SIZE ?? 40);
  const poolTimeoutSeconds = Number(process.env.PRISMA_POOL_TIMEOUT ?? 15);

  // IMPORTANT: with @prisma/adapter-pg the pool is a node-postgres Pool, and `connection_limit` in the URL means
  // nothing to it. The first version of this fix set the query-string parameters and changed nothing - the stress test
  // still rejected 32 of 40 writes. The adapter takes a pg PoolConfig, so the size and the wait are passed as `max`
  // and `connectionTimeoutMillis`.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: Number.isFinite(poolSize) && poolSize > 0 ? poolSize : 40,
      connectionTimeoutMillis: (Number.isFinite(poolTimeoutSeconds) && poolTimeoutSeconds > 0 ? poolTimeoutSeconds : 15) * 1000,
    }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
