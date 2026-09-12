import { NextResponse } from "next/server";
import { buildLiveGameSnapshot } from "@/lib/live-game-snapshot";
import { remainingClockSeconds } from "@/lib/game-clock";
import { remainingShotClockSeconds } from "@/lib/game-rules";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, read-only live-state snapshot for one game: score, clock, shot clock, period, Ultra
// Time state, data capability, score-reconciliation status, and the most recent events. Never
// exposes operator identity, PII, or internal correction reasons - only what a public /live
// page or a broadcast consumer would already show. Composes with, rather than duplicates,
// /api/games/[id]/box-score (full team/player lines) - fetch both if a consumer needs everything.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const loaded = await withOrganizationContext(organization.id, async (tx) => {
    const game = await tx.game.findUnique({
      where: { id },
      include: { fixture: true },
    });
    if (!game) return null;
    const [statisticianEvents, recentEvents] = await Promise.all([
      tx.gameEvent.findMany({
        where: { gameId: game.id, source: "ULTRA_NATIVE_LIVE_STATISTICIAN" },
        select: { seasonClubId: true, points: true, status: true },
      }),
      tx.gameEvent.findMany({
        where: { gameId: game.id, status: "ACTIVE" },
        orderBy: [{ sequenceNumber: "desc" }, { createdAt: "desc" }],
        take: 15,
        select: { id: true, eventType: true, description: true, period: true, clockSeconds: true, sequenceNumber: true, source: true, status: true },
      }),
    ]);
    return { game, statisticianEvents, recentEvents };
  });
  const game = loaded?.game;
  if (!game) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { statisticianEvents, recentEvents } = loaded;

  const snapshot = buildLiveGameSnapshot({
    gameId: game.id,
    status: game.status,
    currentPeriod: game.currentPeriod,
    remainingClockSeconds: remainingClockSeconds(game),
    clockRunning: Boolean(game.clockStartedAt),
    remainingShotClockSeconds: remainingShotClockSeconds(game),
    shotClockRunning: Boolean(game.shotClockStartedAt),
    isUltraTimeActive: game.isUltraTimeActive,
    dataCapability: game.dataCapability,
    homeSeasonClubId: game.fixture.homeSeasonClubId,
    awaySeasonClubId: game.fixture.awaySeasonClubId,
    officialHomeScore: game.fixture.homeScore,
    officialAwayScore: game.fixture.awayScore,
    statisticianEvents,
    recentEvents,
  });

  return NextResponse.json(snapshot);
}
