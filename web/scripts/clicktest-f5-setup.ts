import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const org = await c.organization.findUniqueOrThrow({ where: { slug: "neon-ultra" }, select: { id: true } });
    // Existing products must have been backfilled to APPROVED (menus keep selling).
    const byStatus = await c.vendorProduct.groupBy({ by: ["approvalStatus"], _count: { _all: true } });
    console.log("PRODUCT_STATUS_MIX:" + JSON.stringify(byStatus));
    // Click-through test vendor + pending product + inventory on the Season Zero event.
    const vendor = await c.vendor.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "Click-Test Kitchen" } },
      create: { organizationId: org.id, name: "Click-Test Kitchen", contactName: "Test Cook", email: "kitchen@neonultra.ng", commissionBps: 1000 },
      update: { commissionBps: 1000 },
      select: { id: true },
    });
    let product = await c.vendorProduct.findFirst({ where: { vendorId: vendor.id, name: "Click-Test Puff-Puff" }, select: { id: true } });
    if (!product) {
      product = await c.vendorProduct.create({
        data: { organizationId: org.id, vendorId: vendor.id, name: "Click-Test Puff-Puff", category: "HOTDOG", priceKobo: 50000, approvalStatus: "PENDING" },
        select: { id: true },
      });
    }
    await c.vendorInventory.upsert({
      where: { eventId_productId: { eventId: "seed-event-season-zero-launch", productId: product.id } },
      create: { organizationId: org.id, eventId: "seed-event-season-zero-launch", productId: product.id, stock: 40 },
      update: {},
      select: { id: true },
    });
    const check = await c.vendorProduct.findUniqueOrThrow({ where: { id: product.id }, select: { name: true, approvalStatus: true, priceKobo: true } });
    console.log("TEST_PRODUCT:" + JSON.stringify({ vendor: vendor.id, ...check }));
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
