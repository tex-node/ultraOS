import "server-only";

import type { GameEvent } from "@/generated/prisma/client";
import { buildVoidData } from "@/lib/scoring/void-data";
import {
  computeScoreEventContribution,
  negateScoreEventContribution,
} from "@/lib/scoring/score-event-contribution";
import { applyPlayerShotStatDeltas, applyTeamShotStatDeltas } from "./applyShotStatDeltas";
import type { WriteContext } from "./types";
import type { MutableGame } from "./load-mutable-game";

export interface VoidScoreEventResult {
  voided: GameEvent;
  previousScore: number;
  newScore: number;
}

// The fifth canonical-write shape (A3a Batch 11): status-flip WITH coupled projection reversal,
// under the mutable gate. This is a deliberate departure from every prior service
// (createGameEvent, correctStatisticianEvent, voidGameEvent), none of which touch
// Fixture.homeScore/awayScore or PlayerStat/TeamStat - see docs/canonical-write-audit.md, "Coupled
// writes in voidScoreEvent/correctScoreEvent are not a side effect", for why that's correct here
// rather than a pattern violation: the delta reversal is intrinsic to what "void a score event"
// means, not an effect a caller could legitimately omit.
//
// Unlike voidGameEvent, this loads and validates the event itself rather than trusting a
// caller-resolved id - it needs the event's own basePointValue/isUltraTime/points for the delta
// computation, and an eventType check voidGameEvent doesn't have. It does NOT delegate to
// voidGameEvent to get the status-flip: that would mean a double-load of the same row, or a
// `preloaded?` escape hatch, for the sake of not duplicating a five-field object literal that
// buildVoidData already de-duplicates as a pure builder shared by both services.
export async function voidScoreEvent(
  eventId: string,
  reason: string,
  ctx: WriteContext & { game: MutableGame },
): Promise<VoidScoreEventResult> {
  const tx = ctx.tx;
  const event = await tx.gameEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (event.gameId !== ctx.game.id) throw new Error("INVALID_EVENT");
  if (event.eventType !== "SCORE" && event.eventType !== "SCORE_CORRECTION") throw new Error("NOT_A_SCORE_EVENT");
  if (event.status !== "ACTIVE") throw new Error("EVENT_NOT_ACTIVE");

  const eventPoints = event.points ?? 0;
  const isHome = event.seasonClubId === ctx.game.fixture.homeSeasonClubId!;
  const currentScore = isHome ? ctx.game.fixture.homeScore : ctx.game.fixture.awayScore;
  const newScore = Math.max(0, currentScore - eventPoints);

  await tx.fixture.update({
    where: { id: ctx.game.fixtureId },
    data: isHome ? { homeScore: newScore } : { awayScore: newScore },
  });
  const voided = await tx.gameEvent.update({
    where: { id: event.id },
    data: buildVoidData(reason, ctx.actor.id),
  });

  const reversed = negateScoreEventContribution(
    computeScoreEventContribution(event.basePointValue, event.isUltraTime, eventPoints),
  );
  if (event.playerId) {
    await applyPlayerShotStatDeltas(
      tx,
      ctx.actor.organizationId,
      ctx.game.id,
      event.playerId,
      event.seasonClubId!,
      reversed.playerDeltas,
      reversed.pointsDelta,
    );
  }
  await applyTeamShotStatDeltas(
    tx,
    ctx.actor.organizationId,
    ctx.game.id,
    event.seasonClubId!,
    reversed.playerDeltas,
    reversed.teamUltraTimeForDelta,
    0,
    newScore,
  );
  if (reversed.opponentUltraTimeAgainstDelta !== 0) {
    const opposingSeasonClubId = isHome ? ctx.game.fixture.awaySeasonClubId! : ctx.game.fixture.homeSeasonClubId!;
    await applyTeamShotStatDeltas(
      tx,
      ctx.actor.organizationId,
      ctx.game.id,
      opposingSeasonClubId,
      { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
      0,
      reversed.opponentUltraTimeAgainstDelta,
      isHome ? ctx.game.fixture.awayScore : ctx.game.fixture.homeScore,
    );
  }

  return { voided, previousScore: currentScore, newScore };
}
