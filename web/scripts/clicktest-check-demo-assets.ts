import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const ev = await c.event.findFirst({
      where: { name: "Season Zero Opening Night" },
      select: { id: true, name: true, seatZones: { select: { id: true, name: true, priceKobo: true, capacity: true, reservedQuantity: true } } },
    });
    console.log("EVENT:" + JSON.stringify(ev));
    const vendor = await c.vendor.findFirst({
      where: { name: "Click-Test Kitchen" },
      select: { id: true, name: true, products: { select: { id: true, name: true, priceKobo: true, approvalStatus: true } } },
    });
    console.log("VENDOR:" + JSON.stringify(vendor));
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });