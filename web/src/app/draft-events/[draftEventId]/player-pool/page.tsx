import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermission } from "@/lib/authorization";
import { draftReadinessForPlayer } from "@/lib/participant-profiles";
import { prisma } from "@/lib/prisma";

export default async function DraftEventPlayerPoolPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/player-pool`);
  const session = await requirePermission("draft-event:read");
  const draftEvent = await prisma.draftEvent.findUniqueOrThrow({ where: { id: draftEventId }, include: { season: true } });
  const players = await prisma.player.findMany({
    where: { seasonId: draftEvent.seasonId, draftSelectionGroup: { in: ["MAIN_DRAFT", "SECONDARY_DRAFT"] } },
    include: { athlete: true, seasonClub: { include: { club: true } }, draftSquadMembers: { include: { draftSquad: true } } },
    orderBy: [{ draftSelectionGroup: "asc" }, { athlete: { lastName: "asc" } }],
    take: 300,
  });
  const readiness = new Map(await Promise.all(players.map(async (player) => [player.id, await draftReadinessForPlayer(player.id)] as const)));
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-emerald-400" href={`/draft-events/${draftEventId}`}>Back to draft event</Link>
        <h1 className="mt-4 text-3xl font-semibold">Draft Player Pool</h1>
        <p className="mt-2 text-sm text-zinc-400">{draftEvent.publicTitle} | {draftEvent.season.name}. Players with hard blockers should not enter a live DraftEvent.</p>
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[.08] bg-[#0b100e]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-[.16em] text-zinc-500"><tr><th className="p-3">Player</th><th className="p-3">Ultra ID</th><th className="p-3">Group</th><th className="p-3">Squad</th><th className="p-3">SeasonClub</th><th className="p-3">Readiness</th></tr></thead>
            <tbody>{players.map((player) => {
              const check = readiness.get(player.id);
              return <tr className="border-t border-white/[.06]" key={player.id}><td className="p-3">{player.athlete.firstName} {player.athlete.lastName}</td><td className="p-3">{player.athlete.ultraAthleteId ?? "-"}</td><td className="p-3">{player.draftSelectionGroup}</td><td className="p-3">{player.draftSquadMembers[0]?.draftSquad.name ?? "-"}</td><td className="p-3">{player.seasonClub?.club.name ?? "-"}</td><td className={check?.ready ? "p-3 text-emerald-300" : "p-3 text-rose-300"}>{check?.ready ? "Ready" : check?.blockers.join(", ")}</td></tr>;
            })}</tbody>
          </table>
        </section>
      </main>
    </OperationsShell>
  );
}
