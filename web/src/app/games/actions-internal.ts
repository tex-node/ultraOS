// A5 (live console offline integration, Step 1): the testable counterpart to actions.ts's five
// ledger-writing server actions (recordScore, recordStatEvent, voidScoreEventAction,
// correctScoreEventAction, undoLastEvent). Deliberately NOT a "use server" file: actions.ts's
// file-level "use server" directive makes every exported async function a publicly callable
// Server Action (reachable via direct POST regardless of whether anything in the UI calls it -
// see node_modules/next/dist/docs/01-app/02-guides/data-security.md's "Built-in Server Actions
// Security features" and "Authentication and authorization" sections). Accepting an `actor`
// parameter is exactly what that same doc's security section warns against ("Read authentication
// from cookies or headers rather than accepting tokens as function parameters") - fine here only
// because this module is NOT a Server Action file, so nothing in it is independently reachable
// from the client. The only real caller is actions.ts's thin wrapper, which performs the actual
// `requireFixturePermission` check before ever calling in here - these `*Internal` functions trust
// their caller completely and must never be exported from anywhere that skips that check.
//
// This is this project's variant of the documented Data Access Layer pattern (same doc,
// "Using a Data Access Layer for mutations") - the one deviation from the doc's own example is
// that the auth check stays in the "use server" wrapper rather than inside this module, precisely
// so these functions are plain, injectable, testable TypeScript with no NextAuth/request-context
// dependency (see session.md, 2026-09-28/29: `recordScore` could not be invoked from a test at
// all before this split, since `requireSession()` -> `auth()` needs a real Next.js request).
// `revalidatePath` stays in the wrapper for the same reason - it is also a Next.js request-scoped
// API, not something a plain test process can call.
import "server-only";

import { z } from "zod";
import {
  applyCountingStatDelta,
  applyPlayerShotStatDeltas,
  applyTeamShotStatDeltas,
  correctScoreEvent,
  createGameEvent,
  voidScoreEvent,
  withGameWrite,
  type AuthActor,
} from "@/server/scoring";
import { writeAuditLog } from "@/lib/audit";
import { remainingClockSeconds } from "@/lib/game-clock";
import { computeScoreConsequences } from "@/lib/scoring/compute-score-consequences";
import {
  detectUltraTimeTransition,
  effectiveRuleSnapshot,
  isUltraTimeUnderRules,
  negateShotStatDeltas,
  scoreShot,
  shotStatDeltas,
} from "@/lib/ultra-scoring-engine";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Ultra Time is otherwise only ever inferred retrospectively from the clock. Called from every
// action that can move the clock or period forward, this persists the boundary the moment it's
// actually crossed - Game.isUltraTimeActive plus an explicit ULTRA_TIME_STARTED/ULTRA_TIME_ENDED
// ledger event, not just a value re-derived on read.
//
// LIVE-ONLY: never call this from replay. It compares the game's *current* wall-clock state
// against the last-persisted isUltraTimeActive flag to detect a transition - during replay of an
// offline-queued tap, the server's "now" is not the tap's "now", and calling this would write a
// transition event against post-hoc game state. See docs/canonical-write-audit.md's
// "wall-clock-derived event fields" note.
export async function syncUltraTimeState(
  tx: Prisma.TransactionClient,
  game: { id: string; fixtureId: string; status: string; currentPeriod: number; isUltraTimeActive: boolean; nextEventSequence: number; ruleSnapshot: Parameters<typeof effectiveRuleSnapshot>[0] },
  organizationId: string,
  actorId: string,
  remainingSeconds: number,
) {
  const { isActive, transition } = detectUltraTimeTransition(
    effectiveRuleSnapshot(game.ruleSnapshot),
    game.isUltraTimeActive,
    game.status,
    game.currentPeriod,
    remainingSeconds,
  );
  if (!transition) return { isUltraTimeActive: game.isUltraTimeActive, nextEventSequence: game.nextEventSequence };

  await tx.game.update({
    where: { id: game.id },
    data: { isUltraTimeActive: isActive },
  });
  await createGameEvent(
    {
      gameId: game.id,
      fixtureId: game.fixtureId,
      eventType: transition === "STARTED" ? "ULTRA_TIME_STARTED" : "ULTRA_TIME_ENDED",
      period: game.currentPeriod,
      clockSeconds: remainingSeconds,
      description: transition === "STARTED" ? "Ultra Time started (×2 scoring active)" : "Ultra Time ended",
      isUltraTime: isActive,
    },
    { actor: { id: actorId, organizationId }, source: "LIVE_UI", tx },
  );
  return { isUltraTimeActive: isActive, nextEventSequence: game.nextEventSequence + 1 };
}

