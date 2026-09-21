import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { draftReadinessForPlayer } from "@/lib/participant-profiles";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftEventPlayerPoolPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/player-pool`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:read");
  const { draftEvent, players, readiness } = await withOrganizationContext(organizationId, async (tx) => {
    const draftEvent = await tx.draftEvent.findUniqueOrThrow({ where: { id: draftEventId }, include: { season: true } });
    const players = await tx.player.findMany({
      where: { seasonId: draftEvent.seasonId, draftSelectionGroup: { in: ["MAIN_DRAFT", "SECONDARY_DRAFT"] } },
      include: { athlete: true, seasonClub: { include: { club: true } }, draftSquadMembers: { include: { draftSquad: true } } },
      orderBy: [{ draftSelectionGroup: "asc" }, { athlete: { lastName: "asc" } }],
      take: 300,
    });
    const readiness = new Map(await Promise.all(players.map(async (player) => [player.id, await draftReadinessForPlayer(tx, player.id)] as const)));
    return { draftEvent, players, readiness };
  });
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-brand-400" href={`/draft-events/${draftEventId}`}>Back to draft event</Link>
        <h1 className="mt-4 text-3xl font-semibold">Draft Player Pool</h1>
        <p className="mt-2 text-sm text-text-2">{draftEvent.publicTitle} | {draftEvent.season.name}. Players with hard blockers should not enter a live DraftEvent.</p>
        <section className="mt-8 overflow-hidden rounded-lg border border-line bg-ink-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-[.16em] text-text-3"><tr><th className="p-3">Player</th><th className="p-3">Ultra ID</th><th className="p-3">Group</th><th className="p-3">Squad</th><th className="p-3">SeasonClub</th><th className="p-3">Readiness</th></tr></thead>
            <tbody>{players.map((player) => {
              const check = readiness.get(player.id);
              return <tr className="border-t border-line" key={player.id}><td className="p-3">{player.athlete.firstName} {player.athlete.lastName}</td><td className="p-3">{player.athlete.ultraAthleteId ?? "-"}</td><td className="p-3">{player.draftSelectionGroup}</td><td className="p-3">{player.draftSquadMembers[0]?.draftSquad.name ?? "-"}</td><td className="p-3">{player.seasonClub?.club.name ?? "-"}</td><td className={check?.ready ? "p-3 text-brand-300" : "p-3 text-danger"}>{check?.ready ? "Ready" : check?.blockers.join(", ")}</td></tr>;
            })}</tbody>
          </table>
        </section>
      </main>
    </OperationsShell>
  );
}
