import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftEventPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:read");
  const event = await withOrganizationContext(organizationId, (tx) => tx.draftEvent.findUnique({
    where: { id: draftEventId },
    include: { season: true, squads: { include: { division: true, _count: { select: { members: true } } } }, allocations: { include: { seasonClub: { include: { club: true } }, division: true }, orderBy: { sequence: "asc" } } },
  }));
  if (!event) notFound();
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[.2em] text-brand-400">{event.season.name}</p><h1 className="mt-2 text-3xl font-semibold">{event.publicTitle}</h1><p className="mt-2 text-sm text-text-2">{event.status} - {event.currentStage.replaceAll("_", " ")} - display v{event.displaySequence}</p></div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href={`/draft-events/${event.id}/squads`}>Squads</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href={`/draft-events/${event.id}/coaches`}>Coach pool</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href={`/draft-events/${event.id}/readiness`}>Readiness</Link>
            <Link className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900" href={`/draft-events/${event.id}/control`}>Control room</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href={`/draft-events/${event.id}/display?token=${event.displayToken}`}>Display</Link>
          </div>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="Squads" value={event.squads.length} />
          <Metric label="Allocations" value={event.allocations.length} />
          <Metric label="Confirmed" value={event.allocations.filter((allocation) => allocation.status === "CONFIRMED").length} />
          <Metric label="Stage" value={event.currentStage.replaceAll("_", " ")} />
        </section>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {event.squads.map((squad) => <Link className="rounded-lg border border-line bg-ink-800 p-5" href={`/draft-events/${event.id}/squads/${squad.id}`} key={squad.id}><h2 className="font-semibold">{squad.publicLabel ?? squad.name}</h2><p className="mt-2 text-sm text-text-2">{squad.division.name} - sequence {squad.sequence}</p><p className="mt-2 text-xs text-text-3">{squad._count.members} members</p></Link>)}
        </section>
      </main>
    </OperationsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-line bg-ink-800 p-5"><p className="text-xs uppercase tracking-[.18em] text-text-3">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}