const STAT_FIELD: Record<string, "rebounds" | "assists" | "steals" | "blocks" | "turnovers" | "fouls"> = {
  REBOUND: "rebounds",
  ASSIST: "assists",
  STEAL: "steals",
  BLOCK: "blocks",
  TURNOVER: "turnovers",
  FOUL: "fouls",
};

const ULTRA_TIME_STAT_FIELD: Record<
  "rebounds" | "assists" | "steals" | "blocks" | "turnovers" | "fouls",
  "ultraTimeRebounds" | "ultraTimeAssists" | "ultraTimeSteals" | "ultraTimeBlocks" | "ultraTimeTurnovers" | "ultraTimeFouls"
> = {
  rebounds: "ultraTimeRebounds",
  assists: "ultraTimeAssists",
  steals: "ultraTimeSteals",
  blocks: "ultraTimeBlocks",
  turnovers: "ultraTimeTurnovers",
  fouls: "ultraTimeFouls",
};

const score = z.object({
  seasonClubId: z.string(),
  playerId: z.string(),
  // The shot value as attempted (1-4 for a make, negative for a manual scoreboard correction).
  // Ultra Time's 2x multiplier is applied server-side, not entered by the scorer.
  points: z.coerce.number().int().min(-4).max(4).refine((value) => value !== 0),
  description: z.string(),
});

