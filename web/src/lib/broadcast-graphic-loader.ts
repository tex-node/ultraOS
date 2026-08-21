// Shared loader for every browser-source graphics route under /broadcast/game/[gameId]/* (G.19
// Part X). One place that (a) enforces production presentation scope on a direct-ID URL and (b)
// builds the one LivePresentationModel every graphic reads from - so no individual graphic page
// ever touches Prisma or recomputes a statistic itself (Part XI).
import { prisma } from "@/lib/prisma";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import type { LivePresentationModel } from "@/lib/live-presentation-model";

export type GraphicFixture = {
  id: string;
  homeSeasonClub: { club: { name: string; shortName: string } };
  awaySeasonClub: { club: { name: string; shortName: string } };
};

export async function loadProductionGraphicModel(gameId: string): Promise<{ fixture: GraphicFixture; model: LivePresentationModel } | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } } },
  });
  if (!game || !isProductionPresentationFixture(game.fixture)) return null;
  const model = await buildLivePresentationModelForGame(gameId);
  return { fixture: game.fixture, model };
}

// Display-only identity lookup (name/club/photo) for a given playerId - never a statistic. The
// Player Spotlight / 4PT Moment graphics need this because LivePresentationModel's `players`/
// `leaders` arrays carry playerId + stat values but not display name (event-derived-stats.ts has
// no display fields at all - it's a pure statistical reducer).
export async function resolvePlayerDisplay(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { athlete: { select: { firstName: true, lastName: true } } },
  });
  if (!player) return null;
  return { name: `${player.athlete.firstName} ${player.athlete.lastName}`, jerseyNumber: player.jerseyNumber };
}
