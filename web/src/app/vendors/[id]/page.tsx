import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  createSponsorCampaign,
  createPromoCode,
  createVendorProduct,
  setProductApproval,
  setVendorActive,
  setVendorCommission,
  setVendorInventory,
} from "../actions";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formatNaira } from "@/lib/money";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const { id } = await params;
  const [vendor, events, campaigns] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    tx.vendor.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            inventories: { include: { event: true } },
            sponsorCampaigns: true,
          },
          orderBy: { name: "asc" },
        },
      },
    }),
    tx.event.findMany({
      where: { status: { not: "CANCELLED" } },
      orderBy: { startTime: "desc" },
    }),
    tx.sponsorCampaign.findMany({
      where: {
        OR: [
          { productId: null },
          { product: { vendorId: id } },
        ],
      },
      orderBy: { sponsorName: "asc" },
    }),
  ]));
  if (!vendor) notFound();
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Vendor</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{vendor.name}</h1>
          {!vendor.isActive ? <span className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-300">SUSPENDED</span> : null}
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">Commission {(vendor.commissionBps / 100).toFixed(2).replace(/\.?0+$/, "")}%</span>
          <form action={setVendorActive.bind(null, id, !vendor.isActive)}>
            <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:border-white/20 hover:text-white">
              {vendor.isActive ? "Suspend vendor" : "Reactivate vendor"}
            </button>
          </form>
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="space-y-4">
            {vendor.products.map((product) => <article key={product.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><div className="flex justify-between"><div><h2 className="font-semibold">{product.name}</h2><p className="text-xs text-zinc-500">{product.category} · {product.approvalStatus === "APPROVED" ? <span className="text-emerald-300">Approved</span> : product.approvalStatus === "REJECTED" ? <span className="text-rose-300">Rejected</span> : <span className="text-amber-300">Pending approval</span>}</p></div><span>{formatNaira(product.priceKobo)}</span></div><div className="mt-4 space-y-2">{product.inventories.map((inventory) => <div key={inventory.id} className="flex justify-between rounded bg-white/[.04] p-2 text-sm"><span>{inventory.event.name}</span><span>{inventory.stock} stock · {inventory.reserved} reserved · {inventory.sold} sold</span></div>)}</div>{product.sponsorCampaigns.map((campaign) => <p key={campaign.id} className="mt-3 text-xs text-amber-300">Sponsored by {campaign.sponsorName}: {campaign.unitsSold} units · {formatNaira(campaign.revenueKobo)}</p>)}<div className="mt-3 flex gap-2">{product.approvalStatus !== "APPROVED" ? <form action={setProductApproval.bind(null, id, product.id, "APPROVED")}><button className="rounded-lg border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">Approve</button></form> : null}{product.approvalStatus !== "REJECTED" ? <form action={setProductApproval.bind(null, id, product.id, "REJECTED")}><button className="rounded-lg border border-rose-400/30 px-3 py-1 text-xs text-rose-300">Reject</button></form> : null}</div></article>)}
          </section>
          <div className="space-y-6">
            <Panel title="Add product"><form action={createVendorProduct.bind(null,id)} className="space-y-3"><input name="name" required placeholder="Product name" className="w-full rounded-lg bg-white/[.05] p-3" /><textarea name="description" placeholder="Description" className="w-full rounded-lg bg-white/[.05] p-3" /><select name="category" className="w-full rounded-lg bg-white/[.05] p-3">{["SOFT_DRINK","WATER","ENERGY_DRINK","POPCORN","HOTDOG","BURGER","PIZZA","MERCHANDISE","OTHER"].map((category)=><option key={category}>{category}</option>)}</select><input name="priceNaira" type="number" min="0" step=".01" required placeholder="Price (NGN)" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="imageUrl" type="url" placeholder="Image URL" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="fanClubDiscountPercent" type="number" min="0" max="100" defaultValue="0" placeholder="Fan discount %" className="w-full rounded-lg bg-white/[.05] p-3" /><button className="w-full rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Add product</button></form></Panel>
            <Panel title="Set event inventory"><form action={setVendorInventory.bind(null,id)} className="space-y-3"><select name="eventId" required className="w-full rounded-lg bg-white/[.05] p-3"><option value="">Event</option>{events.map((event)=><option key={event.id} value={event.id}>{event.name}</option>)}</select><select name="productId" required className="w-full rounded-lg bg-white/[.05] p-3"><option value="">Product</option>{vendor.products.map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select><input name="stock" type="number" min="0" required placeholder="Stock" className="w-full rounded-lg bg-white/[.05] p-3" /><button className="w-full rounded-lg border border-emerald-400/30 p-3 text-emerald-300">Save inventory</button></form></Panel>
            <Panel title="Sponsor campaign"><form action={createSponsorCampaign.bind(null,id)} className="space-y-3"><input name="name" required placeholder="Campaign name" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="sponsorName" required placeholder="Sponsor name" className="w-full rounded-lg bg-white/[.05] p-3" /><select name="eventId" className="w-full rounded-lg bg-white/[.05] p-3"><option value="">All events</option>{events.map((event)=><option key={event.id} value={event.id}>{event.name}</option>)}</select><select name="productId" className="w-full rounded-lg bg-white/[.05] p-3"><option value="">No product</option>{vendor.products.map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select><button className="w-full rounded-lg border border-amber-400/30 p-3 text-amber-300">Create campaign</button></form></Panel>
            <Panel title="Promo code"><form action={createPromoCode.bind(null,id)} className="space-y-3"><input name="code" required placeholder="Code" className="w-full rounded-lg bg-white/[.05] p-3 uppercase" /><select name="campaignId" className="w-full rounded-lg bg-white/[.05] p-3"><option value="">No sponsor campaign</option>{campaigns.map((campaign)=><option key={campaign.id} value={campaign.id}>{campaign.sponsorName} · {campaign.name}</option>)}</select><select name="eventId" className="w-full rounded-lg bg-white/[.05] p-3"><option value="">All events</option>{events.map((event)=><option key={event.id} value={event.id}>{event.name}</option>)}</select><input name="discountPercent" type="number" min="0" max="100" required placeholder="Discount %" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="maxRedemptions" type="number" min="0" defaultValue="0" placeholder="Max redemptions (0 unlimited)" className="w-full rounded-lg bg-white/[.05] p-3" /><button className="w-full rounded-lg border border-white/10 p-3">Create promo</button></form></Panel>
            <Panel title="League commission"><p className="text-xs text-zinc-500">League share of this vendor&apos;s gross, applied to payout figures.</p><form action={setVendorCommission.bind(null,id)} className="mt-3 flex gap-2"><input name="commissionPercent" type="number" min="0" max="100" step="0.01" required defaultValue={(vendor.commissionBps / 100).toString()} placeholder="Commission %" className="min-w-0 flex-1 rounded-lg bg-white/[.05] p-3" /><button className="rounded-lg border border-emerald-400/30 px-4 text-emerald-300">Save</button></form></Panel>
          </div>
        </div>
      </main>
    </OperationsShell>
  );
}

function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4">{children}</div></section>}
