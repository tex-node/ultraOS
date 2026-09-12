import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { addSquadMember, removeSquadMember } from "@/app/draft-events/actions";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftSquadPage({ params }: { params: Promise<{ draftEventId: string; squadId: string }> }) {
  const { draftEventId, squadId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/squads/${squadId}`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-squad:manage");
  const { squad, players } = await withOrganizationContext(organizationId, async (tx) => {
    const squad = await tx.draftSquad.findUnique({
      where: { id: squadId },
      include: { division: true, draftEvent: true, members: { include: { player: { include: { athlete: true } } }, orderBy: { sequence: "asc" } } },
    });
    if (!squad || squad.draftEventId !== draftEventId) return { squad: null, players: [] };
    const alreadyInEvent = await tx.draftSquadMember.findMany({ where: { draftSquad: { draftEventId } }, select: { playerId: true } });
    const players = await tx.player.findMany({
      where: { seasonId: squad.seasonId, seasonClubId: null, id: { notIn: alreadyInEvent.map((member) => member.playerId) } },
      include: { athlete: true },
      orderBy: { athlete: { lastName: "asc" } },
    });
    return { squad, players };
  });
  if (!squad) notFound();
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-emerald-400" href={`/draft-events/${draftEventId}/squads`}>Back to squads</Link>
        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
            <p className="text-xs uppercase tracking-[.2em] text-emerald-400">{squad.division.name}</p>
            <h1 className="mt-2 text-3xl font-semibold">{squad.publicLabel ?? squad.name}</h1>
            <p className="mt-2 text-sm text-zinc-400">Sequence {squad.sequence} - {squad.members.length} members</p>
            <form action={addSquadMember.bind(null, draftEventId, squadId)} className="mt-8 space-y-4">
              <label className="block text-sm text-zinc-300">Add player<select className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm" name="playerId" required><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName} - {player.position} - {player.draftSelectionGroup}</option>)}</select></label>
              <label className="block text-sm text-zinc-300">Sequence<input className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm" name="sequence" type="number" min="1" /></label>
              <label className="flex items-center gap-2 text-sm text-zinc-300"><input name="captain" type="checkbox" /> Captain</label>
              <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Add member</button>
            </form>
          </section>
          <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
            <h2 className="text-xl font-semibold">Members</h2>
            <div className="mt-5 grid gap-3">
              {squad.members.map((member) => (
                <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-black/20 p-4" key={member.id}>
                  <div><p className="font-semibold">{member.player.athlete.firstName} {member.player.athlete.lastName}</p><p className="text-xs text-zinc-500">{member.player.position} - {member.player.draftSelectionGroup}{member.captain ? " - Captain" : ""}</p></div>
                  <form action={removeSquadMember.bind(null, draftEventId, squadId, member.id)}><button className="text-sm text-rose-300">Remove</button></form>
                </div>
              ))}
              {squad.members.length === 0 ? <p className="text-zinc-400">No members yet.</p> : null}
            </div>
          </section>
        </div>
      </main>
    </OperationsShell>
  );
}
