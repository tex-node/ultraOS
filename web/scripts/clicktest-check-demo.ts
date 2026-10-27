import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const demoComps = await c.competition.findMany({
      where: { slug: { startsWith: "demo-" } },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    console.log("DEMO_COMPETITIONS:" + JSON.stringify(demoComps, null, 2));
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });