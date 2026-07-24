import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { DraftSelectionGroup, DraftTier } from "@/generated/prisma/enums";
import { requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { makeDraftPick, setDraftStatus } from "../actions";
import { PickForm } from "../forms";

export default async function DraftRoom({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const canManageDraft = hasPermission(session.user.roles, "draft:manage");
  const draft = await prisma.draft.findUnique({
    include: {
      division: true,
      picks: {
        include: {
          player: { include: { athlete: true } },
          seasonClub: { include: { club: true } },
        },
        orderBy: { pickNumber: "asc" },
      },
      season: true,
    },
    where: { id },
  });
  if (!draft) notFound();

  const poolGroup =
    draft.tier === DraftTier.MAIN ? DraftSelectionGroup.MAIN_DRAFT : DraftSelectionGroup.SECONDARY_DRAFT;

  const [pool, teams] = await Promise.all([
    prisma.player.findMany({
      include: { athlete: true },
      orderBy: { athlete: { lastName: "asc" } },
      where: {
        draftPicks: { none: { draftId: draft.id } },
        draftSelectionGroup: poolGroup,
        seasonClubId: null,
        seasonId: draft.seasonId,
        status: { in: ["DRAFT_ELIGIBLE", "UNDRAFTED"] },
      },
    }),
    prisma.seasonClub.findMany({
      include: { club: true, _count: { select: { players: true } } },
      orderBy: { club: { name: "asc" } },
      where: { divisionId: draft.divisionId, seasonId: draft.seasonId, status: "ACTIVE" },
    }),
  ]);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-emerald-400">
              {draft.season.name} - {draft.division.name} - {draft.tier.replace("_", " ")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{draft.name}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {draft.status} - Round {draft.currentRound} - Pick #{draft.nextPickNumber}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Eligible pool: {poolGroup.replace("_", " ").replace("_", " ")} ({pool.length} available)
            </p>
          </div>
          {canManageDraft ? (
            <div className="flex gap-2">
              {draft.status !== "LIVE" ? (
                <form action={setDraftStatus.bind(null, id, "LIVE")}>
                  <button className="rounded-xl bg-emerald-400 px-4 py-2 text-zinc-950">
                    Start / resume
                  </button>
                </form>
              ) : (
                <form action={setDraftStatus.bind(null, id, "PAUSED")}>
                  <button className="rounded-xl border border-white/10 px-4 py-2">Pause</button>
                </form>
              )}
              <form action={setDraftStatus.bind(null, id, "COMPLETED")}>
                <button className="rounded-xl border border-white/10 px-4 py-2">Complete</button>
              </form>
            </div>
          ) : null}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          {canManageDraft ? (
            <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
              <h2 className="font-semibold">Make pick</h2>
              <div className="mt-5">
                <PickForm
                  action={makeDraftPick.bind(null, id)}
                  nextRound={draft.currentRound}
                  players={pool.map((player) => ({
                    id: player.id,
                    name: `${player.athlete.firstName} ${player.athlete.lastName} - ${player.position}`,
                  }))}
                  teams={teams.map((team) => ({
                    id: team.id,
                    name: `${team.club.name} - ${team._count.players} players`,
                  }))}
                />
              </div>
            </section>
          ) : null}
          <section>
            <h2 className="text-xl font-semibold">Draft board</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/[.08]">
              {draft.picks.map((pick) => (
                <div
                  className="grid grid-cols-[70px_1fr_1fr] border-b border-white/[.06] bg-[#0b100e] p-4 last:border-0"
                  key={pick.id}
                >
                  <b>#{pick.pickNumber}</b>
                  <span>
                    {pick.player.athlete.firstName} {pick.player.athlete.lastName}
                  </span>
                  <span className="text-zinc-400">
                    {pick.seasonClub.club.name} - R{pick.round}
                  </span>
                </div>
              ))}
              {draft.picks.length === 0 ? (
                <p className="bg-[#0b100e] p-8 text-center text-zinc-400">No picks yet.</p>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </OperationsShell>
  );
}
