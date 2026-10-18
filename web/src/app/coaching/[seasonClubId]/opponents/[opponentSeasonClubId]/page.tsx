import { notFound } from "next/navigation";
import { buildGamePlan } from "@/lib/coaching/game-plan";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { GamePlanView, type PlayedGame } from "../../../_components/game-plan-view";

export const dynamic = "force-dynamic";

export default async function CoachingGamePlanPage({ params }: { params: Promise<{ seasonClubId: string; opponentSeasonClubId: string }> }) {
  const { seasonClubId, opponentSeasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  // The opponent can be any other club in the same season; anything else is a 404.
  if (opponentSeasonClubId === seasonClubId || !data.clubs.some((c) => c.seasonClubId === opponentSeasonClubId)) notFound();

  const plan = buildGamePlan(data.games, seasonClubId, opponentSeasonClubId, data.meta);
  const played: PlayedGame[] = data.games
    .filter((g) => (g.home.seasonClubId === seasonClubId && g.away.seasonClubId === opponentSeasonClubId) || (g.away.seasonClubId === seasonClubId && g.home.seasonClubId === opponentSeasonClubId))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .map((g) => {
      const home = g.home.seasonClubId === seasonClubId;
      return { gameId: g.gameId, scheduledAt: g.scheduledAt, focusScore: home ? g.home.score : g.away.score, opponentScore: home ? g.away.score : g.home.score };
    });

  // The Selection Advisor is fixture-scoped (it needs the game, not just the opponent), so it is
  // linked from here only when this club actually has an upcoming fixture against this opponent.
  const upcomingVsOpponent = data.upcoming.filter((u) => u.opponent.seasonClubId === opponentSeasonClubId);
  const rotationLinks =
    upcomingVsOpponent.length > 0 ? (
      <section data-testid="rotation-links" className="mb-4 rounded-lg border border-line bg-ink-800 p-4 print:hidden">
        <h2 className="text-sm font-semibold text-text-1">Rotation for the next game</h2>
        <ul className="mt-2 space-y-1">
          {upcomingVsOpponent.map((u) => (
            <li key={u.fixtureId} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-text-2">
                {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(u.scheduledAt)} Â· {u.isHome ? "home" : "away"}
              </span>
              <a href={`/coaching/selection/${u.fixtureId}`} className="text-info underline">
                Selection advisor
              </a>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  if (!plan) {
    // One of the two clubs has no finished games, so there is no profile to plan from.
    const name = data.clubs.find((c) => c.seasonClubId === opponentSeasonClubId)!.name;
    return (
      <>
        {rotationLinks}
        <GamePlanView
          seasonClubId={seasonClubId}
          played={played}
          plan={{
            focus: { seasonClubId, name: scope.clubName, games: 0 },
            opponent: { seasonClubId: opponentSeasonClubId, name, games: 0 },
            status: "INSUFFICIENT_DATA",
            insufficientReason: "One of the two clubs has no finished games yet, so there is nothing to plan from.",
            keys: [], howTheyBeatUs: [], assignments: [], lateGame: null,
            headToHead: { games: 0, focusWins: 0, focusLosses: 0, results: [] },
            defenseNote: "",
          }}
        />
      </>
    );
  }
  return (
    <>
      {rotationLinks}
      <GamePlanView plan={plan} seasonClubId={seasonClubId} played={played} />
    </>
  );
}
