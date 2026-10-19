import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { productionPresentationFixtureWhere } from "@/lib/presentation-scope";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import type { LiveGameV1 } from "@/lib/api-v1/contracts";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// One side of a fixture, for a team sport (club) or an individual sport (entrant).
function sideSummary(club: { club: { name: string; shortName: string } } | null, entrant: { id: string; name: string } | null) {
  if (club) {
    return { publicId: club.club.shortName.toLowerCase(), name: club.club.name, shortName: club.club.shortName };
  }
  const name = entrant?.name ?? "TBD";
  return { publicId: (entrant?.id ?? "tbd").toLowerCase(), name, shortName: name.slice(0, 5).toUpperCase() };
}

// GET /api/v1/live - every currently live PRODUCTION game (Part XIV). Public, no auth.
export async function GET(request: Request) {
  return withPublicApiV1(request, async () => {
    const organization = await resolveDefaultPublicOrganization();
    const fixtures = await withOrganizationContext(organization.id, (tx) =>
      tx.fixture.findMany({
        where: { game: { status: { in: ["LIVE", "PAUSED"] } }, ...productionPresentationFixtureWhere() },
        include: {
          homeSeasonClub: { include: { club: true } },
          awaySeasonClub: { include: { club: true } },
          homeEntrant: { select: { id: true, name: true } },
          awayEntrant: { select: { id: true, name: true } },
          game: true,
        },
      }),
    );
    const generatedAt = new Date().toISOString();
    const games: LiveGameV1[] = await withOrganizationContext(organization.id, (tx) => Promise.all(fixtures.map(async (f) => {
      const model = await buildLivePresentationModelForGame(f.game!.id, tx);
      return {
        fixtureId: f.id, gameId: f.game!.id, status: model.status,
        // A side is a SeasonClub (team sports) or an Entrant (individual sports). The live widget used to
        // assume a club and threw "Cannot read properties of null (reading 'club')" on the first live tennis or
        // volleyball fixture - a 500 on the league's free scoreboard (streak v9, found by the API-key run).
        home: sideSummary(f.homeSeasonClub ?? null, f.homeEntrant ?? null),
        away: sideSummary(f.awaySeasonClub ?? null, f.awayEntrant ?? null),
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
  }, { requireKey: false });
}
