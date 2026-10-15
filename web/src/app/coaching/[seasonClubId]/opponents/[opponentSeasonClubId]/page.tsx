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

  if (!plan) {
    // One of the two clubs has no finished games, so there is no profile to plan from.
    const name = data.clubs.find((c) => c.seasonClubId === opponentSeasonClubId)!.name;
    return (
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
    );
  }
  return <GamePlanView plan={plan} seasonClubId={seasonClubId} played={played} />;
}
