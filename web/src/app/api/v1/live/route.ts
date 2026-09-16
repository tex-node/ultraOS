import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { productionPresentationFixtureWhere } from "@/lib/presentation-scope";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import type { LiveGameV1 } from "@/lib/api-v1/contracts";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/live - every currently live PRODUCTION game (Part XIV). Public, no auth.
export async function GET(request: Request) {
  return withPublicApiV1(request, async () => {
    const organization = await resolveDefaultPublicOrganization();
    const fixtures = await withOrganizationContext(organization.id, (tx) =>
      tx.fixture.findMany({
        where: { game: { status: { in: ["LIVE", "PAUSED"] } }, ...productionPresentationFixtureWhere() },
        include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
      }),
    );
    const generatedAt = new Date().toISOString();
    const games: LiveGameV1[] = await withOrganizationContext(organization.id, (tx) => Promise.all(fixtures.map(async (f) => {
      const model = await buildLivePresentationModelForGame(f.game!.id, tx);
      return {
        fixtureId: f.id, gameId: f.game!.id, status: model.status,
        home: { publicId: f.homeSeasonClub!.club.shortName.toLowerCase(), name: f.homeSeasonClub!.club.name, shortName: f.homeSeasonClub!.club.shortName },
        away: { publicId: f.awaySeasonClub!.club.shortName.toLowerCase(), name: f.awaySeasonClub!.club.name, shortName: f.awaySeasonClub!.club.shortName },
        score: model.score, period: model.period, periodLabel: model.periodLabel,
        clock: model.clock, shotClock: model.shotClock,
        ultraTime: {
          active: model.ultraTime.phase === "ACTIVE", approaching: model.ultraTime.phase === "APPROACHING",
          secondsUntilStart: model.ultraTime.phase === "APPROACHING" ? model.ultraTime.secondsUntilStart : null,
        },
        capability: model.dataCapability,
        generatedAt, dataUpdatedAt: generatedAt,
      };
    })));
    return NextResponse.json({ games, generatedAt });
  });
}
