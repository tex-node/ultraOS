import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const org = await c.organization.findUniqueOrThrow({ where: { slug: "neon-ultra" }, select: { id: true } });
    const event = await c.event.findUniqueOrThrow({ where: { id: "seed-event-season-zero-launch" }, select: { id: true } });

    const vendor = await c.vendor.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "Demo Kitchen" } },
      create: {
        organizationId: org.id,
        name: "Demo Kitchen",
        contactName: "Demo Chef",
        email: "demo-kitchen@neonultra.ng",
        phone: "+2348000000000",
        commissionBps: 1000,
        isActive: true,
        recordOrigin: "DEMO",
      },
      update: { isActive: true, recordOrigin: "DEMO" },
      select: { id: true },
    });

    const products = [
      { name: "Demo Jollof Rice", category: "OTHER" as const, priceKobo: 250000 },
      { name: "Demo Grilled Chicken", category: "HOTDOG" as const, priceKobo: 350000 },
      { name: "Demo Soft Drink", category: "SOFT_DRINK" as const, priceKobo: 50000 },
      { name: "Demo Water", category: "WATER" as const, priceKobo: 20000 },
      { name: "Demo Jersey", category: "MERCHANDISE" as const, priceKobo: 1500000 },
    ];

    for (const p of products) {
      const existing = await c.vendorProduct.findFirst({ where: { vendorId: vendor.id, name: p.name }, select: { id: true } });
      if (!existing) {
        await c.vendorProduct.create({
          data: {
            organizationId: org.id,
            vendorId: vendor.id,
            name: p.name,
            category: p.category,
            priceKobo: p.priceKobo,
            approvalStatus: "APPROVED",
            isActive: true,
          },
          select: { id: true },
        });
      }
    }

    // Ensure inventory for all products on the Season Zero event.
    const allProducts = await c.vendorProduct.findMany({ where: { vendorId: vendor.id }, select: { id: true } });
    for (const product of allProducts) {
      await c.vendorInventory.upsert({
        where: { eventId_productId: { eventId: event.id, productId: product.id } },
        create: { organizationId: org.id, eventId: event.id, productId: product.id, stock: 50 },
        update: {},
        select: { id: true },
      });
    }

    console.log("DEMO_VENDOR_READY:" + JSON.stringify({ vendorId: vendor.id, products: allProducts.length }));
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });