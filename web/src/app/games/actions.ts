"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MissingOrganizationContextError, requireFixturePermission, requireSession } from "@/lib/authorization";
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
import { getSportDefinition } from "@/lib/sports/registry";
import { isLegalDelivery } from "@/lib/sports/innings-scoring";
import { advanceKnockoutBracket } from "@/lib/sports/knockout-bracket";
import { matchOutcome } from "@/lib/sports/match-result";
import { resolveFormat } from "@/lib/sports/format";
import { requireSeasonClubId } from "@/lib/sports/fixture-sides";
import { shootoutWinner, type ShootoutKick } from "@/lib/sports/shootout";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { awardPoint } from "@/lib/sports/tennis-scoring";
import { hasBlockingIssue, runConstraints } from "@/lib/sports/validators";
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
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    if (![game.fixture.homeSeasonClubId!, game.fixture.awaySeasonClubId!].includes(seasonClubId)) {
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
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

    const isHome = input.seasonClubId === game.fixture.homeSeasonClubId!;
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
    const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId! : game.fixture.homeSeasonClubId!;
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
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

    const isHome = event.seasonClubId === game.fixture.homeSeasonClubId!;
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
      const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId! : game.fixture.homeSeasonClubId!;
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
    const isHome = event.seasonClubId === game.fixture.homeSeasonClubId!;
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
      const opposingSeasonClubId = isHome ? game.fixture.awaySeasonClubId! : game.fixture.homeSeasonClubId!;
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
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { session, organizationId } = await requireFixturePermission("result:confirm", fixtureId);
  const current = await withOrganizationContext(organizationId, (tx) =>
    tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
      },
    }),
  );
  assertGameIsMutable(current.status, current.fixture.status);
  const definition = getSportDefinition(current.fixture.division.competition.sport.slug);
  const knockout =
    resolveFormat({
      divisionFormat: current.fixture.division.format,
      competitionFormat: current.fixture.division.competition.format,
    }).format === "KNOCKOUT";
  const outcome = definition
    ? matchOutcome(definition, current.fixture.homeScore, current.fixture.awayScore, { knockout })
    : null;
  // A level score is only a valid final result for sports that allow draws/ties (football, cricket);
  // basketball (and any no-draw sport) must not finalize level.
  if (current.fixture.homeScore === current.fixture.awayScore && !outcome) {
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
        ? requireSeasonClubId(game.fixture, "HOME")
        : game.fixture.awayScore > game.fixture.homeScore
          ? requireSeasonClubId(game.fixture, "AWAY")
          : null; // a permitted draw/tie has no winner

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "FINAL", winnerSeasonClubId },
    });
    // Knockout: when this completes the round, create the next round from the winners.
    await advanceKnockoutBracket(tx, organizationId, game.fixture);
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);

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
      const isHome = last.seasonClubId === game.fixture.homeSeasonClubId!;
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
  const { session, organizationId } = await requireFixturePermission("result:confirm", fixtureId);
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
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

const sportEventInput = z.object({
  typeKey: z.string().min(1),
  seasonClubId: z.string().min(1),
  playerId: z.string().optional(),
  points: z.coerce.number().int().optional(),
  description: z.string().optional(),
});

