import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const users = await c.$queryRaw<Array<{ email: string; role: string; roles: string }>>`
      SELECT u.email, u.role::text AS role,
             array_agg(DISTINCT r.role::text) FILTER (WHERE r."revokedAt" IS NULL) AS roles
      FROM "User" u
      LEFT JOIN "UserRoleAssignment" r ON r."userId" = u.id
      WHERE u.email IN ('clicktest-admin@neonultra.ng', 'texdevices@gmail.com', 'admin@neonultra.ng')
      GROUP BY u.email, u.role`;
    console.log("USERS:" + JSON.stringify(users, null, 2));
    const org = await c.organization.findFirst({ select: { id: true, name: true, slug: true } });
    console.log("ORG:" + JSON.stringify(org));
    const grants = await c.gameControlGrant.findMany({
      where: { revokedAt: null },
      select: { user: { select: { email: true } }, role: true, competitionId: true, seasonId: true, eventId: true },
    });
    console.log("ACTIVE_GRANTS:" + JSON.stringify(grants));
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });