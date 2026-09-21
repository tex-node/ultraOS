import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftEventsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/draft-events");
  if (!hasPermission(session.user.roles, "draft-event:read")) {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const events = await withOrganizationContext(session.user.organizationId, (tx) => tx.draftEvent.findMany({ include: { season: true, _count: { select: { squads: true, allocations: true } } }, orderBy: { createdAt: "desc" } }));
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[.2em] text-brand-400">Server-authoritative squad allocation</p><h1 className="mt-2 text-3xl font-semibold">Draft Day events</h1></div>
          {hasPermission(session.user.roles, "draft-event:configure") ? <Link className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900" href="/draft-events/new">Create DraftEvent</Link> : null}
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <Link className="rounded-lg border border-line bg-ink-800 p-5" href={`/draft-events/${event.id}`} key={event.id}>
              <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{event.publicTitle}</h2><span className="text-xs text-brand-300">{event.status}</span></div>
              <p className="mt-2 text-sm text-text-2">{event.season.name} - {event.currentStage.replaceAll("_", " ")}</p>
              <p className="mt-4 text-xs text-text-3">{event._count.squads} squads - {event._count.allocations} allocations - display v{event.displaySequence}</p>
            </Link>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}
