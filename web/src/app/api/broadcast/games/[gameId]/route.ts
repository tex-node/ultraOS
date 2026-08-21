import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { effectiveRuleSnapshot } from "@/lib/ultra-scoring-engine";

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
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } },
      ruleSnapshot: true,
    },
  });
  if (!game || !isProductionPresentationFixture(game.fixture)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const model = await buildLivePresentationModelForGame(gameId);
  const rules = effectiveRuleSnapshot(game.ruleSnapshot);

  return NextResponse.json({
    gameId: game.id,
    fixtureId: game.fixtureId,
    homeClub: game.fixture.homeSeasonClub.club.name,
    homeShortName: game.fixture.homeSeasonClub.club.shortName,
    homeLogo: game.fixture.homeSeasonClub.club.logoUrl,
    homeScore: model.score.home,
    awayClub: game.fixture.awaySeasonClub.club.name,
    awayShortName: game.fixture.awaySeasonClub.club.shortName,
    awayLogo: game.fixture.awaySeasonClub.club.logoUrl,
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
