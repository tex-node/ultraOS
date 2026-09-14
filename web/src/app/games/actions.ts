"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MissingOrganizationContextError, requirePermissionWithOrganization, requireSession } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { remainingClockSeconds } from "@/lib/game-clock";
import { remainingShotClockSeconds, ULTRA_RULES } from "@/lib/game-rules";
import { withOrganizationContext } from "@/lib/tenant-context";
import {
  addShotStatDeltas,
  detectUltraTimeTransition,
  effectiveRuleSnapshot,
  isUltraTimeUnderRules,
  negateShotStatDeltas,
  scoreShot,
  shotStatDeltas,
  type ShotStatDeltas,
} from "@/lib/ultra-scoring-engine";
import { recalculateStandings } from "@/lib/standings-recalculate";
import type { Prisma } from "@/generated/prisma/client";

function assertGameIsMutable(status: string, fixtureStatus: string) {
  if (
    status === "FINAL" ||
    fixtureStatus === "FINAL" ||
    fixtureStatus === "CANCELLED"
  ) {
    throw new Error("GAME_NOT_MUTABLE");
  }
}

// Ultra Time is otherwise only ever inferred retrospectively from the clock. Called from
// every action that can move the clock or period forward, this persists the boundary the
// moment it's actually crossed - Game.isUltraTimeActive plus an explicit
// ULTRA_TIME_STARTED/ULTRA_TIME_ENDED ledger event, not just a value re-derived on read.
async function syncUltraTimeState(
  tx: Prisma.TransactionClient,
  game: { id: string; status: string; currentPeriod: number; isUltraTimeActive: boolean; nextEventSequence: number; ruleSnapshot: Parameters<typeof effectiveRuleSnapshot>[0] },
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

  const sequenceNumber = game.nextEventSequence;
  await tx.game.update({
    where: { id: game.id },
    data: { isUltraTimeActive: isActive, nextEventSequence: { increment: 1 } },
  });
  await tx.gameEvent.create({
    data: {
      gameId: game.id,
      eventType: transition === "STARTED" ? "ULTRA_TIME_STARTED" : "ULTRA_TIME_ENDED",
      period: game.currentPeriod,
      clockSeconds: remainingSeconds,
      description: transition === "STARTED" ? "Ultra Time started (×2 scoring active)" : "Ultra Time ended",
      sequenceNumber,
      isUltraTime: isActive,
      source: "ULTRA_NATIVE_LIVE_SCORER",
    },
  });
  return { isUltraTimeActive: isActive, nextEventSequence: game.nextEventSequence + 1 };
}

function mergeShotStatDeltas(
  existing: Partial<Record<keyof ShotStatDeltas, number | null>> | null,
  deltas: ShotStatDeltas,
): Record<keyof ShotStatDeltas, number> {
  const merged = {} as Record<keyof ShotStatDeltas, number>;
  for (const key of Object.keys(deltas) as (keyof ShotStatDeltas)[]) {
    merged[key] = (existing?.[key] ?? 0) + deltas[key];
  }
  return merged;
}

// Applies a made shot's per-category deltas (and its raw point delta) to a player's stat
// line for this game - or reverses them, when called with negateShotStatDeltas(deltas) and a
// negative pointsDelta, from the void/correction paths. NULL fields become real zeros the
// first time a native shot touches this row, per the "0 is captured, null is not" convention -
// correct here because live scoring genuinely observes every shot category.
async function applyPlayerShotStatDeltas(
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
async function applyTeamShotStatDeltas(
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

export async function startGame(fixtureId: string) {
  const { organizationId } = await requirePermissionWithOrganization("game:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    const fixture = await tx.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      select: { status: true },
    });
    if (fixture.status === "CANCELLED" || fixture.status === "FINAL") {
      throw new Error("INVALID_FIXTURE");
    }
    await tx.game.upsert({
      where: { fixtureId },
      create: {
        organizationId,
        fixtureId,
        status: "LIVE",
        startedAt: new Date(),
        clockStartedAt: new Date(),
        // A brand-new Game row only ever comes from starting the live scorer - an imported
        // result upserts directly with its own resultSource/statSource instead of going
        // through startGame. Genuinely native from the first event, so it's safe to mark here.
        statSource: "ULTRA_NATIVE_LIVE_SCORER",
        dataCapability: "ULTRA_NATIVE_EVENTS",
      },
      update: {
        status: "LIVE",
        startedAt: new Date(),
        clockStartedAt: new Date(),
      },
    });
    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "LIVE" },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
}

export async function pauseGame(gameId: string, fixtureId: string) {
  const { organizationId } = await requirePermissionWithOrganization("game:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: { select: { status: true } }, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE") throw new Error("GAME_NOT_LIVE");

    const remaining = remainingClockSeconds(game);
    // A pause ends Ultra Time (nothing is being played), even if the clock value would
    // otherwise still qualify - resumeGame re-detects and re-starts it if still in range.
    await syncUltraTimeState(tx, { ...game, status: "PAUSED" }, remaining);
    await tx.game.update({
      where: { id: gameId },
      data: {
        status: "PAUSED",
        clockSecondsRemaining: remaining,
        clockStartedAt: null,
        shotClockSecondsRemaining: remainingShotClockSeconds(game),
        shotClockStartedAt: null,
      },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function resumeGame(gameId: string, fixtureId: string) {
  const { organizationId } = await requirePermissionWithOrganization("game:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: { select: { status: true } }, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "PAUSED") throw new Error("GAME_NOT_PAUSED");

    await syncUltraTimeState(tx, { ...game, status: "LIVE" }, remainingClockSeconds(game));
    await tx.game.update({
      where: { id: gameId },
      data: { status: "LIVE", clockStartedAt: new Date() },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function advancePeriod(gameId: string, fixtureId: string) {
  const { organizationId } = await requirePermissionWithOrganization("game:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: { select: { status: true } }, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);

    await syncUltraTimeState(
      tx,
      { ...game, currentPeriod: game.currentPeriod + 1, status: "PAUSED" },
      ULTRA_RULES.halfSeconds,
    );
    await tx.game.update({
      where: { id: gameId },
      data: {
        currentPeriod: { increment: 1 },
        clockSecondsRemaining: ULTRA_RULES.halfSeconds,
        clockStartedAt: null,
        shotClockSecondsRemaining: ULTRA_RULES.shotClockSeconds,
        shotClockStartedAt: null,
        status: "PAUSED",
      },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

const shotClockAction = z.enum(["START", "STOP", "RESET"]);

export async function controlShotClock(gameId: string, fixtureId: string, formData: FormData) {
  const { organizationId } = await requirePermissionWithOrganization("game:operate");
  const action = shotClockAction.parse(formData.get("action"));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: { select: { status: true } } },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE") throw new Error("GAME_NOT_LIVE");

    if (action === "START") {
      await tx.game.update({
        where: { id: gameId },
        data: { shotClockStartedAt: new Date() },
      });
    } else if (action === "STOP") {
      await tx.game.update({
        where: { id: gameId },
        data: {
          shotClockSecondsRemaining: remainingShotClockSeconds(game),
          shotClockStartedAt: null,
        },
      });
    } else {
      await tx.game.update({
        where: { id: gameId },
        data: {
          shotClockSecondsRemaining: ULTRA_RULES.shotClockSeconds,
          shotClockStartedAt: null,
        },
      });
    }
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function confirmMandatorySubstitution(gameId: string, fixtureId: string, seasonClubId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    if (![game.fixture.homeSeasonClubId, game.fixture.awaySeasonClubId].includes(seasonClubId)) {
      throw new Error("INVALID_TEAM");
    }
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "MANDATORY_SUBSTITUTION_CONFIRMED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, seasonClubId, period: game.currentPeriod },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

const score = z.object({
  seasonClubId: z.string(),
  playerId: z.string(),
  // The shot value as attempted (1-4 for a make, negative for a manual scoreboard correction).
  // Ultra Time's 2x multiplier is applied server-side, not entered by the scorer.
  points: z.coerce.number().int().min(-4).max(4).refine((value) => value !== 0),
  description: z.string(),
});

export async function recordScore(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  const input = score.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    // Row-level lock, acquired before the score is read: without it, two concurrent scorers (or
    // a double-submit) can both read the same "before" score and both compute the same "after"
    // score from it, silently losing one of the two increments. FOR UPDATE serializes them - the
    // second transaction blocks here until the first commits, then reads the already-updated value.
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") {
      throw new Error("GAME_NOT_ACTIVE");
    }
    if (
      ![
        game.fixture.homeSeasonClubId,
        game.fixture.awaySeasonClubId,
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

    const sync = await syncUltraTimeState(tx, game, remainingClockSeconds(game));

    // Games without a persisted GameRuleSnapshot (every Season Zero game) score under the
    // same legacy defaults they always have - the engine only enforces something new (e.g.
    // a disabled 4PT rule) once a game actually has a snapshot attached.
    const shot = scoreShot({
      rules: effectiveRuleSnapshot(game.ruleSnapshot),
      shotValue: input.points,
      gameStatus: game.status,
      currentPeriod: game.currentPeriod,
      remainingClockSeconds: remainingClockSeconds(game),
    });
    if (!shot.valid) throw new Error(shot.error);
    const { basePointValue, multiplier, pointsAwarded, isUltraTime: ultraTime } = shot;

    const isHome = input.seasonClubId === game.fixture.homeSeasonClubId;
    const currentScore = isHome
      ? game.fixture.homeScore
      : game.fixture.awayScore;
    const nextScore = Math.max(0, currentScore + pointsAwarded);
    const actualPoints = nextScore - currentScore;

    await tx.fixture.update({
      where: { id: game.fixtureId },
      data: isHome ? { homeScore: nextScore } : { awayScore: nextScore },
    });
    const sequenceNumber = sync.nextEventSequence;
    await tx.game.update({
      where: { id: gameId },
      data: { nextEventSequence: { increment: 1 } },
    });
    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player?.id,
        eventType: "SCORE",
        points: actualPoints,
        basePointValue,
        multiplier,
        period: game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description:
          input.description ||
          `${actualPoints > 0 ? "+" : ""}${actualPoints} points${ultraTime && basePointValue ? ` (Ultra Time: ${basePointValue}×${multiplier})` : ""}`,
        sequenceNumber,
        made: basePointValue !== null ? true : null,
        isFourPointAttempt: basePointValue === 4,
        isUltraTime: ultraTime,
        homeScoreBefore: isHome ? currentScore : game.fixture.homeScore,
        awayScoreBefore: isHome ? game.fixture.awayScore : currentScore,
        homeScoreAfter: isHome ? nextScore : game.fixture.homeScore,
        awayScoreAfter: isHome ? game.fixture.awayScore : nextScore,
        source: "ULTRA_NATIVE_LIVE_SCORER",
        createdById: session.user.id,
      },
    });

    const deltas = shotStatDeltas({ basePointValue, isUltraTime: ultraTime });
    if (player && actualPoints !== 0) {
      await applyPlayerShotStatDeltas(tx, organizationId, gameId, player.id, input.seasonClubId, deltas, actualPoints);
    }
    await applyTeamShotStatDeltas(
      tx,
      organizationId,
      gameId,
      input.seasonClubId,
      deltas,
      ultraTime ? actualPoints : 0,
      0,
      nextScore,
    );
    const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId : game.fixture.homeSeasonClubId;
    if (ultraTime && actualPoints !== 0) {
      await applyTeamShotStatDeltas(
        tx,
        organizationId,
        gameId,
        opposingSeasonClubId,
        { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
        0,
        actualPoints,
        isHome ? game.fixture.awayScore : game.fixture.homeScore,
      );
    }
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: actualPoints < 0 ? "SCORE_CORRECTED" : "SCORE_CHANGED",
      entityType: "Game",
      entityId: gameId,
      details: {
        fixtureId,
        seasonClubId: input.seasonClubId,
        playerId: player?.id ?? null,
        requestedPoints: input.points,
        actualPoints,
        previousScore: currentScore,
        newScore: nextScore,
        description: input.description,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

const voidScoreEvent = z.object({
  eventId: z.string(),
  reason: z.string().min(1),
});

// Reverses a SCORE event's effect (fixture score, player/team totals) and marks it VOIDED.
// The event row itself is never deleted - only its status changes - so the ledger stays a
// complete, append-only record and event-replay (summing points over ACTIVE events) still
// reproduces the correct current score.
export async function voidScoreEventAction(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  const input = voidScoreEvent.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    assertGameIsMutable(game.status, game.fixture.status);

    const event = await tx.gameEvent.findUniqueOrThrow({ where: { id: input.eventId } });
    if (event.gameId !== gameId) throw new Error("INVALID_EVENT");
    if (event.eventType !== "SCORE" && event.eventType !== "SCORE_CORRECTION") throw new Error("NOT_A_SCORE_EVENT");
    if (event.status !== "ACTIVE") throw new Error("EVENT_NOT_ACTIVE");
    const eventPoints = event.points ?? 0;

    const isHome = event.seasonClubId === game.fixture.homeSeasonClubId;
    const currentScore = isHome ? game.fixture.homeScore : game.fixture.awayScore;
    const newScore = Math.max(0, currentScore - eventPoints);

    await tx.fixture.update({
      where: { id: game.fixtureId },
      data: isHome ? { homeScore: newScore } : { awayScore: newScore },
    });
    await tx.gameEvent.update({
      where: { id: event.id },
      data: {
        status: "VOIDED",
        correctedAt: new Date(),
        correctedById: session.user.id,
        correctionReason: input.reason,
      },
    });
    const reversedDeltas = negateShotStatDeltas(shotStatDeltas({ basePointValue: event.basePointValue, isUltraTime: event.isUltraTime }));
    if (event.playerId) {
      await applyPlayerShotStatDeltas(tx, organizationId, gameId, event.playerId, event.seasonClubId!, reversedDeltas, -eventPoints);
    }
    await applyTeamShotStatDeltas(
      tx,
      organizationId,
      gameId,
      event.seasonClubId!,
      reversedDeltas,
      event.isUltraTime ? -eventPoints : 0,
      0,
      newScore,
    );
    if (event.isUltraTime && eventPoints !== 0) {
      const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId : game.fixture.homeSeasonClubId;
      await applyTeamShotStatDeltas(
        tx,
        organizationId,
        gameId,
        opposingSeasonClubId,
        { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
        0,
        -eventPoints,
        isHome ? game.fixture.awayScore : game.fixture.homeScore,
      );
    }
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_EVENT_VOIDED",
      entityType: "GameEvent",
      entityId: event.id,
      details: { fixtureId, gameId, seasonClubId: event.seasonClubId, playerId: event.playerId, voidedPoints: eventPoints, previousScore: currentScore, newScore, reason: input.reason },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

const correctScoreEvent = z.object({
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
export async function correctScoreEventAction(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  const input = correctScoreEvent.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true, ruleSnapshot: true } });
    assertGameIsMutable(game.status, game.fixture.status);

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

    const eventPoints = event.points ?? 0;
    const isHome = event.seasonClubId === game.fixture.homeSeasonClubId;
    const currentScore = isHome ? game.fixture.homeScore : game.fixture.awayScore;
    const baseScore = Math.max(0, currentScore - eventPoints);
    const newScore = Math.max(0, baseScore + shot.pointsAwarded);
    const actualPoints = newScore - baseScore;
    const finalPlayerId = newPlayer?.id ?? event.playerId ?? undefined;

    await tx.fixture.update({
      where: { id: game.fixtureId },
      data: isHome ? { homeScore: newScore } : { awayScore: newScore },
    });
    await tx.gameEvent.update({
      where: { id: event.id },
      data: {
        status: "CORRECTED",
        correctedAt: new Date(),
        correctedById: session.user.id,
        correctionReason: input.reason,
      },
    });
    const sequenceNumber = game.nextEventSequence;
    await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: event.seasonClubId,
        playerId: finalPlayerId,
        eventType: "SCORE_CORRECTION",
        points: actualPoints,
        basePointValue: shot.basePointValue,
        multiplier: shot.multiplier,
        period: event.period,
        clockSeconds: event.clockSeconds,
        description: `Correction: ${input.reason}`,
        sequenceNumber,
        made: shot.basePointValue !== null,
        isFourPointAttempt: shot.basePointValue === 4,
        isUltraTime: shot.isUltraTime,
        homeScoreBefore: isHome ? baseScore : game.fixture.homeScore,
        awayScoreBefore: isHome ? game.fixture.awayScore : baseScore,
        homeScoreAfter: isHome ? newScore : game.fixture.homeScore,
        awayScoreAfter: isHome ? game.fixture.awayScore : newScore,
        source: "ULTRA_NATIVE_LIVE_SCORER",
        createdById: session.user.id,
        supersedesEventId: event.id,
      },
    });

    // Reverse the original event's per-category deltas, then apply the corrected shot's
    // deltas to whichever player it now belongs to (same player, unless this was a
    // wrong-player correction).
    const oldDeltas = shotStatDeltas({ basePointValue: event.basePointValue, isUltraTime: event.isUltraTime });
    const newDeltas = shotStatDeltas({ basePointValue: shot.basePointValue, isUltraTime: shot.isUltraTime });
    if (event.playerId) {
      await applyPlayerShotStatDeltas(tx, organizationId, gameId, event.playerId, event.seasonClubId, negateShotStatDeltas(oldDeltas), -eventPoints);
    }
    if (finalPlayerId && (actualPoints !== 0 || finalPlayerId !== event.playerId)) {
      await applyPlayerShotStatDeltas(tx, organizationId, gameId, finalPlayerId, event.seasonClubId, newDeltas, actualPoints);
    }

    const netTeamUltraPointsFor = (event.isUltraTime ? -eventPoints : 0) + (shot.isUltraTime ? actualPoints : 0);
    await applyTeamShotStatDeltas(
      tx,
      organizationId,
      gameId,
      event.seasonClubId,
      addShotStatDeltas(negateShotStatDeltas(oldDeltas), newDeltas),
      netTeamUltraPointsFor,
      0,
      newScore,
    );
    const netOpponentUltraPointsAgainst = (event.isUltraTime ? -eventPoints : 0) + (shot.isUltraTime ? actualPoints : 0);
    if (netOpponentUltraPointsAgainst !== 0) {
      const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId : game.fixture.homeSeasonClubId;
      await applyTeamShotStatDeltas(
        tx,
        organizationId,
        gameId,
        opposingSeasonClubId,
        { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
        0,
        netOpponentUltraPointsAgainst,
        isHome ? game.fixture.awayScore : game.fixture.homeScore,
      );
    }
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_EVENT_CORRECTED",
      entityType: "GameEvent",
      entityId: event.id,
      details: {
        fixtureId,
        gameId,
        seasonClubId: event.seasonClubId,
        previousPlayerId: event.playerId,
        newPlayerId: finalPlayerId ?? null,
        previousPoints: event.points,
        newPoints: actualPoints,
        previousScore: currentScore,
        newScore,
        reason: input.reason,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
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

export async function recordStatEvent(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { organizationId } = await requirePermissionWithOrganization("game:operate");
  const input = statEvent.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") {
      throw new Error("GAME_NOT_ACTIVE");
    }
    if (
      ![
        game.fixture.homeSeasonClubId,
        game.fixture.awaySeasonClubId,
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
        where: { id: input.fouledPlayerId, seasonClubId: { in: [game.fixture.homeSeasonClubId, game.fixture.awaySeasonClubId] } },
      });
      if (!fouledPlayer) throw new Error("INVALID_FOULED_PLAYER");
      fouledPlayerId = fouledPlayer.id;
    }

    const field = STAT_FIELD[input.eventType];
    const remaining = remainingClockSeconds(game);
    const sync = await syncUltraTimeState(tx, game, remaining);
    const ultraTime = isUltraTimeUnderRules(effectiveRuleSnapshot(game.ruleSnapshot), game.status, game.currentPeriod, remaining);
    const sequenceNumber = sync.nextEventSequence;
    await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player.id,
        fouledPlayerId: input.eventType === "FOUL" ? fouledPlayerId : undefined,
        foulType: input.eventType === "FOUL" ? input.foulType || undefined : undefined,
        eventType: input.eventType,
        period: game.currentPeriod,
        clockSeconds: remaining,
        description: input.description || input.eventType,
        sequenceNumber,
        isUltraTime: ultraTime,
        source: "ULTRA_NATIVE_LIVE_SCORER",
      },
    });
    const ultraField = ULTRA_TIME_STAT_FIELD[field];
    const existing = await tx.playerStat.findUnique({ where: { gameId_playerId: { gameId, playerId: player.id } } });
    await tx.playerStat.upsert({
      where: { gameId_playerId: { gameId, playerId: player.id } },
      create: {
        organizationId,
        gameId,
        playerId: player.id,
        seasonClubId: input.seasonClubId,
        [field]: 1,
        ...(ultraTime ? { [ultraField]: 1 } : {}),
        statSource: "ULTRA_NATIVE_LIVE_SCORER",
      },
      update: {
        [field]: { increment: 1 },
        ...(ultraTime ? { [ultraField]: (existing?.[ultraField] ?? 0) + 1 } : {}),
        statSource: "ULTRA_NATIVE_LIVE_SCORER",
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
}

export async function finalizeGame(gameId: string, fixtureId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("result:confirm");
  const current = await withOrganizationContext(organizationId, (tx) =>
    tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true },
    }),
  );
  assertGameIsMutable(current.status, current.fixture.status);
  if (current.fixture.homeScore === current.fixture.awayScore) {
    redirect(`/games/${fixtureId}/live?error=tied`);
  }

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    const winnerSeasonClubId =
      game.fixture.homeScore > game.fixture.awayScore
        ? game.fixture.homeSeasonClubId
        : game.fixture.awaySeasonClubId;

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "FINAL", winnerSeasonClubId },
    });
    await tx.game.update({
      where: { id: gameId },
      data: {
        status: "FINAL",
        endedAt: new Date(),
        clockSecondsRemaining: remainingClockSeconds(game),
        clockStartedAt: null,
      },
    });
    await recalculateStandings(tx, organizationId, game.fixture.seasonId);
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "STANDINGS_RECALCULATED",
      entityType: "Season",
      entityId: game.fixture.seasonId,
      details: { trigger: "GAME_FINALIZED", gameId, fixtureId },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_FINALIZED",
      entityType: "Game",
      entityId: gameId,
      details: {
        fixtureId,
        homeScore: game.fixture.homeScore,
        awayScore: game.fixture.awayScore,
        winnerSeasonClubId,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
  revalidatePath("/standings");
  revalidatePath(`/scoreboard/${gameId}`);
}

// Reverses whichever GameEvent was most recently recorded for this game. Never deletes the
// original event - creates an offsetting correction event instead, so the full history stays
// intact and auditable. If the operator meant to undo something further back, they should use
// the general correction form (negative points / another stat entry) instead - this button only
// ever targets the single most recent action.
export async function undoLastEvent(gameId: string, fixtureId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");

  await withOrganizationContext(organizationId, async (tx) => {
    // Same row lock as recordScore - the reversal below also reads-then-writes an absolute score.
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);

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
      const isHome = last.seasonClubId === game.fixture.homeSeasonClubId;
      const currentScore = isHome ? game.fixture.homeScore : game.fixture.awayScore;
      const reversal = -(last.points ?? 0);
      const nextScore = Math.max(0, currentScore + reversal);
      const actualReversal = nextScore - currentScore;

      await tx.fixture.update({
        where: { id: fixtureId },
        data: isHome ? { homeScore: nextScore } : { awayScore: nextScore },
      });
      await tx.gameEvent.create({
        data: {
          organizationId,
          gameId,
          seasonClubId: last.seasonClubId,
          playerId: last.playerId,
          eventType: "SCORE",
          points: actualReversal,
          period: game.currentPeriod,
          clockSeconds,
          description: `Undo: reversed previous ${last.points! > 0 ? "+" : ""}${last.points} score entry`,
        },
      });
      if (last.playerId && actualReversal !== 0) {
        await tx.playerStat.update({
          where: { gameId_playerId: { gameId, playerId: last.playerId } },
          data: { points: { increment: actualReversal } },
        });
      }
      await tx.teamStat.upsert({
        where: { gameId_seasonClubId: { gameId, seasonClubId: last.seasonClubId } },
        create: { organizationId, gameId, seasonClubId: last.seasonClubId, points: nextScore },
        update: { points: nextScore },
      });
    } else if (last.playerId && STAT_FIELD[last.eventType]) {
      const field = STAT_FIELD[last.eventType];
      await tx.gameEvent.create({
        data: {
          organizationId,
          gameId,
          seasonClubId: last.seasonClubId,
          playerId: last.playerId,
          fouledPlayerId: last.fouledPlayerId,
          foulType: last.foulType,
          eventType: last.eventType,
          period: game.currentPeriod,
          clockSeconds,
          description: `Undo: reversed previous ${last.eventType.toLowerCase()}`,
        },
      });
      const existing = await tx.playerStat.findUnique({ where: { gameId_playerId: { gameId, playerId: last.playerId } } });
      if (existing && existing[field] > 0) {
        await tx.playerStat.update({
          where: { gameId_playerId: { gameId, playerId: last.playerId } },
          data: { [field]: { decrement: 1 } },
        });
      }
    } else {
      throw new Error("EVENT_NOT_UNDOABLE");
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_EVENT_UNDONE",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, undoneEventId: last.id, undoneEventType: last.eventType, undoneDescription: last.description },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

const reopenSchema = z.object({ reason: z.string().trim().min(5, "A reason is required to reopen a finalized game.") });

// Restricted to result:confirm (the same tier that finalizes games), not the everyday
// game:operate scorer permission - reopening an official result is a bigger deal than
// running a live game.
export async function reopenGame(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("result:confirm");
  const input = reopenSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    if (game.status !== "FINAL") throw new Error("GAME_NOT_FINAL");

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "LIVE", winnerSeasonClubId: null },
    });
    await tx.game.update({
      where: { id: gameId },
      data: { status: "PAUSED", endedAt: null },
    });
    await recalculateStandings(tx, organizationId, game.fixture.seasonId);
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_REOPENED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, reason: input.reason, homeScoreAtReopen: game.fixture.homeScore, awayScoreAtReopen: game.fixture.awayScore },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
  revalidatePath("/standings");
  revalidatePath(`/scoreboard/${gameId}`);
}

// Incidents reuse AuditLog exclusively - no dedicated table. type/fixture/game/actor/timestamp/
// reason live directly on the entry (entityType "GameIncident", entityId = gameId); resolution
// is a second, linked AuditLog entry rather than a mutable field, so the trail stays append-only
// like everything else in this file.
const INCIDENT_TYPES = ["GAME_DELAY", "PLAYER_UNAVAILABLE", "CLOCK_CORRECTION", "GAME_INTERRUPTION", "GAME_ABANDONED"] as const;

const incidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  reason: z.string().trim().min(5, "A reason is required."),
  clockMinutes: z.string().optional(),
  clockSeconds: z.string().optional(),
});

export async function recordIncident(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  const input = incidentSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });

    let clockCorrection: { fromSeconds: number; toSeconds: number } | null = null;
    if (input.type === "CLOCK_CORRECTION" && input.clockMinutes !== undefined && input.clockSeconds !== undefined) {
      if (game.status !== "PAUSED") throw new Error("CLOCK_CORRECTION_REQUIRES_PAUSED_GAME");
      const minutes = Number(input.clockMinutes);
      const seconds = Number(input.clockSeconds);
      if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds < 0 || seconds > 59 || minutes < 0) {
        throw new Error("INVALID_CLOCK_VALUE");
      }
      const toSeconds = minutes * 60 + seconds;
      clockCorrection = { fromSeconds: game.clockSecondsRemaining, toSeconds };
      await tx.game.update({ where: { id: gameId }, data: { clockSecondsRemaining: toSeconds } });
    }

    // Interruption/abandonment stop play as part of the same action, rather than requiring a
    // separate manual pause first.
    if ((input.type === "GAME_INTERRUPTION" || input.type === "GAME_ABANDONED") && game.status === "LIVE") {
      await tx.game.update({ where: { id: gameId }, data: { status: "PAUSED", clockSecondsRemaining: remainingClockSeconds(game), clockStartedAt: null } });
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_INCIDENT_RECORDED",
      entityType: "GameIncident",
      entityId: gameId,
      details: { fixtureId, incidentType: input.type, reason: input.reason, resolution: "OPEN", clockCorrection },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath("/gameday/incidents");
}

const resolveIncidentSchema = z.object({ incidentId: z.string().min(1), resolution: z.string().trim().min(5, "Describe how this was resolved.") });

export async function resolveIncident(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  const input = resolveIncidentSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const original = await tx.auditLog.findUniqueOrThrow({ where: { id: input.incidentId } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_INCIDENT_RESOLVED",
      entityType: "GameIncident",
      entityId: gameId,
      details: { fixtureId, resolvesIncidentId: original.id, resolution: input.resolution },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath("/gameday/incidents");
}

export async function getGameIncidents(gameId: string) {
  const session = await requireSession();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const entries = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.auditLog.findMany({
      where: { entityType: "GameIncident", entityId: gameId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true } } },
    }),
  );
  const resolvedIds = new Set(
    entries
      .filter((e) => e.action === "GAME_INCIDENT_RESOLVED")
      .map((e) => (e.details as { resolvesIncidentId?: string } | null)?.resolvesIncidentId)
      .filter((id): id is string => Boolean(id)),
  );
  return entries
    .filter((e) => e.action === "GAME_INCIDENT_RECORDED")
    .map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actor: e.user.name,
      details: e.details as { fixtureId: string; incidentType: string; reason: string; clockCorrection: unknown },
      resolved: resolvedIds.has(e.id),
    }))
    .reverse();
}
