import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { createVendor } from "./actions";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function VendorsPage() {
  const session = await requirePermission("vendor:manage");
  const vendors = await prisma.vendor.findMany({
    include: {
      _count: { select: { products: true } },
      products: {
        select: {
          inventories: { select: { stock: true, reserved: true, sold: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Concessions and merchandise</p>
        <h1 className="mt-2 text-3xl font-semibold">Vendors</h1>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-4 md:grid-cols-2">
            {vendors.map((vendor) => {
              const inventory = vendor.products.flatMap((product) => product.inventories);
              return <Link key={vendor.id} href={`/vendors/${vendor.id}`} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><div className="flex justify-between"><h2 className="font-semibold">{vendor.name}</h2><span className="text-xs text-emerald-300">{vendor.isActive ? "ACTIVE" : "INACTIVE"}</span></div><p className="mt-3 text-sm text-zinc-400">{vendor._count.products} products</p><p className="mt-4 text-xs text-zinc-500">{inventory.reduce((sum,row)=>sum+row.stock,0)} stocked · {inventory.reduce((sum,row)=>sum+row.sold,0)} sold</p></Link>;
            })}
          </div>
          <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h2 className="font-semibold">Add vendor</h2>
            <form action={createVendor} className="mt-4 space-y-3">
              <input name="name" required placeholder="Vendor name" className="w-full rounded-lg bg-white/[.05] p-3" />
              <input name="contactName" placeholder="Contact name" className="w-full rounded-lg bg-white/[.05] p-3" />
              <input name="email" type="email" placeholder="Email" className="w-full rounded-lg bg-white/[.05] p-3" />
              <input name="phone" placeholder="Phone" className="w-full rounded-lg bg-white/[.05] p-3" />
              <button className="w-full rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Create vendor</button>
            </form>
          </section>
        </div>
      </main>
    </OperationsShell>
  );
}
