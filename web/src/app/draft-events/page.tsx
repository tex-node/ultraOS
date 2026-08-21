import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function DraftEventsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/draft-events");
  if (!hasPermission(session.user.roles, "draft-event:read")) {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }
  const events = await prisma.draftEvent.findMany({ include: { season: true, _count: { select: { squads: true, allocations: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[.2em] text-emerald-400">Server-authoritative squad allocation</p><h1 className="mt-2 text-3xl font-semibold">Draft Day events</h1></div>
          {hasPermission(session.user.roles, "draft-event:configure") ? <Link className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950" href="/draft-events/new">Create DraftEvent</Link> : null}
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <Link className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" href={`/draft-events/${event.id}`} key={event.id}>
              <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{event.publicTitle}</h2><span className="text-xs text-emerald-300">{event.status}</span></div>
              <p className="mt-2 text-sm text-zinc-400">{event.season.name} - {event.currentStage.replaceAll("_", " ")}</p>
              <p className="mt-4 text-xs text-zinc-500">{event._count.squads} squads - {event._count.allocations} allocations - display v{event.displaySequence}</p>
            </Link>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}
