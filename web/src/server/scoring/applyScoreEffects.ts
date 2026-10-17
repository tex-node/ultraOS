import "server-only";

import type { ValidScoreConsequences } from "@/lib/scoring/compute-score-consequences";
import { applyPlayerShotStatDeltas, applyTeamShotStatDeltas } from "./applyShotStatDeltas";
import { createGameEvent } from "./createGameEvent";
import type { CreateGameEventInput, WriteContext } from "./types";

// A5 Step 5: the I/O half of scoring. `computeScoreConsequences` (src/lib/scoring/
// compute-score-consequences.ts) derives WHAT changed; this applies it - the five writes that were
// previously inlined in recordScoreInternal (src/app/games/actions-internal.ts), in exactly the
// order and with exactly the arguments they had there:
//   1. Fixture.homeScore/awayScore <- fixtureDelta
//   2. the SCORE GameEvent <- eventFields (via createGameEvent, the canonical event write)
//   3. the shooter's PlayerStat <- playerDelta       (only when playerDelta is non-null)
//   4. the scoring team's TeamStat <- teamDelta      (unconditional, even for a zero-effect correction)
//   5. the opponent's TeamStat ultraTimePointsAgainst <- opponentUltraDelta (only when non-null)
//
// Two callers, one implementation - this is the "effects-extraction gap" fix: today replay
// (src/server/sync/replay-outbox-record.ts) creates the GameEvent but skips steps 1/3/4/5, so a
// replayed SCORE leaves the scoreboard and stat lines behind the ledger. Both paths must produce
// identical DB state for the same shot; the parity test in src/server/sync/ proves it.
//
// Lives under src/server/scoring/** because that is the only place the canonical-write ESLint
// boundary (web/eslint.config.mjs) permits raw PlayerStat/TeamStat writes - same reason
// applyShotStatDeltas lives here rather than next to its pure counterpart.
//
// Deliberately NOT included: the audit log entry. It is a live-UI-only side effect (replay has never
// written one for a GameEvent, and adding one is a separate decision about what a replayed event's
// audit record should say). It stays in recordScoreInternal, after this call.
//
// No separate `db` parameter: the transaction client in `ctx.tx` is the entire I/O interface, the
// same contract createGameEvent/voidScoreEvent/correctScoreEvent already have - the service never
// opens its own transaction. Caller-side injection is where a scoped client must be supplied,
// because that is where the transaction is opened (withGameWrite's `prisma` for the live path,
// ReplayContext.prisma for replay). A `db` param here would be dead weight: nothing in this function
// may read through a second connection while the caller's transaction is open.
export interface ApplyScoreEffectsInput {
  gameId: string;
  fixtureId: string;
  // The scoring side, already validated as one of the fixture's two sides by the caller
  // (recordScoreInternal's INVALID_TEAM guard, replay's own equivalent check) - createGameEvent
  // re-asserts it, this function does not duplicate the check.
  seasonClubId: string;
  // The attributed player, or null for a team-only correction. Passed separately from
  // playerDelta.playerId because the GameEvent carries a playerId even when there is no stat delta
  // (a zero-effect correction still names the player it was entered for).
  playerId: string | null;
  // Omitted by callers that want createGameEvent to derive them from the game's own state (live:
  // always supplied; replay: the offline client's captured period/clock when present). Undefined is
  // passed through, not defaulted here - the one place that fallback lives is createGameEvent.
  period?: number;
  clockSeconds?: number;
  consequences: ValidScoreConsequences;
  // ---- Below: event identity/provenance, supplied only by replay. Absent on the live path, where
  // the server generates the id and resolvedBy defaults to SERVER - exactly as before extraction.
  //
  // The offline client's own client-generated event id, preserved rather than replaced: a later
  // record (in this batch or a future one) referencing this event via causedByEventId /
  // supersedesEventId must resolve to it.
  eventId?: string;
  resolvedBy?: "SERVER" | "CLIENT";
  clientObservedAt?: string | null;
  // Event fields the effects computation does NOT derive - attribution/metadata that must survive a
  // replay (today's replay spread the whole payload into createGameEvent, so dropping these would be
  // silent data loss). Never allowed to override the score-derived fields: the spread order below
  // puts these first.
  extraEventFields?: ExtraGameEventFields;
}

// Everything about a GameEvent that is EITHER derived from the shot (points, multiplier, the four
// before/after score fields, ...) OR fixed by applyScoreEffects itself (gameId, eventType SCORE,
// provenance). What remains is genuinely caller-supplied attribution.
type ScoreDerivedEventFields =
  | "id"
  | "gameId"
  | "fixtureId"
  | "eventType"
  | "seasonClubId"
  | "playerId"
  | "period"
  | "clockSeconds"
  | "description"
  | "points"
  | "basePointValue"
  | "multiplier"
  | "made"
  | "isFourPointAttempt"
  | "isUltraTime"
  | "homeScoreBefore"
  | "awayScoreBefore"
  | "homeScoreAfter"
  | "awayScoreAfter"
  | "resolvedBy"
  | "clientObservedAt";

export type ExtraGameEventFields = Omit<CreateGameEventInput, ScoreDerivedEventFields>;

export async function applyScoreEffects(input: ApplyScoreEffectsInput, ctx: WriteContext): Promise<{ id: string; sequenceNumber: number }> {
  const { gameId, fixtureId, seasonClubId, playerId, period, clockSeconds, consequences } = input;
  const { fixtureDelta, eventFields, playerDelta, teamDelta, opponentUltraDelta } = consequences;
  const organizationId = ctx.actor.organizationId;
  const tx = ctx.tx;

  await tx.fixture.update({
    where: { id: fixtureId },
    data: fixtureDelta.isHome ? { homeScore: fixtureDelta.nextScore } : { awayScore: fixtureDelta.nextScore },
  });

  const created = await createGameEvent(
    {
      ...input.extraEventFields,
      id: input.eventId,
      gameId,
      fixtureId,
      seasonClubId,
      playerId,
      eventType: "SCORE",
      points: eventFields.points,
      basePointValue: eventFields.basePointValue,
      multiplier: eventFields.multiplier,
      period,
      clockSeconds,
      description: eventFields.description,
      made: eventFields.made,
      isFourPointAttempt: eventFields.isFourPointAttempt,
      isUltraTime: eventFields.isUltraTime,
      homeScoreBefore: eventFields.homeScoreBefore,
      awayScoreBefore: eventFields.awayScoreBefore,
      homeScoreAfter: eventFields.homeScoreAfter,
      awayScoreAfter: eventFields.awayScoreAfter,
      resolvedBy: input.resolvedBy,
      clientObservedAt: input.clientObservedAt,
    },
    ctx,
  );

  if (playerDelta) {
    await applyPlayerShotStatDeltas(tx, organizationId, gameId, playerDelta.playerId, playerDelta.seasonClubId, playerDelta.deltas, playerDelta.pointsDelta);
  }
  await applyTeamShotStatDeltas(
    tx,
    organizationId,
    gameId,
    teamDelta.seasonClubId,
    teamDelta.deltas,
    teamDelta.ultraTimePointsForDelta,
    teamDelta.ultraTimePointsAgainstDelta,
    teamDelta.absolutePoints,
  );
  if (opponentUltraDelta) {
    await applyTeamShotStatDeltas(
      tx,
      organizationId,
      gameId,
      opponentUltraDelta.seasonClubId,
      { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
      0,
      opponentUltraDelta.ultraTimePointsAgainstDelta,
      opponentUltraDelta.absolutePoints,
    );
  }

  return created;
}
