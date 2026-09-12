import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  confirmReservationPayment,
  createAccreditation,
  createSeatZone,
  createVenueSection,
  setAccreditationStatus,
  setEventStatus,
} from "../actions";
import { EventStatus } from "@/generated/prisma/enums";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { formatNaira } from "@/lib/money";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("event:manage", `/events/${id}`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;
  const [event, fanClubs] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    tx.event.findUnique({
      where: { id },
      include: {
        venue: { include: { sections: { orderBy: { name: "asc" } } } },
        season: true,
        seatZones: {
          include: {
            venueSection: true,
            fanClub: { include: { club: true } },
          },
          orderBy: { priceKobo: "desc" },
        },
        accreditations: { orderBy: { createdAt: "desc" } },
        reservations: {
          include: {
            seatZone: true,
            ticket: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        orders: {
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        sponsorCampaigns: { orderBy: { sponsorName: "asc" } },
      },
    }),
    tx.fanClub.findMany({
      include: { club: true },
      orderBy: { club: { name: "asc" } },
    }),
  ]));
  if (!event) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/events" className="text-sm text-zinc-400">Back to events</Link>
            <p className="mt-5 text-xs uppercase tracking-[.24em] text-emerald-400">{event.season.name} · {event.status}</p>
            <h1 className="mt-2 text-3xl font-semibold">{event.name}</h1>
            <p className="mt-2 text-zinc-400">{formatLagosDateTime(event.startTime)} · {event.venue.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.values(EventStatus).map((status) => (
              <form key={status} action={setEventStatus.bind(null, id, status)}>
                <button disabled={event.status === status} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-30">{status}</button>
              </form>
            ))}
            <Link href={`/public/events/${id}`} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950">Public booking</Link>
            <Link href={`/events/${id}/debrief`} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-300">Post-event debrief</Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Zones" value={event.seatZones.length} />
          <Metric label="Capacity" value={event.seatZones.reduce((sum, zone) => sum + zone.capacity, 0)} />
          <Metric label="Reserved" value={event.seatZones.reduce((sum, zone) => sum + zone.reservedQuantity, 0)} />
          <Metric label="Accreditation" value={event.accreditations.length} />
          <Metric label="Orders" value={event.orders.length} />
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel title="Venue sections">
            <div className="space-y-2">{event.venue.sections.map((section) => <div key={section.id} className="flex justify-between rounded-lg bg-white/[.04] p-3"><span>{section.name} ({section.code})</span><span className="text-zinc-400">{section.capacity}</span></div>)}</div>
            <form action={createVenueSection.bind(null, event.venueId, id)} className="mt-4 grid gap-2 sm:grid-cols-4">
              <input name="name" required placeholder="Section name" className="rounded-lg bg-white/[.05] p-3" />
              <input name="code" required placeholder="Code" className="rounded-lg bg-white/[.05] p-3" />
              <input name="capacity" type="number" min="1" required placeholder="Capacity" className="rounded-lg bg-white/[.05] p-3" />
              <button className="rounded-lg border border-emerald-400/30 p-3 text-emerald-300">Add section</button>
            </form>
          </Panel>

          <Panel title="Seat zones">
            <div className="space-y-2">{event.seatZones.map((zone) => <div key={zone.id} className="rounded-lg bg-white/[.04] p-3"><div className="flex justify-between"><span>{zone.name} · {zone.venueSection.name}</span><span>{formatNaira(zone.priceKobo)}</span></div><p className="mt-1 text-xs text-zinc-500">{zone.reservedQuantity}/{zone.capacity} reserved{zone.fanClub ? ` · ${zone.fanClub.club.name} priority` : ""}</p></div>)}</div>
            <form action={createSeatZone.bind(null, id)} className="mt-4 grid gap-2 sm:grid-cols-2">
              <select name="venueSectionId" required className="rounded-lg bg-white/[.05] p-3"><option value="">Venue section</option>{event.venue.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select>
              <input name="name" required placeholder="Zone name" className="rounded-lg bg-white/[.05] p-3" />
              <input name="capacity" type="number" min="1" required placeholder="Capacity" className="rounded-lg bg-white/[.05] p-3" />
              <input name="priceNaira" type="number" min="0" step="0.01" required placeholder="Price (NGN)" className="rounded-lg bg-white/[.05] p-3" />
              <input name="salesOpenAt" type="datetime-local" className="rounded-lg bg-white/[.05] p-3" />
              <input name="salesCloseAt" type="datetime-local" className="rounded-lg bg-white/[.05] p-3" />
              <select name="fanClubId" className="rounded-lg bg-white/[.05] p-3"><option value="">No fan-club allocation</option>{fanClubs.map((fanClub) => <option key={fanClub.id} value={fanClub.id}>{fanClub.club.name}</option>)}</select>
              <input name="fanClubEarlyAccessAt" type="datetime-local" className="rounded-lg bg-white/[.05] p-3" />
              <input name="fanClubDiscountPercent" type="number" min="0" max="100" defaultValue="0" placeholder="Fan discount %" className="rounded-lg bg-white/[.05] p-3" />
              <button className="rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Add zone</button>
            </form>
          </Panel>

          <Panel title="Accreditation">
            <form action={createAccreditation.bind(null, id)} className="grid gap-2 sm:grid-cols-2">
              <input name="personName" required placeholder="Full name" className="rounded-lg bg-white/[.05] p-3" />
              <select name="category" required className="rounded-lg bg-white/[.05] p-3">{["PLAYER","COACH","OFFICIAL","MEDIA","VIP_GUEST","FAN"].map((category) => <option key={category}>{category}</option>)}</select>
              <input name="email" type="email" placeholder="Email" className="rounded-lg bg-white/[.05] p-3" />
              <input name="phone" placeholder="Phone" className="rounded-lg bg-white/[.05] p-3" />
              <input name="organization" placeholder="Organization" className="rounded-lg bg-white/[.05] p-3" />
              <input name="roleTitle" placeholder="Role/title" className="rounded-lg bg-white/[.05] p-3" />
              <button className="sm:col-span-2 rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Create accreditation</button>
            </form>
            <div className="mt-5 space-y-2">{event.accreditations.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-white/[.04] p-3"><Image src={`/api/qr/${item.code}`} alt="" width={56} height={56} unoptimized /><div className="min-w-0 flex-1"><p>{item.personName}</p><p className="text-xs text-zinc-500">{item.category} · {item.status}</p></div><div className="flex gap-1">{item.status !== "APPROVED" ? <form action={setAccreditationStatus.bind(null,item.id,id,"APPROVED")}><button className="text-xs text-emerald-300">Approve</button></form> : null}{item.status !== "REVOKED" ? <form action={setAccreditationStatus.bind(null,item.id,id,"REVOKED")}><button className="text-xs text-rose-300">Revoke</button></form> : null}</div></div>)}</div>
          </Panel>

          <Panel title="Recent reservations">
            <div className="space-y-2">{event.reservations.map((reservation) => <div key={reservation.id} className="rounded-lg bg-white/[.04] p-3"><div className="flex justify-between"><span>{reservation.user?.name ?? reservation.guestName ?? reservation.guestEmail ?? "Guest"}</span><span className={reservation.paymentStatus === "PAID" ? "text-emerald-300" : "text-amber-300"}>{reservation.paymentStatus}</span></div><p className="mt-1 text-xs text-zinc-500">{reservation.seatZone.name} · {reservation.quantity} · {formatNaira(reservation.totalKobo)}</p>{reservation.paymentStatus !== "PAID" ? <form action={confirmReservationPayment.bind(null,reservation.id,id)} className="mt-2 flex gap-2"><input name="reference" required placeholder="Payment reference" className="min-w-0 flex-1 rounded bg-white/[.05] px-2 py-1 text-xs" /><button className="text-xs text-emerald-300">Confirm payment</button></form> : null}</div>)}</div>
          </Panel>

          <Panel title="Sponsor performance">
            <div className="space-y-2">{event.sponsorCampaigns.map((campaign) => <div key={campaign.id} className="rounded-lg bg-white/[.04] p-3"><div className="flex justify-between"><span>{campaign.sponsorName}</span><span>{formatNaira(campaign.revenueKobo)}</span></div><p className="mt-1 text-xs text-zinc-500">{campaign.impressions} impressions · {campaign.redemptions} redemptions · {campaign.unitsSold} units</p></div>)}</div>
            {event.sponsorCampaigns.length === 0 ? <p className="text-sm text-zinc-500">No sponsor campaigns configured.</p> : null}
          </Panel>
        </div>
      </main>
    </OperationsShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></article>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}
