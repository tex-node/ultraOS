import { OperationsShell } from "@/app/components/operations-shell";
import { createEvent } from "../actions";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function NewEventPage() {
  const session = await requirePermission("event:manage");
  const [seasons, venues] = await Promise.all([
    prisma.season.findMany({ orderBy: { startDate: "desc" } }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <h1 className="text-2xl font-semibold">Create event</h1>
          <form action={createEvent} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">Name<input name="name" required className="mt-1 w-full rounded-lg bg-white/[.05] p-3" /></label>
            <label>Season<select name="seasonId" required className="mt-1 w-full rounded-lg bg-white/[.05] p-3"><option value="">Select</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <label>Venue<select name="venueId" required className="mt-1 w-full rounded-lg bg-white/[.05] p-3"><option value="">Select</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
            <label>Event date<input name="date" type="date" required className="mt-1 w-full rounded-lg bg-white/[.05] p-3" /></label>
            <label>Doors open<input name="doorsOpenTime" type="datetime-local" className="mt-1 w-full rounded-lg bg-white/[.05] p-3" /></label>
            <label>Start time<input name="startTime" type="datetime-local" required className="mt-1 w-full rounded-lg bg-white/[.05] p-3" /></label>
            <label>End time<input name="endTime" type="datetime-local" className="mt-1 w-full rounded-lg bg-white/[.05] p-3" /></label>
            <button className="sm:col-span-2 rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Create event</button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}
