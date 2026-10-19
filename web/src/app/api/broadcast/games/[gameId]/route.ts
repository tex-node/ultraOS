import { NextResponse } from "next/server";
import { fixtureSide } from "@/lib/fixture-side";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { effectiveRuleSnapshot } from "@/lib/ultra-scoring-engine";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, read-only, presentation-safe game state for OBS/vMix and other broadcast tooling.
// Never include contact info, Application data, or anything from a private/admin model here.
//
// G.19 Part III/XI: previously computed score/clock/Ultra Time independently of Snapshot V2 -
// a second, direct-ID-reachable copy of the same logic live-game-snapshot-v2.ts already owns,
// with no production/rehearsal isolation at all. Now sources every number from the same
// LivePresentationModel every other surface uses, and refuses to serve a non-PRODUCTION fixture.
export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const loaded = await withOrganizationContext(organization.id, async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixture: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
            homeEntrant: { select: { id: true, name: true } },
            awayEntrant: { select: { id: true, name: true } },
          },
        },
        ruleSnapshot: true,
      },
    });
    if (!game || !isProductionPresentationFixture(game.fixture)) return null;
    const model = await buildLivePresentationModelForGame(gameId, tx);
    return { game, model };
  });
  if (!loaded) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { game, model } = loaded;

  const rules = effectiveRuleSnapshot(game.ruleSnapshot);

  return NextResponse.json({
    gameId: game.id,
    fixtureId: game.fixtureId,
    // Sides are a club OR an entrant (streak v10): the broadcast API used non-null club assertions and crashed
    // on an individual-sport fixture.
    homeClub: fixtureSide(game.fixture.homeSeasonClub, game.fixture.homeEntrant).name,
    homeShortName: fixtureSide(game.fixture.homeSeasonClub, game.fixture.homeEntrant).shortName,
    homeLogo: fixtureSide(game.fixture.homeSeasonClub, game.fixture.homeEntrant).logoUrl,
    homeScore: model.score.home,
    awayClub: fixtureSide(game.fixture.awaySeasonClub, game.fixture.awayEntrant).name,
    awayShortName: fixtureSide(game.fixture.awaySeasonClub, game.fixture.awayEntrant).shortName,
    awayLogo: fixtureSide(game.fixture.awaySeasonClub, game.fixture.awayEntrant).logoUrl,
    awayScore: model.score.away,
    half: model.periodLabel,
    gameClockSeconds: model.clock.remainingSeconds,
    shotClockSeconds: model.shotClock.remainingSeconds,
    gameStatus: model.status,
    ultraTimeActive: model.ultraTime.phase === "ACTIVE",
    ultraTimeMultiplier: rules.ultraTimeMultiplier,
    fourPointEnabled: rules.fourPointEnabled,
    dataCapability: game.dataCapability,
  });
}
