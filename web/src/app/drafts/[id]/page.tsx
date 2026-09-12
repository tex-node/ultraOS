import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { DraftEventOperatingMode, DraftSelectionGroup, DraftTier } from "@/generated/prisma/enums";
import { MissingOrganizationContextError, requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";
import {
  confirmSecondaryDraftPickAction,
  correctSecondaryDraftPickAction,
  makeDraftPick,
  reserveSecondaryDraftPickAction,
  resetSecondaryDraftRehearsalAction,
  revealSecondaryDraftPickAction,
  setDraftStatus,
  startSecondaryDraftSuspenseAction,
} from "../actions";
import { PickForm } from "../forms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DraftRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/drafts/${id}`);
  const session = await requireSession();
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const canManageDraft = hasPermission(session.user.roles, "draft:manage");
  const { draft, pool, teams } = await withOrganizationContext(session.user.organizationId, async (tx) => {
    const draft = await tx.draft.findUnique({
      include: {
        division: true,
        draftEvent: true,
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
    if (!draft) return { draft: null, pool: [], teams: [] };

    const poolGroup =
      draft.tier === DraftTier.MAIN ? DraftSelectionGroup.MAIN_DRAFT : DraftSelectionGroup.SECONDARY_DRAFT;

    const [pool, teams] = await Promise.all([
      tx.player.findMany({
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
      tx.seasonClub.findMany({
        include: { club: true, _count: { select: { players: true } } },
        orderBy: { club: { name: "asc" } },
        where: { divisionId: draft.divisionId, seasonId: draft.seasonId, status: "ACTIVE" },
      }),
    ]);
    return { draft, pool, teams };
  });
  if (!draft) notFound();

  const operatingMode = draft.draftEvent?.operatingMode ?? DraftEventOperatingMode.REHEARSAL;
  const isRehearsal = operatingMode === DraftEventOperatingMode.REHEARSAL;
  const pendingPick = draft.picks.find((pick) => pick.status === "RESERVED" || pick.status === "REVEALING" || pick.status === "REVEALED");

  const poolGroup =
    draft.tier === DraftTier.MAIN ? DraftSelectionGroup.MAIN_DRAFT : DraftSelectionGroup.SECONDARY_DRAFT;

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

        <div className={isRehearsal ? "mt-6 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100" : "mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100"}>
          <b>Mode: {operatingMode}{draft.tier === DraftTier.SECONDARY ? " — SECONDARY DRAFT" : ""}</b>
          <p className="mt-1 text-zinc-300">
            {isRehearsal
              ? draft.draftEvent
                ? `Rehearsal allocations are isolated to DraftEvent "${draft.draftEvent.name}" and do not write Player.seasonClubId.`
                : "No DraftEvent is linked to this Draft, so it is always treated as REHEARSAL — picks never write Player.seasonClubId."
              : "LIVE. Confirmed picks write the official Player.seasonClubId assignment."}
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          {canManageDraft ? (
            <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
              <h2 className="font-semibold">Reserve a pick (rehearsal-safe)</h2>
              <p className="mt-1 text-xs text-zinc-500">Reserve → reveal → confirm. The result is hidden from the public display until reveal.</p>
              <div className="mt-5">
                <PickForm
                  action={reserveSecondaryDraftPickAction.bind(null, id)}
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
              {pendingPick ? (
                <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                  <p className="text-xs uppercase tracking-[.2em] text-emerald-300">Pending pick #{pendingPick.pickNumber}</p>
                  <p className="mt-2 text-sm text-zinc-300">Status: {pendingPick.status}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={startSecondaryDraftSuspenseAction.bind(null, id, pendingPick.id)}><button className="rounded-lg border border-white/10 px-3 py-2 text-xs">Start suspense</button></form>
                    <form action={revealSecondaryDraftPickAction.bind(null, id, pendingPick.id)}><button className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950">Reveal</button></form>
                    <form action={confirmSecondaryDraftPickAction.bind(null, id, pendingPick.id)}><button className="rounded-lg border border-white/10 px-3 py-2 text-xs">{isRehearsal ? "Confirm rehearsal pick" : "Confirm official pick"}</button></form>
                  </div>
                </div>
              ) : null}
              <details className="mt-6 text-xs text-zinc-500">
                <summary className="cursor-pointer">Legacy atomic pick (no suspense)</summary>
                <div className="mt-3">
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
              </details>
              {isRehearsal ? (
                <form action={resetSecondaryDraftRehearsalAction.bind(null, id)} className="mt-6 grid gap-2 rounded-xl border border-white/[.08] bg-black/20 p-4">
                  <input className="rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-xs" name="reason" placeholder="Required reset reason" required />
                  <button className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs text-rose-100">Reset rehearsal picks</button>
                </form>
              ) : null}
            </section>
          ) : null}
          <section>
            <h2 className="text-xl font-semibold">Draft board</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/[.08]">
              {draft.picks.map((pick) => {
                const isRevealed = pick.status === "REVEALED" || pick.status === "CONFIRMED";
                return (
                  <div className="border-b border-white/[.06] bg-[#0b100e] p-4 last:border-0" key={pick.id}>
                    <div className="grid grid-cols-[70px_1fr_1fr]">
                      <b>#{pick.pickNumber}</b>
                      <span>{isRevealed ? `${pick.player.athlete.firstName} ${pick.player.athlete.lastName}` : pick.status === "CORRECTED" ? "(corrected)" : "On the clock..."}</span>
                      <span className="text-zinc-400">{isRevealed ? `${pick.seasonClub.club.name} - R${pick.round}` : pick.status}</span>
                    </div>
                    {isRevealed && pick.status !== "CORRECTED" ? (
                      <form action={correctSecondaryDraftPickAction.bind(null, id, pick.id)} className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                        <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" name="reason" placeholder="Required correction reason" required />
                        <button className="rounded-lg border border-amber-400/40 px-2 py-1 text-xs text-amber-100">Correct</button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
              {draft.picks.length === 0 ? (
                <p className="bg-[#0b100e] p-8 text-center text-zinc-400">No picks yet.</p>
              ) : null}
            </div>
            <Link className="mt-4 inline-block text-sm text-emerald-400" href={`/drafts/${id}/display${draft.draftEvent?.displayToken ? `?token=${draft.draftEvent.displayToken}` : ""}`}>
              Open public display →
            </Link>
          </section>
        </div>
      </main>
    </OperationsShell>
  );
}
