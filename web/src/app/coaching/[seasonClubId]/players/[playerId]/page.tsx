import { notFound } from "next/navigation";
import { buildPlayerDevelopmentPlan } from "@/lib/coaching/player-development";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { PlayerPlanView } from "../../../_components/player-plan-view";

export const dynamic = "force-dynamic";

export default async function CoachingPlayerPage({ params }: { params: Promise<{ seasonClubId: string; playerId: string }> }) {
  const { seasonClubId, playerId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  // Only players of this club: a player id from another club must not resolve here.
  if (!data.roster.some((p) => p.playerId === playerId)) notFound();
  const plan = buildPlayerDevelopmentPlan(playerId, data.games, data.meta);
  if (!plan || plan.seasonClubId !== seasonClubId) {
    // On the roster but no games yet: show the same view with an empty plan rather than a 404.
    const p = data.roster.find((r) => r.playerId === playerId)!;
    return (
      <PlayerPlanView
        plan={{ playerId, name: p.name, jerseyNumber: p.jerseyNumber, seasonClubId, position: p.position, positionGroup: "UNKNOWN", gamesPlayed: 0, status: "INSUFFICIENT_DATA", focusAreas: [], strengths: [], readings: [] }}
      />
    );
  }
  return <PlayerPlanView plan={plan} />;
}
