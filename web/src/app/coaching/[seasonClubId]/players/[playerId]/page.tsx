import { notFound } from "next/navigation";
import { buildPlayerDevelopmentPlan } from "@/lib/coaching/player-development";
import { isAdoptablePlan } from "@/lib/coaching/plan-snapshot";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { loadActiveCoachingPlan } from "@/server/coaching/plans";
import { PlayerPlanView } from "../../../_components/player-plan-view";
import { PlanAdoptionPanel } from "../../../_components/plan-adoption-panel";
import { adoptDevelopmentPlan } from "./actions";

export const dynamic = "force-dynamic";

export default async function CoachingPlayerPage({ params }: { params: Promise<{ seasonClubId: string; playerId: string }> }) {
  const { seasonClubId, playerId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  // Only players of this club: a player id from another club must not resolve here.
  if (!data.roster.some((p) => p.playerId === playerId)) notFound();
  const plan = buildPlayerDevelopmentPlan(playerId, data.games, data.meta);

  // The adopted plan (if any) is independent of the live engine output: it is the frozen snapshot a
  // coach committed to, so it is loaded separately and shown next to the current recommendations.
  const adopted = await loadActiveCoachingPlan(scope.organizationId, playerId);
  const adoption = (
    <PlanAdoptionPanel
      action={adoptDevelopmentPlan.bind(null, seasonClubId, playerId)}
      adopted={adopted}
      planHasFocusAreas={isAdoptablePlan(plan)}
      planGamesPlayed={plan?.gamesPlayed ?? 0}
    />
  );

  if (!plan || plan.seasonClubId !== seasonClubId) {
    // On the roster but no games yet: show the same view with an empty plan rather than a 404.
    const p = data.roster.find((r) => r.playerId === playerId)!;
    return (
      <>
        <PlayerPlanView
          plan={{ playerId, name: p.name, jerseyNumber: p.jerseyNumber, seasonClubId, position: p.position, positionGroup: "UNKNOWN", gamesPlayed: 0, status: "INSUFFICIENT_DATA", focusAreas: [], strengths: [], readings: [] }}
        />
        {adoption}
      </>
    );
  }
  return (
    <>
      <PlayerPlanView plan={plan} />
      {adoption}
    </>
  );
}
