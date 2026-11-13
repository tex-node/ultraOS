import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const user = await c.user.findUnique({
      where: { email: "texdevices@gmail.com" },
      select: { email: true, role: true, isActive: true, sessionVersion: true,
        roles: { where: { revokedAt: null }, select: { role: true, organizationId: true, revokedAt: true } } },
    });
    console.log("TEXDEVICES:" + JSON.stringify(user, null, 2));
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });