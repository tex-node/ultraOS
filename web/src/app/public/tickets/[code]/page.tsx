import Image from "next/image";
import { notFound } from "next/navigation";
import { createWalletOrder } from "../actions";
import { formatNaira } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: {
      reservation: {
        include: {
          event: {
            include: {
              inventories: {
                where: { product: { isActive: true } },
                include: { product: { include: { vendor: true } } },
                orderBy: { product: { name: "asc" } },
              },
            },
          },
          seatZone: true,
          order: true,
        },
      },
    },
  });
  if (!ticket) notFound();
  if (ticket.reservation.order) {
    const order = ticket.reservation.order;
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-zinc-400">This ticket already has a wallet order.</p>
        <a href={`/public/orders/${order.collectionCode}`} className="mt-4 inline-block text-emerald-400">Open wallet order</a>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <section className="rounded-2xl border border-white/[.08] bg-white p-6 text-zinc-950">
          <p className="text-xs uppercase tracking-[.2em] text-emerald-700">Ultra event ticket</p>
          <h1 className="mt-2 text-2xl font-semibold">{ticket.reservation.event.name}</h1>
          <p className="mt-2">{ticket.reservation.guestName}</p>
          <p className="text-sm text-zinc-600">{ticket.reservation.seatZone.name} · {ticket.reservation.quantity} admission</p>
          <Image src={`/api/qr/${ticket.code}`} alt="Ticket QR code" width={280} height={280} className="mx-auto mt-6" unoptimized />
          <p className="mt-3 break-all text-center font-mono text-xs text-zinc-500">{ticket.code}</p>
          <p className="mt-4 text-center text-sm">{formatNaira(ticket.reservation.totalKobo)} · {ticket.reservation.paymentStatus}</p>
        </section>
        <section>
          <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Fan wallet</p>
          <h2 className="mt-2 text-3xl font-semibold">Add food, drinks, or merchandise</h2>
          <p className="mt-2 text-zinc-400">Your seat and add-ons will be grouped into one payment-ready order.</p>
          <form action={createWalletOrder.bind(null,code)} className="mt-6">
            <div className="space-y-3">
              {ticket.reservation.event.inventories.map((inventory) => {
                const available = inventory.stock - inventory.reserved - inventory.sold;
                return <label key={inventory.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl border border-white/[.08] bg-[#0b100e] p-4"><span><b>{inventory.product.name}</b><span className="block text-xs text-zinc-500">{inventory.product.vendor.name} · {inventory.product.category} · {available} available</span></span><span>{formatNaira(inventory.product.priceKobo)}</span><input name={`quantity:${inventory.id}`} type="number" min="0" max={available} defaultValue="0" className="w-20 rounded-lg bg-white/[.05] p-2" /></label>;
              })}
            </div>
            <input name="promoCode" placeholder="Promo code (optional)" className="mt-4 w-full rounded-xl bg-white/[.05] p-4" />
            <button className="mt-4 w-full rounded-xl bg-emerald-400 p-4 font-semibold text-zinc-950">Create wallet order</button>
          </form>
        </section>
      </div>
    </main>
  );
}