// Sport-agnostic capture: records an event from the sport's catalog (SportDefinition.events) with
// the catalog key in GameEvent.typeKey. This is the catalog-driven path (multi-sport S6.3); it does
// not mutate the fixture score, because per-sport scoring (rally points/sets/innings/goals) is
// resolved by the sport's own scoring model, not a single generic increment. Basketball keeps its
// dedicated scorer panels (recordScore) for points.
export async function recordSportEvent(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const input = sportEventInput.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        fixture: {
          include: { division: { include: { competition: { include: { sport: true } } } } },
        },
      },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") throw new Error("GAME_NOT_ACTIVE");

    if (![game.fixture.homeSeasonClubId!, game.fixture.awaySeasonClubId!].includes(input.seasonClubId)) {
      throw new Error("INVALID_TEAM");
    }

    const definition = getSportDefinition(game.fixture.division.competition.sport.slug);
    if (!definition) throw new Error("UNKNOWN_SPORT");
    const eventDefinition = definition.events.find((event) => event.key === input.typeKey);
    if (!eventDefinition) throw new Error("UNKNOWN_EVENT");

    const player = input.playerId
      ? await tx.player.findFirst({
          where: { id: input.playerId, seasonClubId: input.seasonClubId },
          include: { athlete: true },
        })
      : null;
    if (input.playerId && !player) throw new Error("INVALID_PLAYER");

    // Entry-time validation from the sport's constraints (architecture §5.11).
    const results = runConstraints(definition, "EVENT", {
      event: { typeKey: input.typeKey, hasActor: Boolean(player) },
      player: player ? { isActive: true } : undefined,
    });
    if (hasBlockingIssue(results)) {
      throw new Error(results.find((result) => result.blocks)?.issue ?? "CONSTRAINT_BLOCKED");
    }

    const eventPoints = eventDefinition.scores
      ? input.points ?? eventDefinition.pointValues?.[0] ?? 1
      : null;
    const sequenceNumber = game.nextEventSequence;
    await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player?.id ?? null,
        eventType: "NOTE",
        typeKey: input.typeKey,
        points: eventPoints,
        data: { sportKey: definition.key, label: eventDefinition.label, points: eventPoints },
        period: game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description:
          input.description?.trim() ||
          `${eventDefinition.label}${player ? ` — ${player.athlete.firstName} ${player.athlete.lastName}` : ""}`,
        sequenceNumber,
        source: "ULTRA_NATIVE_LIVE_SCORER",
        createdById: session.user.id,
      },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SPORT_EVENT_RECORDED",
      entityType: "GameEvent",
      entityId: gameId,
      details: { fixtureId, sportKey: definition.key, typeKey: input.typeKey, seasonClubId: input.seasonClubId, playerId: player?.id ?? null },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
}

const scoringInput = z.object({
  seasonClubId: z.string().min(1),
  typeKey: z.string().optional(),
  runs: z.coerce.number().int().min(0).max(6).optional(),
  playerId: z.string().optional(),
  description: z.string().optional(),
});

const CRICKET_DELIVERY_KEYS = new Set([
  "RUN",
  "FOUR",
  "SIX",
  "WICKET",
  "DOT_BALL",
  "EXTRAS_BYE",
  "EXTRAS_LEG_BYE",
  "EXTRAS_WIDE",
  "EXTRAS_NO_BALL",
]);

