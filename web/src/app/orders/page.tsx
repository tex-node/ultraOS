import { OperationsShell } from "@/app/components/operations-shell";
import { cancelOrder, confirmOrderPayment, setOrderStatus } from "./actions";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formatNaira } from "@/lib/money";
import { withOrganizationContext } from "@/lib/tenant-context";
import { vendorScopeFrom } from "@/lib/vendor-scope";

export default async function OrdersPage() {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  const scope = await withOrganizationContext(organizationId, async (tx) => {
    const vendor = await tx.vendor.findFirst({ where: { userId: session.user.id }, select: { id: true } });
    return vendorScopeFrom(session.user.roles, vendor?.id ?? null);
  });
  const orders = await withOrganizationContext(organizationId, (tx) => tx.order.findMany({
    include: {
      event: true,
      items: { include: { product: { include: { vendor: true } } } },
      reservation: { include: { seatZone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  }));
  // Vendor-linked accounts see only orders made up entirely of their own items; mixed
  // orders stay with platform staff. The actions enforce the same rule server-side.
  const visible = scope.kind === "vendor" ? orders.filter((order) => order.items.length > 0 && order.items.every((item) => item.product.vendorId === scope.vendorId)) : orders;
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Fan wallet fulfillment</p>
        <h1 className="mt-2 text-3xl font-semibold">Orders</h1>
        <div className="mt-8 space-y-4">
          {scope.kind === "vendor" ? <p className="text-sm text-zinc-500">Showing only orders made up of your items — mixed orders are handled by league staff.</p> : null}
          {visible.length === 0 ? <p className="text-sm text-zinc-500">No orders to fulfill right now.</p> : null}
          {visible.map((order) => <article key={order.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold">{order.guestName ?? order.guestEmail ?? "Fan order"}</h2><p className="text-sm text-zinc-400">{order.event.name} · {order.status} · {order.paymentStatus}</p></div><div className="text-right"><p className="font-semibold">{formatNaira(order.totalKobo)}</p><p className="font-mono text-xs text-zinc-500">{order.collectionCode}</p></div></div><div className="mt-4 flex flex-wrap gap-2 text-sm">{order.reservation ? <span className="rounded bg-white/[.05] px-2 py-1">{order.reservation.seatZone.name} × {order.reservation.quantity}</span> : null}{order.items.map((item)=><span key={item.id} className="rounded bg-white/[.05] px-2 py-1">{item.product.vendor.name}: {item.product.name} × {item.quantity}</span>)}</div><div className="mt-5 flex flex-wrap gap-2">{order.paymentStatus !== "PAID" ? <form action={confirmOrderPayment.bind(null,order.id)} className="flex gap-2"><input name="reference" required placeholder="Payment reference" className="rounded-lg bg-white/[.05] px-3 py-2 text-sm" /><button className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950">Confirm paid</button></form> : <>{order.status !== "PREPARING" ? <form action={setOrderStatus.bind(null,order.id,"PREPARING")}><button className="rounded-lg border border-white/10 px-3 py-2 text-sm">Preparing</button></form> : null}{order.status !== "READY" ? <form action={setOrderStatus.bind(null,order.id,"READY")}><button className="rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-300">Ready</button></form> : null}</>}{order.status !== "COLLECTED" && order.status !== "CANCELLED" ? <form action={cancelOrder.bind(null,order.id)} className="flex gap-2"><input name="reason" required minLength={5} placeholder="Cancellation reason" className="rounded-lg bg-white/[.05] px-3 py-2 text-sm" /><button className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300">Cancel</button></form> : null}</div></article>)}
        </div>
      </main>
    </OperationsShell>
  );
}
