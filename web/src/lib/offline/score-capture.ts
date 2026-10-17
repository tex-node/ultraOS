// A5 Step 8: the one place an offline score tap is turned into a queued GameEvent. Kept out of the
// React component so the resolution + write path is testable without a DOM, and so the component
// cannot drift from it.
//
// The resolution itself is NOT reimplemented here: resolveClientShot (src/lib/ultra-scoring-engine.ts)
// composes the exact same pure functions the server's live path uses (remainingClockSeconds +
// scoreShot), so the multiplier/isUltraTime this queues is the same answer the server would have
// produced had the tap reached it live. That is the whole reason the client is allowed to assert it
// at replay time (validate-client-shot.ts on the server side).
import { remainingClockSeconds } from "@/lib/game-clock";
import { resolveClientShot, type RuleSnapshotForScoring } from "@/lib/ultra-scoring-engine";
import type { ScoringRepository } from "./repositories/scoringRepository";

export interface CaptureScoreTapInput {
  seasonClubId: string;
  playerId: string | null;
  // The raw scorer-entered value (1-4 for a make, negative for a manual correction) - never a
  // pre-multiplied total; the multiplier is derived below.
  shotValue: number;
  description?: string;
  rules: RuleSnapshotForScoring;
  // Injected so a test can pin "when the tap happened" - the one input that is otherwise read from
  // the wall clock, and the field the server's plausibility window checks.
  observedAt?: Date;
}

export interface CapturedScoreTap {
  eventId: string;
  points: number;
  basePointValue: number | null;
  multiplier: number | null;
  isUltraTime: boolean;
  clockSeconds: number;
  clientObservedAt: string;
}

export async function captureScoreTap(
  repo: ScoringRepository,
  gameId: string,
  input: CaptureScoreTapInput,
): Promise<CapturedScoreTap> {
  const game = await repo.getGame(gameId);
  if (!game) {
    // Not "rescue it here": attachServerGame is the console's job on mount (see
    // LocalScoringRepository.attachServerGame). Failing loudly beats queueing an event whose
    // period/clock anchor nobody established.
    throw new Error("LOCAL_GAME_NOT_ATTACHED");
  }

  const shot = resolveClientShot({
    game: {
      status: game.status,
      clockSecondsRemaining: game.clockSecondsRemaining,
      clockStartedAt: game.clockStartedAt,
      currentPeriod: game.currentPeriod,
    },
    rules: input.rules,
    shotValue: input.shotValue,
  });
  // Same error codes the server's live path throws (INVALID_SHOT_VALUE / FOUR_POINT_DISABLED) - the
  // console surfaces the message rather than inventing a client-side vocabulary for the same rule.
  if (!shot.valid) throw new Error(shot.error);

  const clockSeconds = remainingClockSeconds({
    status: game.status,
    clockSecondsRemaining: game.clockSecondsRemaining,
    clockStartedAt: game.clockStartedAt ? new Date(game.clockStartedAt) : null,
  });
  const clientObservedAt = (input.observedAt ?? new Date()).toISOString();
  const eventId = crypto.randomUUID();
  const isCorrection = shot.basePointValue === null;

  const event = await repo.logEvent({
    id: eventId,
    gameId,
    // Ignored locally (logEvent stamps the game's own counter) and ignored server-side
    // (createGameEvent assigns the canonical sequence). Null rather than a guess.
    sequenceNumber: null,
    seasonClubId: input.seasonClubId,
    entrantId: null,
    playerId: input.playerId,
    fouledPlayerId: null,
    foulType: null,
    causedByEventId: null,
    eventType: "SCORE",
    typeKey: null,
    data: null,
    points: shot.pointsAwarded,
    basePointValue: shot.basePointValue,
    multiplier: shot.multiplier,
    made: isCorrection ? null : true,
    isFourPointAttempt: shot.basePointValue === 4,
    isUltraTime: shot.isUltraTime,
    assistedByPlayerId: null,
    substitutedOutPlayerId: null,
    x: null,
    y: null,
    courtZone: null,
    // Before/after scores are deliberately null: this console has no local score projection yet, and
    // replay now recomputes both from the SERVER's fixture row (replay-outbox-record.ts) rather than
    // trusting the client's snapshot - which may be hours stale on a device that was offline. Sending
    // a locally-invented number would be worse than sending none.
    homeScoreBefore: null,
    awayScoreBefore: null,
    homeScoreAfter: null,
    awayScoreAfter: null,
    source: "ULTRA_NATIVE_LIVE_SCORER",
    // Attribution the server overwrites on replay (createGameEvent sets createdById from the
    // authenticated actor) - null here rather than a fabricated local user id.
    createdById: null,
    status: "ACTIVE",
    period: game.currentPeriod,
    clockSeconds,
    // Empty means "let the server generate the standard description" - the live path's
    // computeScoreConsequences applies the same fallback to a blank description, which is what keeps
    // an offline tap and a live tap producing an identical event row.
    description: input.description ?? "",
    ledgerSourceHint: "SCORER",
    clientObservedAt,
  });

  return {
    eventId: event.id,
    points: shot.pointsAwarded,
    basePointValue: shot.basePointValue,
    multiplier: shot.multiplier,
    isUltraTime: shot.isUltraTime,
    clockSeconds,
    clientObservedAt,
  };
}