// Unified sport scoring: resolve the scoring module for the sport's definition, apply the delivery,
// and persist the outcome (fixture score, per-period score, ledger event). Finalizes and
// recalculates standings when the module reports the match decided. Replaces the per-sport scoring
// actions (set points / goals / runs) with one dispatched path.
export async function recordScoringEvent(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const input = scoringInput.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
        periodScores: { orderBy: { period: "asc" } },
        events: {
          select: { period: true, typeKey: true, seasonClubId: true, entrantId: true, sequenceNumber: true },
          orderBy: { sequenceNumber: "asc" },
        },
      },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") throw new Error("GAME_NOT_ACTIVE");

    const definition = getSportDefinition(game.fixture.division.competition.sport.slug);
    if (!definition) throw new Error("UNKNOWN_SPORT");
    const scoringModule = resolveScoringModule(definition);
    if (!scoringModule) throw new Error("NO_SCORING_MODULE");

    // The captured party is a SeasonClub (team sports) or an Entrant (individual sports).
    const homePartyId = game.fixture.homeSeasonClubId ?? game.fixture.homeEntrantId;
    const awayPartyId = game.fixture.awaySeasonClubId ?? game.fixture.awayEntrantId;
    if (!homePartyId || !awayPartyId) throw new Error("FIXTURE_SIDES_MISSING");
    const capturedIsEntrant =
      input.seasonClubId === game.fixture.homeEntrantId || input.seasonClubId === game.fixture.awayEntrantId;

    // Per-innings wickets/balls (cricket) derived from the ledger.
    const periodWickets: Record<number, number> = {};
    const periodBalls: Record<number, number> = {};
    for (const event of game.events) {
      if (event.period == null || !event.typeKey) continue;
      if (event.typeKey === "WICKET") periodWickets[event.period] = (periodWickets[event.period] ?? 0) + 1;
      if (CRICKET_DELIVERY_KEYS.has(event.typeKey) && isLegalDelivery(event.typeKey)) {
        periodBalls[event.period] = (periodBalls[event.period] ?? 0) + 1;
      }
    }

    // Tennis: replay this set's point events to recover the current game's point counts.
    let tennisPoints: { home: number; away: number } | undefined;
    if (scoringModule.kind === "TENNIS") {
      tennisPoints = { home: 0, away: 0 };
      for (const event of game.events) {
        if (event.period !== game.currentPeriod || event.typeKey !== "POINT") continue;
        const side =
          (event.entrantId && event.entrantId === game.fixture.homeEntrantId) ||
          (event.seasonClubId && event.seasonClubId === game.fixture.homeSeasonClubId)
            ? "HOME"
            : "AWAY";
        const awarded = awardPoint(tennisPoints, side);
        tennisPoints = awarded.gameWon ? { home: 0, away: 0 } : awarded.points;
      }
    }

    const result = scoringModule.apply(definition, {
      homeSeasonClubId: homePartyId,
      awaySeasonClubId: awayPartyId,
      currentPeriod: game.currentPeriod,
      homeScore: game.fixture.homeScore,
      awayScore: game.fixture.awayScore,
      periodScores: game.periodScores.map((score) => ({ period: score.period, home: score.homeScore, away: score.awayScore })),
      periodWickets,
      periodBalls,
      seasonClubId: input.seasonClubId,
      typeKey: input.typeKey,
      runs: input.runs,
      tennisPoints,
    });
    if (!result.ok) throw new Error(result.reason);

    const homeBefore = game.fixture.homeScore;
    const awayBefore = game.fixture.awayScore;
    await tx.fixture.update({
      where: { id: fixtureId },
      data: { homeScore: result.homeScore, awayScore: result.awayScore },
    });

    if (result.period) {
      await tx.gamePeriodScore.upsert({
        where: { gameId_period: { gameId, period: result.period.period } },
        create: { organizationId, gameId, period: result.period.period, label: `P${result.period.period}`, homeScore: result.period.home, awayScore: result.period.away },
        update: { homeScore: result.period.home, awayScore: result.period.away },
      });
    }

    const player = !capturedIsEntrant && input.playerId
      ? await tx.player.findFirst({ where: { id: input.playerId, seasonClubId: input.seasonClubId }, include: { athlete: true } })
      : null;

    const sequenceNumber = game.nextEventSequence;
    await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: capturedIsEntrant ? null : input.seasonClubId,
        entrantId: capturedIsEntrant ? input.seasonClubId : null,
        playerId: player?.id ?? null,
        eventType: result.eventKind,
        typeKey: result.typeKey,
        points: result.points,
        data: { sportKey: definition.key, module: scoringModule.key, note: result.note, tennisPoints: result.tennisPoints },
        period: result.period?.period ?? game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description:
          input.description?.trim() ||
          `${result.typeKey.replace(/_/g, " ")}${result.points ? ` (${result.points})` : ""}${player ? ` — ${player.athlete.firstName} ${player.athlete.lastName}` : ""}`,
        sequenceNumber,
        homeScoreBefore: homeBefore,
        awayScoreBefore: awayBefore,
        homeScoreAfter: result.homeScore,
        awayScoreAfter: result.awayScore,
        source: "ULTRA_NATIVE_LIVE_SCORER",
        createdById: session.user.id,
      },
    });

    if (result.nextPeriod) {
      await tx.game.update({ where: { id: gameId }, data: { currentPeriod: result.nextPeriod } });
    }

    if (result.finalize) {
      const winnerSeasonClubId =
        result.finalizeWinner === "HOME"
          ? game.fixture.homeSeasonClubId
          : result.finalizeWinner === "AWAY"
            ? game.fixture.awaySeasonClubId
            : null;
      const winnerEntrantId =
        result.finalizeWinner === "HOME"
          ? game.fixture.homeEntrantId
          : result.finalizeWinner === "AWAY"
            ? game.fixture.awayEntrantId
            : null;
      await tx.fixture.update({ where: { id: fixtureId }, data: { status: "FINAL", winnerSeasonClubId, winnerEntrantId } });
      await tx.game.update({
        where: { id: gameId },
        data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null, isUltraTimeActive: false },
      });
      // Knockout: when this completes the round, create the next round from the winners.
      await advanceKnockoutBracket(tx, organizationId, game.fixture);
      await tx.gameEvent.create({
        data: {
          organizationId,
          gameId,
          eventType: "GAME_ENDED",
          typeKey: "GAME_ENDED",
          period: result.period?.period ?? game.currentPeriod,
          clockSeconds: 0,
          description: `Final ${result.homeScore}\u2013${result.awayScore}`,
          source: "ULTRA_NATIVE_LIVE_SCORER",
          createdById: session.user.id,
        },
      });
      await recalculateStandings(tx, organizationId, game.fixture.seasonId);
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SCORING_EVENT_RECORDED",
      entityType: "Game",
      entityId: gameId,
      details: {
        fixtureId,
        module: scoringModule.key,
        typeKey: result.typeKey,
        seasonClubId: input.seasonClubId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        finalize: result.finalize,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
  revalidatePath("/standings");
  revalidatePath(`/scoreboard/${gameId}`);
}

