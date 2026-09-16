import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { loadPublicGame } from "@/lib/api-v1/game-loader";
import { honestClock, type LiveGameV1 } from "@/lib/api-v1/contracts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/games/[publicId] - fixtureId is the public identifier (Part XV: no dedicated slug
// exists; the cuid is already the public routing identifier via /public/fixtures/[id]).
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const loaded = await loadPublicGame(publicId);
    if (!loaded) return apiError("GAME_NOT_FOUND", "No game found for this id.");
    const { fixture, model } = loaded;
    const generatedAt = new Date().toISOString();
    const game: LiveGameV1 = {
      fixtureId: fixture.id, gameId: fixture.game!.id, status: model.status,
      home: { publicId: fixture.homeSeasonClub!.club.shortName.toLowerCase(), name: fixture.homeSeasonClub!.club.name, shortName: fixture.homeSeasonClub!.club.shortName },
      away: { publicId: fixture.awaySeasonClub!.club.shortName.toLowerCase(), name: fixture.awaySeasonClub!.club.name, shortName: fixture.awaySeasonClub!.club.shortName },
      score: model.score, period: model.period, periodLabel: model.periodLabel,
      clock: honestClock(model.status, model.clock), shotClock: honestClock(model.status, model.shotClock),
      ultraTime: {
        active: model.ultraTime.phase === "ACTIVE", approaching: model.ultraTime.phase === "APPROACHING",
        secondsUntilStart: model.ultraTime.phase === "APPROACHING" ? model.ultraTime.secondsUntilStart : null,
      },
      capability: model.dataCapability,
      generatedAt, dataUpdatedAt: generatedAt,
    };
    return NextResponse.json(game);
  });
}
