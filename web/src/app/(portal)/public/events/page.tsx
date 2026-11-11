import Link from "next/link";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicEventsPage() {
  const organization = await resolveDefaultPublicOrganization();
  const events = await withOrganizationContext(organization.id, (tx) =>
    tx.event.findMany({
      where: { status: { in: ["PUBLISHED", "IN_PROGRESS"] } },
      include: {
        venue: true,
        seatZones: true,
        _count: { select: { reservations: true } },
      },
      orderBy: { startTime: "asc" },
    }),
  );
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <p className="text-xs uppercase tracking-[.24em] text-brand-400">Matchday access</p>
      <h1 className="mt-2 text-4xl font-semibold">Events</h1>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {events.map((event) => (
          <Link key={event.id} href={`/public/events/${event.id}`} className="rounded-lg border border-line bg-ink-800 p-6">
            <div className="flex justify-between"><h2 className="text-xl font-semibold">{event.name}</h2><span className="text-xs text-brand-300">{event.status}</span></div>
            <p className="mt-3 text-text-2">{formatLagosDateTime(event.startTime)} · {event.venue.name}</p>
            <p className="mt-5 text-sm text-text-3">{event.seatZones.length} seating zones · {event._count.reservations} reservations</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