const shootoutInput = z.object({
  side: z.enum(["HOME", "AWAY"]),
  scored: z.enum(["true", "false"]).transform((value) => value === "true"),
});

// Penalty shootout capture, for knockout matches that extra time could not separate. Each kick is a
// GameEvent so the shootout stays auditable and correctable like any other ledger entry; the winner
// is derived from the full kick ledger (best-of-five, then sudden death) rather than stored ad hoc.
export async function recordShootoutKick(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const parsed = shootoutInput.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
        events: { select: { typeKey: true, data: true }, orderBy: { sequenceNumber: "asc" } },
      },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") throw new Error("GAME_NOT_ACTIVE");

    const isKnockout =
      resolveFormat({
        divisionFormat: game.fixture.division.format,
        competitionFormat: game.fixture.division.competition.format,
      }).format === "KNOCKOUT";
    if (!isKnockout) throw new Error("NOT_KNOCKOUT");
    const definition = getSportDefinition(game.fixture.division.competition.sport.slug);
    if (!definition) throw new Error("UNKNOWN_SPORT");
    if (!definition.capabilities.includes("PENALTIES")) throw new Error("NO_PENALTIES_CAPABILITY");
    // A shootout only exists once regulation and extra time leave the match level.
    if (game.fixture.homeScore !== game.fixture.awayScore) throw new Error("SCORES_NOT_LEVEL");

    const kicks: ShootoutKick[] = [];
    for (const event of game.events) {
      if (event.typeKey !== "PENALTY_SHOOTOUT") continue;
      const data = (event.data ?? {}) as { side?: string; scored?: boolean };
      if ((data.side === "HOME" || data.side === "AWAY") && typeof data.scored === "boolean") {
        kicks.push({ side: data.side, scored: data.scored });
      }
    }

    const sequenceNumber = game.nextEventSequence;
    await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: parsed.side === "HOME" ? game.fixture.homeSeasonClubId : game.fixture.awaySeasonClubId,
        entrantId: parsed.side === "HOME" ? game.fixture.homeEntrantId : game.fixture.awayEntrantId,
        eventType: "SCORE",
        typeKey: "PENALTY_SHOOTOUT",
        points: parsed.scored ? 1 : 0,
        data: { sportKey: definition.key, kind: "SHOOTOUT", side: parsed.side, scored: parsed.scored },
        period: game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description: `Shootout — ${parsed.side === "HOME" ? "home" : "away"} ${parsed.scored ? "scored" : "missed"}`,
        sequenceNumber,
        homeScoreBefore: game.fixture.homeScore,
        awayScoreBefore: game.fixture.awayScore,
        homeScoreAfter: game.fixture.homeScore,
        awayScoreAfter: game.fixture.awayScore,
        source: "ULTRA_NATIVE_LIVE_SCORER",
        createdById: session.user.id,
      },
    });

    const winner = shootoutWinner([...kicks, { side: parsed.side, scored: parsed.scored }]);
    if (winner) {
      const winnerSeasonClubId = winner === "HOME" ? game.fixture.homeSeasonClubId : game.fixture.awaySeasonClubId;
      const winnerEntrantId = winner === "HOME" ? game.fixture.homeEntrantId : game.fixture.awayEntrantId;
      await tx.fixture.update({ where: { id: fixtureId }, data: { status: "FINAL", winnerSeasonClubId, winnerEntrantId } });
      await tx.game.update({
        where: { id: gameId },
        data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null, isUltraTimeActive: false },
      });
      // Knockout: when this completes the round, create the next round from the winners.
      await advanceKnockoutBracket(tx, organizationId, game.fixture);
      await tx.gameEvent.create({
        data: {
          organizationId,
          gameId,
          eventType: "GAME_ENDED",
          typeKey: "GAME_ENDED",
          period: game.currentPeriod,
          clockSeconds: 0,
          description: `Shootout won by ${winner === "HOME" ? "home" : "away"}`,
          source: "ULTRA_NATIVE_LIVE_SCORER",
          createdById: session.user.id,
        },
      });
      await recalculateStandings(tx, organizationId, game.fixture.seasonId);
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SHOOTOUT_KICK_RECORDED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, side: parsed.side, scored: parsed.scored, winner },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
  revalidatePath("/standings");
  revalidatePath(`/scoreboard/${gameId}`);
}
