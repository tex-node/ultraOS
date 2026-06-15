import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function EventsPage() {
  const session = await requirePermission("event:manage");
  const events = await prisma.event.findMany({
    include: {
      venue: true,
      season: true,
      _count: {
        select: {
          fixtures: true,
          seatZones: true,
          reservations: true,
          accreditations: true,
          orders: true,
        },
      },
    },
    orderBy: { startTime: "desc" },
  });
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div><p className="text-xs uppercase tracking-[.24em] text-emerald-400">Event Operations v2</p><h1 className="mt-2 text-3xl font-semibold">Events</h1></div>
          <Link href="/events/new" className="rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-zinc-950">Create event</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
              <div className="flex justify-between gap-4"><h2 className="font-semibold">{event.name}</h2><span className="text-xs text-emerald-300">{event.status}</span></div>
              <p className="mt-2 text-sm text-zinc-400">{event.startTime.toLocaleString()} · {event.venue.name}</p>
              <p className="mt-4 text-xs text-zinc-500">{event._count.fixtures} fixtures · {event._count.seatZones} zones · {event._count.reservations} reservations · {event._count.accreditations} accreditations · {event._count.orders} orders</p>
            </Link>
          ))}
        </div>
      </main>
    </OperationsShell>
  );
}
