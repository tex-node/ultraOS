import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftSquadsPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/squads`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:read");
  const event = await withOrganizationContext(organizationId, (tx) => tx.draftEvent.findUnique({
    where: { id: draftEventId },
    include: { squads: { include: { division: true, _count: { select: { members: true } } }, orderBy: [{ division: { name: "asc" } }, { sequence: "asc" }] } },
  }));
  if (!event) notFound();
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div><Link className="text-sm text-emerald-400" href={`/draft-events/${event.id}`}>Back to event</Link><h1 className="mt-4 text-3xl font-semibold">Squads</h1></div>
          <Link className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950" href={`/draft-events/${event.id}/squads/new`}>Create squad</Link>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {event.squads.map((squad) => (
            <Link className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" href={`/draft-events/${event.id}/squads/${squad.id}`} key={squad.id}>
              <h2 className="font-semibold">{squad.publicLabel ?? squad.name}</h2>
              <p className="mt-2 text-sm text-zinc-400">{squad.division.name} - sequence {squad.sequence}</p>
              <p className="mt-2 text-xs text-zinc-500">{squad._count.members} members</p>
            </Link>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}
