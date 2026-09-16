import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { loadPublicGame } from "@/lib/api-v1/game-loader";
import { resolvePlayerNames } from "@/lib/api-v1/identifiers";
import type { BoxScoreV1 } from "@/lib/api-v1/contracts";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const loaded = await loadPublicGame(publicId);
    if (!loaded) return apiError("GAME_NOT_FOUND", "No game found for this id.");
    const { fixture, model } = loaded;

    const organization = await resolveDefaultPublicOrganization();
    const names = await withOrganizationContext(organization.id, (tx) => resolvePlayerNames(model.players.map((p) => p.playerId), tx));
    const clubFor = (seasonClubId: string) => seasonClubId === model.teams.home.seasonClubId
      ? { publicId: fixture.homeSeasonClub!.club.shortName.toLowerCase(), name: fixture.homeSeasonClub!.club.name, shortName: fixture.homeSeasonClub!.club.shortName }
      : { publicId: fixture.awaySeasonClub!.club.shortName.toLowerCase(), name: fixture.awaySeasonClub!.club.name, shortName: fixture.awaySeasonClub!.club.shortName };

    const generatedAt = new Date().toISOString();
    const boxScore: BoxScoreV1 = {
      fixtureId: fixture.id, gameId: fixture.game!.id, status: model.status, capability: model.dataCapability,
      home: { ...clubFor(model.teams.home.seasonClubId), score: model.score.home },
      away: { ...clubFor(model.teams.away.seasonClubId), score: model.score.away },
      players: model.players.map((p) => ({
        player: { publicId: names.get(p.playerId)?.publicId ?? null, name: names.get(p.playerId)?.name ?? "Player" },
        club: clubFor(p.seasonClubId),
        points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls,
        fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted,
        fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted,
      })),
      generatedAt, dataUpdatedAt: generatedAt,
    };
    return NextResponse.json(boxScore);
  });
}