export async function recordScoreInternal(
  gameId: string,
  fixtureId: string,
  formData: FormData,
  actor: AuthActor,
  prisma?: PrismaClient,
) {
  const { id: actorId, organizationId } = actor;
  const input = score.parse(Object.fromEntries(formData.entries()));

  await withGameWrite(
    gameId,
    fixtureId,
    { actor, source: "LIVE_UI", prisma },
    async ({ game, tx, ...writeCtx }) => {
      if (
        ![
          game.fixture.homeSeasonClubId!,
          game.fixture.awaySeasonClubId!,
        ].includes(input.seasonClubId)
      ) {
        throw new Error("INVALID_TEAM");
      }

      const player = input.playerId
        ? await tx.player.findFirst({
            where: {
              id: input.playerId,
              seasonClubId: input.seasonClubId,
            },
          })
        : null;
      if (input.playerId && !player) throw new Error("INVALID_PLAYER");

      await syncUltraTimeState(tx, game, organizationId, actorId, remainingClockSeconds(game));

      // Games without a persisted GameRuleSnapshot (every Season Zero game) score under the
      // same legacy defaults they always have - the engine only enforces something new (e.g.
      // a disabled 4PT rule) once a game actually has a snapshot attached
      // (computeScoreConsequences applies that fallback itself).
      const isHome = input.seasonClubId === game.fixture.homeSeasonClubId!;
      const consequences = computeScoreConsequences({
        shotValue: input.points,
        rules: game.ruleSnapshot,
        gameStatus: game.status,
        currentPeriod: game.currentPeriod,
        remainingClockSeconds: remainingClockSeconds(game),
        seasonClubId: input.seasonClubId,
        opposingSeasonClubId: isHome ? game.fixture.awaySeasonClubId! : game.fixture.homeSeasonClubId!,
        isHome,
        homeScore: game.fixture.homeScore,
        awayScore: game.fixture.awayScore,
        player,
        description: input.description,
      });
      // The pure function returns an error object; this action has always thrown (inside
      // withGameWrite's callback, so the transaction rolls back) - translated back here at the
      // same point the inline `if (!shot.valid) throw new Error(shot.error)` used to sit.
      if (!consequences.valid) throw new Error(consequences.error);
      const { fixtureDelta, eventFields, playerDelta, teamDelta, opponentUltraDelta } = consequences;

      await tx.fixture.update({
        where: { id: game.fixtureId },
        data: fixtureDelta.isHome ? { homeScore: fixtureDelta.nextScore } : { awayScore: fixtureDelta.nextScore },
      });
      await createGameEvent(
        {
          gameId,
          fixtureId,
          seasonClubId: input.seasonClubId,
          playerId: player?.id ?? null,
          eventType: "SCORE",
          points: eventFields.points,
          basePointValue: eventFields.basePointValue,
          multiplier: eventFields.multiplier,
          period: game.currentPeriod,
          clockSeconds: remainingClockSeconds(game),
          description: eventFields.description,
          made: eventFields.made,
          isFourPointAttempt: eventFields.isFourPointAttempt,
          isUltraTime: eventFields.isUltraTime,
          homeScoreBefore: eventFields.homeScoreBefore,
          awayScoreBefore: eventFields.awayScoreBefore,
          homeScoreAfter: eventFields.homeScoreAfter,
          awayScoreAfter: eventFields.awayScoreAfter,
        },
        { ...writeCtx, tx },
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
      await writeAuditLog(tx, {
        organizationId,
        userId: actorId,
        action: fixtureDelta.actualPoints < 0 ? "SCORE_CORRECTED" : "SCORE_CHANGED",
        entityType: "Game",
        entityId: gameId,
        details: {
          fixtureId,
          seasonClubId: input.seasonClubId,
          playerId: player?.id ?? null,
          requestedPoints: input.points,
          actualPoints: fixtureDelta.actualPoints,
          previousScore: fixtureDelta.previousScore,
          newScore: fixtureDelta.nextScore,
          description: input.description,
        },
      });
    },
  );
}

const voidScoreEventSchema = z.object({
  eventId: z.string(),
  reason: z.string().min(1),
});

// Reverses a SCORE event's effect (fixture score, player/team totals) and marks it VOIDED.
// The event row itself is never deleted - only its status changes - so the ledger stays a
// complete, append-only record and event-replay (summing points over ACTIVE events) still
// reproduces the correct current score.
export async function voidScoreEventActionInternal(
  gameId: string,
  fixtureId: string,
  formData: FormData,
  actor: AuthActor,
  prisma?: PrismaClient,
) {
  const { id: actorId, organizationId } = actor;
  const input = voidScoreEventSchema.parse(Object.fromEntries(formData.entries()));

  await withGameWrite(
    gameId,
    fixtureId,
    { actor, source: "LIVE_UI", prisma },
    async (writeCtx) => {
      const { voided, previousScore, newScore } = await voidScoreEvent(input.eventId, input.reason, writeCtx);
      await writeAuditLog(writeCtx.tx, {
        organizationId,
        userId: actorId,
        action: "GAME_EVENT_VOIDED",
        entityType: "GameEvent",
        entityId: voided.id,
        details: {
          fixtureId,
          gameId,
          seasonClubId: voided.seasonClubId,
          playerId: voided.playerId,
          voidedPoints: voided.points ?? 0,
          previousScore,
          newScore,
          reason: input.reason,
        },
      });
    },
  );
}

const correctScoreEventSchema = z.object({
  eventId: z.string(),
  // The corrected shot value (1-4), replacing whatever the original event recorded - e.g.
  // 2PT -> 3PT, 3PT -> 4PT, or a made shot being corrected to a miss (points omitted/0 is
  // not valid here; use voidScoreEventAction for "this never happened").
  points: z.coerce.number().int().min(1).max(4),
  // Optional: corrects a shot attributed to the wrong player. Must belong to the same
  // SeasonClub as the original event - a correction fixes who scored, not which team.
  playerId: z.string().optional(),
  reason: z.string().min(1),
});

// Corrects a SCORE event's value and/or scoring player without losing the original record:
// the original event is marked CORRECTED (never mutated in place beyond that status), and a
// new event is created that supersedes it, carrying the corrected value re-evaluated under
// the same rules and the same frozen period/clock the original shot actually happened at
// (not "now" - a correction made minutes later shouldn't inherit a different Ultra Time state).
export async function correctScoreEventActionInternal(
  gameId: string,
  fixtureId: string,
  formData: FormData,
  actor: AuthActor,
  prisma?: PrismaClient,
) {
  const { id: actorId, organizationId } = actor;
  const input = correctScoreEventSchema.parse(Object.fromEntries(formData.entries()));

  await withGameWrite(
    gameId,
    fixtureId,
    { actor, source: "LIVE_UI", prisma },
    async ({ game, tx, ...writeCtx }) => {
      // Validation (shot legality, wrong-player lookup) needs the original event's own fields
      // (seasonClubId, frozen period/clockSeconds) - loaded here for that; correctScoreEvent loads
      // it again itself for the write, the same double-load-is-safe pattern every prior batch uses.
      const event = await tx.gameEvent.findUniqueOrThrow({ where: { id: input.eventId } });
      if (event.gameId !== gameId) throw new Error("INVALID_EVENT");
      if (event.eventType !== "SCORE" && event.eventType !== "SCORE_CORRECTION") throw new Error("NOT_A_SCORE_EVENT");
      if (event.status !== "ACTIVE") throw new Error("EVENT_NOT_ACTIVE");
      if (event.seasonClubId === null) throw new Error("INVALID_EVENT");

      let newPlayer = null;
      if (input.playerId) {
        newPlayer = await tx.player.findFirst({ where: { id: input.playerId, seasonClubId: event.seasonClubId } });
        if (!newPlayer) throw new Error("INVALID_PLAYER");
      }

      const shot = scoreShot({
        rules: effectiveRuleSnapshot(game.ruleSnapshot),
        shotValue: input.points,
        gameStatus: "LIVE",
        currentPeriod: event.period,
        remainingClockSeconds: event.clockSeconds ?? 0,
      });
      if (!shot.valid) throw new Error(shot.error);

      const { original, previousScore, newScore, actualPoints } = await correctScoreEvent(
        {
          eventId: input.eventId,
          reason: input.reason,
          replacement: {
            playerId: newPlayer?.id ?? null,
            basePointValue: shot.basePointValue,
            multiplier: shot.multiplier,
            isUltraTime: shot.isUltraTime,
            pointsAwarded: shot.pointsAwarded,
          },
        },
        { game, tx, ...writeCtx },
      );

      await writeAuditLog(tx, {
        organizationId,
        userId: actorId,
        action: "GAME_EVENT_CORRECTED",
        entityType: "GameEvent",
        entityId: original.id,
        details: {
          fixtureId,
          gameId,
          seasonClubId: original.seasonClubId,
          previousPlayerId: event.playerId,
          newPlayerId: newPlayer?.id ?? event.playerId ?? null,
          previousPoints: event.points,
          newPoints: actualPoints,
          previousScore,
          newScore,
          reason: input.reason,
        },
      });
    },
  );
}

const statEvent = z.object({
  seasonClubId: z.string(),
  playerId: z.string().min(1),
  eventType: z.enum([
    "REBOUND",
    "ASSIST",
    "STEAL",
    "BLOCK",
    "TURNOVER",
    "FOUL",
  ]),
  // Only meaningful when eventType is FOUL, and even then never required - some fouls
  // (technicals, unclear contact) don't have a clearly attributable other party.
  fouledPlayerId: z.string().optional(),
  foulType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PERSONAL", "TECHNICAL", "FLAGRANT", "OFFENSIVE"]).optional()),
  description: z.string(),
});

export async function recordStatEventInternal(
  gameId: string,
  fixtureId: string,
  formData: FormData,
  actor: AuthActor,
  prisma?: PrismaClient,
) {
  const { id: actorId, organizationId } = actor;
  const input = statEvent.parse(Object.fromEntries(formData.entries()));

  await withGameWrite(
    gameId,
    fixtureId,
    { actor, source: "LIVE_UI", prisma },
    async ({ game, tx, ...writeCtx }) => {
      if (
        ![
          game.fixture.homeSeasonClubId!,
          game.fixture.awaySeasonClubId!,
        ].includes(input.seasonClubId)
      ) {
        throw new Error("INVALID_TEAM");
      }

      const player = await tx.player.findFirst({
        where: {
          id: input.playerId,
          seasonClubId: input.seasonClubId,
        },
      });
      if (!player) throw new Error("INVALID_PLAYER");

      let fouledPlayerId: string | undefined;
      if (input.eventType === "FOUL" && input.fouledPlayerId) {
        const fouledPlayer = await tx.player.findFirst({
          where: { id: input.fouledPlayerId, seasonClubId: { in: [game.fixture.homeSeasonClubId!, game.fixture.awaySeasonClubId!] } },
        });
        if (!fouledPlayer) throw new Error("INVALID_FOULED_PLAYER");
        fouledPlayerId = fouledPlayer.id;
      }

      const field = STAT_FIELD[input.eventType];
      const remaining = remainingClockSeconds(game);
      await syncUltraTimeState(tx, game, organizationId, actorId, remaining);
      const ultraTime = isUltraTimeUnderRules(effectiveRuleSnapshot(game.ruleSnapshot), game.status, game.currentPeriod, remaining);

      await createGameEvent(
        {
          gameId,
          fixtureId,
          seasonClubId: input.seasonClubId,
          playerId: player.id,
          fouledPlayerId: input.eventType === "FOUL" ? fouledPlayerId : undefined,
          foulType: input.eventType === "FOUL" ? input.foulType || undefined : undefined,
          eventType: input.eventType,
          period: game.currentPeriod,
          clockSeconds: remaining,
          description: input.description || input.eventType,
          isUltraTime: ultraTime,
        },
        { ...writeCtx, tx },
      );
      const ultraField = ULTRA_TIME_STAT_FIELD[field];
      await applyCountingStatDelta(
        tx,
        organizationId,
        gameId,
        player.id,
        input.seasonClubId,
        field,
        1,
        ultraTime ? { field: ultraField, delta: 1 } : null,
      );
    },
  );
}

export async function undoLastEventInternal(gameId: string, fixtureId: string, actor: AuthActor, prisma?: PrismaClient) {
  const { id: actorId, organizationId } = actor;

  await withGameWrite(
    gameId,
    fixtureId,
    { actor, source: "LIVE_UI", prisma },
    async ({ game, tx, ...writeCtx }) => {
      const last = await tx.gameEvent.findFirst({
        // Ultra Time transitions are system-generated (see syncUltraTimeState), not something
        // an operator entered - undo should skip past them to the real last manual action.
        where: { gameId, eventType: { notIn: ["ULTRA_TIME_STARTED", "ULTRA_TIME_ENDED"] } },
        orderBy: { createdAt: "desc" },
      });
      if (!last) throw new Error("NO_EVENTS_TO_UNDO");
      if (!last.seasonClubId) throw new Error("EVENT_NOT_UNDOABLE");

      const clockSeconds = remainingClockSeconds(game);

      if (last.eventType === "SCORE") {
        const isHome = last.seasonClubId === game.fixture.homeSeasonClubId!;
        const currentScore = isHome ? game.fixture.homeScore : game.fixture.awayScore;
        const reversal = -(last.points ?? 0);
        const nextScore = Math.max(0, currentScore + reversal);
        const actualReversal = nextScore - currentScore;

        await tx.fixture.update({
          where: { id: fixtureId },
          data: isHome ? { homeScore: nextScore } : { awayScore: nextScore },
        });
        await createGameEvent(
          {
            gameId,
            fixtureId,
            seasonClubId: last.seasonClubId,
            playerId: last.playerId,
            eventType: "SCORE",
            points: actualReversal,
            period: game.currentPeriod,
            clockSeconds,
            description: `Undo: reversed previous ${last.points! > 0 ? "+" : ""}${last.points} score entry`,
          },
          { ...writeCtx, tx },
        );
        // Reverse the shot-category deltas too, not just the raw point total - the same helper
        // voidScoreEventAction uses, so undoing a made 3-pointer decrements 3PM/3PA the same way
        // voiding it would, instead of leaving those fields inflated relative to `points`.
        const reversedDeltas = negateShotStatDeltas(shotStatDeltas({ basePointValue: last.basePointValue, isUltraTime: last.isUltraTime }));
        if (last.playerId && actualReversal !== 0) {
          await applyPlayerShotStatDeltas(tx, organizationId, gameId, last.playerId, last.seasonClubId, reversedDeltas, actualReversal);
        }
        await applyTeamShotStatDeltas(
          tx,
          organizationId,
          gameId,
          last.seasonClubId,
          reversedDeltas,
          last.isUltraTime ? actualReversal : 0,
          0,
          nextScore,
        );
        if (last.isUltraTime && actualReversal !== 0) {
          const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId! : game.fixture.homeSeasonClubId!;
          await applyTeamShotStatDeltas(
            tx,
            organizationId,
            gameId,
            opposingSeasonClubId,
            { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
            0,
            actualReversal,
            isHome ? game.fixture.awayScore : game.fixture.homeScore,
          );
        }
      } else if (last.playerId && STAT_FIELD[last.eventType]) {
        const field = STAT_FIELD[last.eventType];
        await createGameEvent(
          {
            gameId,
            fixtureId,
            seasonClubId: last.seasonClubId,
            playerId: last.playerId,
            fouledPlayerId: last.fouledPlayerId,
            foulType: last.foulType,
            eventType: last.eventType,
            period: game.currentPeriod,
            clockSeconds,
            description: `Undo: reversed previous ${last.eventType.toLowerCase()}`,
          },
          { ...writeCtx, tx },
        );
        const existing = await tx.playerStat.findUnique({ where: { gameId_playerId: { gameId, playerId: last.playerId } } });
        if (existing && existing[field] > 0) {
          const ultraField = ULTRA_TIME_STAT_FIELD[field];
          const reverseUltraTime = last.isUltraTime && (existing[ultraField] ?? 0) > 0;
          await applyCountingStatDelta(
            tx,
            organizationId,
            gameId,
            last.playerId,
            last.seasonClubId,
            field,
            -1,
            reverseUltraTime ? { field: ultraField, delta: -1 } : null,
          );
        }
      } else {
        throw new Error("EVENT_NOT_UNDOABLE");
      }

      await writeAuditLog(tx, {
        organizationId,
        userId: actorId,
        action: "GAME_EVENT_UNDONE",
        entityType: "Game",
        entityId: gameId,
        details: { fixtureId, undoneEventId: last.id, undoneEventType: last.eventType, undoneDescription: last.description },
      });
    },
  );
}
