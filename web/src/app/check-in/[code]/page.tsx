import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  checkInAccreditation,
  checkInTicket,
  collectOrder,
} from "../actions";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { formatNaira } from "@/lib/money";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function CheckInRecordPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await requirePermissionOrRedirect("check-in:operate", `/check-in/${code}`);
  // Phase 1 Stage 5.2B-4: this read used to run on the bare, unscoped prisma client - an
  // operator authenticated under Org B could scan a code and see Org A's fan name, event,
  // price, and payment status in full, even though the actual check-in action below was
  // already correctly org-scoped and would have denied the mutation. Wrapping the read in the
  // same org context makes a foreign-org code return null (RLS), matching the "not found"
  // behavior the mutation already had - closing the read-side information-disclosure gap
  // section 44 warns about.
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const [ticket, accreditation, order] = await withOrganizationContext(session.user.organizationId, (tx) => Promise.all([
    tx.ticket.findUnique({
      where: { code },
      include: {
        reservation: {
          include: { event: true, seatZone: true, user: true },
        },
        checkIns: { orderBy: { checkedInAt: "desc" } },
      },
    }),
    tx.accreditation.findUnique({
      where: { code },
      include: {
        event: true,
        checkIns: { orderBy: { checkedInAt: "desc" } },
      },
    }),
    tx.order.findUnique({
      where: { collectionCode: code },
      include: {
        event: true,
        items: { include: { product: true } },
        checkIns: { orderBy: { checkedInAt: "desc" } },
      },
    }),
  ]));
  if (!ticket && !accreditation && !order) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-2xl px-6 py-12">
        {ticket ? (
          <Record title="Fan ticket" status={ticket.status}>
            <p>{ticket.reservation.user?.name ?? ticket.reservation.guestName ?? "Guest fan"}</p>
            <p className="text-zinc-400">{ticket.reservation.event.name} · {ticket.reservation.seatZone.name} · {ticket.reservation.quantity} admission</p>
            {ticket.reservation.seatZone.passTier ? (
              <p className="font-semibold text-cyan-300">
                {ticket.reservation.seatZone.passTier === "DAY_PASS" ? "Day pass" : "Full-tournament pass"}
                {ticket.reservation.seatZone.passValidFrom || ticket.reservation.seatZone.passValidTo ? (
                  <span className="font-normal text-zinc-400">
                    {" "}· valid{ticket.reservation.seatZone.passValidFrom ? ` from ${ticket.reservation.seatZone.passValidFrom.toLocaleString()}` : ""}{ticket.reservation.seatZone.passValidTo ? ` to ${ticket.reservation.seatZone.passValidTo.toLocaleString()}` : ""}
                  </span>
                ) : null}
              </p>
            ) : null}
            <p className="text-zinc-400">{formatNaira(ticket.reservation.totalKobo)} · {ticket.reservation.paymentStatus}</p>
            {ticket.status === "ACTIVE" && (ticket.reservation.totalKobo === 0 || ticket.reservation.paymentStatus === "PAID") ? <form action={checkInTicket.bind(null,ticket.id,code)}><button className="mt-6 w-full rounded-xl bg-emerald-400 p-4 font-semibold text-zinc-950">Confirm venue entry</button></form> : null}
            {ticket.checkIns[0] ? <p className="mt-4 text-sm text-emerald-300">Checked in {ticket.checkIns[0].checkedInAt.toLocaleString()}</p> : null}
          </Record>
        ) : null}
        {accreditation ? (
          <Record title="Accreditation" status={accreditation.status}>
            <p>{accreditation.personName}</p>
            <p className="text-zinc-400">{accreditation.category} · {accreditation.organization ?? accreditation.roleTitle ?? "Event guest"}</p>
            <p className="text-zinc-400">{accreditation.event.name}</p>
            {accreditation.status === "APPROVED" && accreditation.checkIns.length === 0 ? <form action={checkInAccreditation.bind(null,accreditation.id,code)}><button className="mt-6 w-full rounded-xl bg-emerald-400 p-4 font-semibold text-zinc-950">Confirm accreditation entry</button></form> : null}
            {accreditation.checkIns[0] ? <p className="mt-4 text-sm text-emerald-300">Checked in {accreditation.checkIns[0].checkedInAt.toLocaleString()}</p> : null}
          </Record>
        ) : null}
        {order ? (
          <Record title="Food and merchandise collection" status={order.status}>
            <p>{order.guestName ?? "Fan order"}</p>
            <p className="text-zinc-400">{order.event.name} · {formatNaira(order.totalKobo)} · {order.paymentStatus}</p>
            <ul className="mt-4 space-y-1 text-sm text-zinc-300">{order.items.map((item) => <li key={item.id}>{item.quantity} × {item.product.name}</li>)}</ul>
            {order.status === "READY" && order.paymentStatus === "PAID" ? <form action={collectOrder.bind(null,order.id,code)}><button className="mt-6 w-full rounded-xl bg-emerald-400 p-4 font-semibold text-zinc-950">Confirm collection</button></form> : null}
            {order.checkIns[0] ? <p className="mt-4 text-sm text-emerald-300">Collected {order.checkIns[0].checkedInAt.toLocaleString()}</p> : null}
          </Record>
        ) : null}
      </main>
    </OperationsShell>
  );
}

function Record({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-8"><div className="flex justify-between"><h1 className="text-2xl font-semibold">{title}</h1><span className="text-sm text-emerald-300">{status}</span></div><div className="mt-6 space-y-2">{children}</div></section>;
}
