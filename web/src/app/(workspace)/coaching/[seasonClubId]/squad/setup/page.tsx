import { hasUsableHeight, hasUsablePosition, SQUAD_SETUP_BANNER, squadNeedsPositions } from "@/lib/coaching/squad-setup";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { Banner } from "../../../_components/ui";
import { SquadSetupForm } from "../../../_components/squad-setup-form";
import { saveSquadSetup } from "./actions";

export const dynamic = "force-dynamic";

export default async function CoachingSquadSetupPage({ params }: { params: Promise<{ seasonClubId: string }> }) {
  const { seasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  const players = data.roster.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    jerseyNumber: p.jerseyNumber,
    position: p.position,
    usablePosition: hasUsablePosition(p.position),
    heightCm: p.heightCm,
    // heightCm is a NOT NULL column; 0 is the placeholder for "not recorded", so it shows as empty.
    usableHeight: hasUsableHeight(p.heightCm),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">Set up the squad</h1>
      <p className="mt-1 text-sm text-text-2">Positions let the plans compare each player with their position peers, and let defender matching use position and height.</p>
      {squadNeedsPositions(data.roster) ? <div className="mt-3"><Banner>{SQUAD_SETUP_BANNER}</Banner></div> : null}
      <div className="mt-4">
        <SquadSetupForm action={saveSquadSetup.bind(null, seasonClubId)} players={players} />
      </div>
    </div>
  );
}
