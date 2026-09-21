import Image from "next/image";
import { notFound } from "next/navigation";
import { PublicTokenLocatorType } from "@/generated/prisma/enums";
import { formatNaira } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicTokenLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function PublicOrderPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const locator = await resolvePublicTokenLocator(
    prisma,
    PublicTokenLocatorType.ORDER,
    code,
  );
  if (!locator) notFound();
  const order = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.order.findUnique({
      where: { id: locator.resourceId },
      include: {
        event: true,
        reservation: { include: { ticket: true, seatZone: true } },
        items: { include: { product: { include: { vendor: true } } } },
      },
    }),
  );
  if (!order || !locatorMatchesResource(locator, order) || order.collectionCode !== code) notFound();
  const steps = ["PENDING_PAYMENT", "PAID", "PREPARING", "READY", "COLLECTED"] as const;
  const currentIndex = order.status === "CANCELLED" ? -1 : steps.indexOf(order.status as (typeof steps)[number]);
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <section className="rounded-lg border border-line bg-ink-800 p-8">
        <div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-brand-400">Fan wallet order</p><h1 className="mt-2 font-display text-2xl font-bold">{order.event.name}</h1></div><span className="text-brand-300">{order.status.replace(/_/g, " ")}</span></div>
        {order.status === "CANCELLED" ? (
          <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">This order was cancelled. If you already paid, the venue team will refund you directly.</p>
        ) : (
          <ol className="mt-4 flex gap-1">
            {steps.map((step, index) => (
              <li key={step} className="flex-1">
                <div className={`h-1.5 rounded-full ${index <= currentIndex ? "bg-brand-400" : "bg-white/10"}`} />
                <p className={`mt-1 text-[10px] uppercase tracking-wide ${index <= currentIndex ? "text-brand-300" : "text-text-3"}`}>{step.replace(/_/g, " ")}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-6 space-y-2">{order.reservation ? <div className="flex justify-between"><span>{order.reservation.seatZone.name} admission</span><span>{formatNaira(order.reservation.totalKobo)}</span></div> : null}{order.items.map((item)=><div key={item.id} className="flex justify-between"><span>{item.quantity} × {item.product.name} <span className="text-xs text-text-3">({item.product.vendor.name})</span></span><span>{formatNaira(item.totalKobo)}</span></div>)}</div>
        <div className="mt-6 border-t border-line pt-4"><div className="flex justify-between text-text-2"><span>Discount</span><span>-{formatNaira(order.discountKobo)}</span></div><div className="mt-2 flex justify-between text-xl font-semibold"><span>Total</span><span>{formatNaira(order.totalKobo)}</span></div><p className="mt-2 text-sm text-warn">Payment: {order.paymentStatus}</p></div>
        <div className="mt-8 rounded-lg bg-white p-5 text-center text-zinc-950 shadow-card"><Image src={`/api/qr/${order.collectionCode}`} alt="Collection QR code" width={260} height={260} className="mx-auto" unoptimized /><p className="mt-2 text-sm font-semibold">Collection QR</p><p className="mt-1 break-all font-mono text-xs text-zinc-500">{order.collectionCode}</p></div>
        {order.paymentStatus !== "PAID" ? <p className="mt-5 rounded-lg bg-warn/10 p-3 text-sm text-warn">Payment is pending. The venue operator will activate this order after a verified payment reference is received.</p> : null}
      </section>
    </main>
  );
}
