import { buildSquadDevelopmentPlans } from "@/lib/coaching/player-development";
import { squadNeedsPositions } from "@/lib/coaching/squad-setup";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { SquadView } from "../../_components/squad-view";

export const dynamic = "force-dynamic";

export default async function CoachingSquadPage({ params }: { params: Promise<{ seasonClubId: string }> }) {
  const { seasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  const plans = buildSquadDevelopmentPlans(data.games, seasonClubId, data.meta);
  const planned = new Set(plans.map((p) => p.playerId));
  const unassessed = data.roster.filter((p) => !planned.has(p.playerId)).map((p) => ({ playerId: p.playerId, name: p.name, jerseyNumber: p.jerseyNumber }));

  return <SquadView seasonClubId={seasonClubId} clubName={scope.clubName} plans={plans} unassessed={unassessed} needsPositions={squadNeedsPositions(data.roster)} />;
}
