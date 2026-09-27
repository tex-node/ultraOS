import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ShotStatDeltas } from "@/lib/ultra-scoring-engine";
import { mergeShotStatDeltas } from "@/lib/scoring/shot-stat-deltas";

// Relocated verbatim from web/src/app/games/actions.ts (A3a Batch S) to satisfy the
// canonical-write ESLint boundary (raw playerStat/teamStat writes are only allowed under
// src/server/scoring/**). This is a pure relocation, not a model change: the scorer console's
// incrementally-maintained PlayerStat/TeamStat stays its own deliberately independent authority,
// separate from the statistician console's event-derived rebuildGameStatsFromEvents - see
// docs/canonical-write-audit.md, "Open question before A3b", for why these two models are not
// meant to converge. Function bodies are unchanged from the pre-move version, aside from
// mergeShotStatDeltas itself moving one level further, to src/lib/scoring/ - it's pure (no
// Prisma, no server-only) and testable without a database, same split as
// buildGameEventCreateData vs createGameEvent.

// Applies a made shot's per-category deltas (and its raw point delta) to a player's stat
// line for this game - or reverses them, when called with negateShotStatDeltas(deltas) and a
// negative pointsDelta, from the void/correction paths. NULL fields become real zeros the
// first time a native shot touches this row, per the "0 is captured, null is not" convention -
// correct here because live scoring genuinely observes every shot category.
export async function applyPlayerShotStatDeltas(
  tx: Prisma.TransactionClient,
  organizationId: string,
  gameId: string,
  playerId: string,
  seasonClubId: string,
  deltas: ShotStatDeltas,
  pointsDelta: number,
) {
  const existing = await tx.playerStat.findUnique({ where: { gameId_playerId: { gameId, playerId } } });
  const merged = mergeShotStatDeltas(existing, deltas);
  await tx.playerStat.upsert({
    where: { gameId_playerId: { gameId, playerId } },
    create: { organizationId, gameId, playerId, seasonClubId, points: Math.max(0, pointsDelta), ...merged, statSource: "ULTRA_NATIVE_LIVE_SCORER" },
    update: { points: Math.max(0, (existing?.points ?? 0) + pointsDelta), ...merged, statSource: "ULTRA_NATIVE_LIVE_SCORER" },
  });
}

// Team-level Ultra aggregates are narrower than the player-level ones (no plain-time FG
// breakdown is tracked at team granularity - see TeamStat in schema.prisma), so this only
// carries the subset that model actually has columns for.
export async function applyTeamShotStatDeltas(
  tx: Prisma.TransactionClient,
  organizationId: string,
  gameId: string,
  seasonClubId: string,
  deltas: Pick<ShotStatDeltas, "fourPointsMade" | "fourPointsAttempted" | "ultraTimeFieldGoalsMade" | "ultraTimeFieldGoalsAttempted">,
  ultraTimePointsForDelta: number,
  ultraTimePointsAgainstDelta: number,
  absolutePoints: number,
) {
  const existing = await tx.teamStat.findUnique({ where: { gameId_seasonClubId: { gameId, seasonClubId } } });
  const merge = (field: keyof typeof deltas | "ultraTimePointsFor" | "ultraTimePointsAgainst", delta: number) =>
    (existing?.[field] ?? 0) + delta;
  await tx.teamStat.upsert({
    where: { gameId_seasonClubId: { gameId, seasonClubId } },
    create: {
      organizationId,
      gameId,
      seasonClubId,
      points: absolutePoints,
      fourPointsMade: deltas.fourPointsMade,
      fourPointsAttempted: deltas.fourPointsAttempted,
      ultraTimeFieldGoalsMade: deltas.ultraTimeFieldGoalsMade,
      ultraTimeFieldGoalsAttempted: deltas.ultraTimeFieldGoalsAttempted,
      ultraTimePointsFor: ultraTimePointsForDelta,
      ultraTimePointsAgainst: ultraTimePointsAgainstDelta,
      statSource: "ULTRA_NATIVE_LIVE_SCORER",
    },
    update: {
      points: absolutePoints,
      fourPointsMade: merge("fourPointsMade", deltas.fourPointsMade),
      fourPointsAttempted: merge("fourPointsAttempted", deltas.fourPointsAttempted),
      ultraTimeFieldGoalsMade: merge("ultraTimeFieldGoalsMade", deltas.ultraTimeFieldGoalsMade),
      ultraTimeFieldGoalsAttempted: merge("ultraTimeFieldGoalsAttempted", deltas.ultraTimeFieldGoalsAttempted),
      ultraTimePointsFor: merge("ultraTimePointsFor", ultraTimePointsForDelta),
      ultraTimePointsAgainst: merge("ultraTimePointsAgainst", ultraTimePointsAgainstDelta),
      statSource: "ULTRA_NATIVE_LIVE_SCORER",
    },
  });
}
