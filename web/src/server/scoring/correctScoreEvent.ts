import "server-only";

import type { GameEvent } from "@/generated/prisma/client";
import {
  addScoreEventContributions,
  computeScoreEventContribution,
  negateScoreEventContribution,
} from "@/lib/scoring/score-event-contribution";
import { applyPlayerShotStatDeltas, applyTeamShotStatDeltas } from "./applyShotStatDeltas";
import { createGameEvent } from "./createGameEvent";
import type { WriteContext } from "./types";
import type { MutableGame } from "./load-mutable-game";

export interface CorrectScoreEventInput {
  eventId: string;
  reason: string;
  // Fully resolved by the caller (shot legality under current rules, wrong-player validation) -
  // this service is the write mechanic, not the rules engine. pointsAwarded is the corrected
  // shot's raw value (e.g. 3 for a 3PT make) - the score-floor clamp against the base score
  // happens here, not in the caller, since it depends on the original event's own contribution.
  replacement: {
    playerId?: string | null;
    basePointValue: number | null;
    multiplier: number | null;
    isUltraTime: boolean;
    pointsAwarded: number;
  };
}

export interface CorrectScoreEventResult {
  original: GameEvent;
  replacement: { id: string; sequenceNumber: number };
  previousScore: number;
  newScore: number;
  // The replacement event's actual points delta - not derivable as `newScore - previousScore` by
  // a caller, since that arithmetic silently breaks if the score-floor clamp (never below 0) ever
  // applies. Returned explicitly so callers building an audit log don't have to back-solve it.
  actualPoints: number;
}

// The fourth named shape (A3a Batch 11): mutable-gate supersession + coupled delta reversal,
// REPLACE-only - voiding is the separate voidScoreEvent, this never marks an event VOIDED. Same
// "coupled writes are intrinsic, not a side effect" departure voidScoreEvent takes - see
// docs/canonical-write-audit.md.
//
// Uses createGameEvent for the replacement insert (unlike correctStatisticianEvent, which builds
// its create call manually): correctStatisticianEvent runs under withFinalGameWrite's FINAL-only
// gate, incompatible with createGameEvent's internal mutable-only loadMutableGame call, so it has
// no choice but to build the insert itself. correctScoreEvent runs under the same mutable gate
// createGameEvent already asserts internally, so reusing it - period/clockSeconds passed explicitly
// to preserve the original event's frozen values, not "now" - is the smaller, more consistent
// diff, same as Batch 10a/10b's sites.
export async function correctScoreEvent(
  input: CorrectScoreEventInput,
  ctx: WriteContext & { game: MutableGame },
): Promise<CorrectScoreEventResult> {
  const tx = ctx.tx;
  const original = await tx.gameEvent.findUniqueOrThrow({ where: { id: input.eventId } });
  if (original.gameId !== ctx.game.id) throw new Error("INVALID_EVENT");
  if (original.eventType !== "SCORE" && original.eventType !== "SCORE_CORRECTION") throw new Error("NOT_A_SCORE_EVENT");
  if (original.status !== "ACTIVE") throw new Error("EVENT_NOT_ACTIVE");
  if (original.seasonClubId === null) throw new Error("INVALID_EVENT");

  const eventPoints = original.points ?? 0;
  const isHome = original.seasonClubId === ctx.game.fixture.homeSeasonClubId!;
  const currentScore = isHome ? ctx.game.fixture.homeScore : ctx.game.fixture.awayScore;
  const baseScore = Math.max(0, currentScore - eventPoints);
  const newScore = Math.max(0, baseScore + input.replacement.pointsAwarded);
  const actualPoints = newScore - baseScore;
  const finalPlayerId = input.replacement.playerId ?? original.playerId ?? undefined;

  await tx.fixture.update({
    where: { id: ctx.game.fixtureId },
    data: isHome ? { homeScore: newScore } : { awayScore: newScore },
  });
  const corrected = await tx.gameEvent.update({
    where: { id: original.id },
    data: {
      status: "CORRECTED",
      correctedAt: new Date(),
      correctedById: ctx.actor.id,
      correctionReason: input.reason,
    },
  });
  const replacement = await createGameEvent(
    {
      gameId: ctx.game.id,
      fixtureId: ctx.game.fixtureId,
      seasonClubId: original.seasonClubId,
      playerId: finalPlayerId,
      eventType: "SCORE_CORRECTION",
      points: actualPoints,
      basePointValue: input.replacement.basePointValue,
      multiplier: input.replacement.multiplier,
      period: original.period,
      clockSeconds: original.clockSeconds ?? undefined,
      description: `Correction: ${input.reason}`,
      made: input.replacement.basePointValue !== null,
      isFourPointAttempt: input.replacement.basePointValue === 4,
      isUltraTime: input.replacement.isUltraTime,
      homeScoreBefore: isHome ? baseScore : ctx.game.fixture.homeScore,
      awayScoreBefore: isHome ? ctx.game.fixture.awayScore : baseScore,
      homeScoreAfter: isHome ? newScore : ctx.game.fixture.homeScore,
      awayScoreAfter: isHome ? ctx.game.fixture.awayScore : newScore,
      supersedesEventId: original.id,
    },
    { ...ctx, tx },
  );

  const oldContribution = computeScoreEventContribution(original.basePointValue, original.isUltraTime, eventPoints);
  const newContribution = computeScoreEventContribution(
    input.replacement.basePointValue,
    input.replacement.isUltraTime,
    actualPoints,
  );
  if (original.playerId) {
    const reversedOld = negateScoreEventContribution(oldContribution);
    await applyPlayerShotStatDeltas(
      tx,
      ctx.actor.organizationId,
      ctx.game.id,
      original.playerId,
      original.seasonClubId,
      reversedOld.playerDeltas,
      reversedOld.pointsDelta,
    );
  }
  if (finalPlayerId && (actualPoints !== 0 || finalPlayerId !== original.playerId)) {
    await applyPlayerShotStatDeltas(
      tx,
      ctx.actor.organizationId,
      ctx.game.id,
      finalPlayerId,
      original.seasonClubId,
      newContribution.playerDeltas,
      newContribution.pointsDelta,
    );
  }

  const net = addScoreEventContributions(negateScoreEventContribution(oldContribution), newContribution);
  await applyTeamShotStatDeltas(
    tx,
    ctx.actor.organizationId,
    ctx.game.id,
    original.seasonClubId,
    net.playerDeltas,
    net.teamUltraTimeForDelta,
    0,
    newScore,
  );
  if (net.opponentUltraTimeAgainstDelta !== 0) {
    const opposingSeasonClubId = isHome ? ctx.game.fixture.awaySeasonClubId! : ctx.game.fixture.homeSeasonClubId!;
    await applyTeamShotStatDeltas(
      tx,
      ctx.actor.organizationId,
      ctx.game.id,
      opposingSeasonClubId,
      { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
      0,
      net.opponentUltraTimeAgainstDelta,
      isHome ? ctx.game.fixture.awayScore : ctx.game.fixture.homeScore,
    );
  }

  return { original: corrected, replacement, previousScore: currentScore, newScore, actualPoints };
}
