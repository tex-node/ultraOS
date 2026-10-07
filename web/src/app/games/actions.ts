"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MissingOrganizationContextError, requireFixturePermission, requireSession } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import {
  createGameEvent,
  type AuthActor,
} from "@/server/scoring";
import { remainingClockSeconds } from "@/lib/game-clock";
import { remainingShotClockSeconds } from "@/lib/game-rules";
import { withOrganizationContext } from "@/lib/tenant-context";
import {
  recordScoreInternal,
  voidScoreEventActionInternal,
  correctScoreEventActionInternal,
  recordStatEventInternal,
  undoLastEventInternal,
  syncUltraTimeState,
} from "./actions-internal";
import { recalculateStandings } from "@/lib/standings-recalculate";
import { getSportDefinition } from "@/lib/sports/registry";
import { LEGACY_STRUCTURE, structureFromRules } from "@/lib/sports/game-structure";
import { resolveSeasonRuleValues } from "@/lib/sports/rule-set-store";
import { isLegalDelivery } from "@/lib/sports/innings-scoring";
import { advanceKnockoutBracket } from "@/lib/sports/knockout-bracket";
import { matchOutcome } from "@/lib/sports/match-result";
import { isKnockoutFormat, resolveFormat } from "@/lib/sports/format";
import { requireSeasonClubId } from "@/lib/sports/fixture-sides";
import { shootoutWinner, type ShootoutKick } from "@/lib/sports/shootout";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { replayTennisGamePoints } from "@/lib/sports/tennis-scoring";
import { hasBlockingIssue, runConstraints } from "@/lib/sports/validators";

function assertGameIsMutable(status: string, fixtureStatus: string) {
  if (
    status === "FINAL" ||
    fixtureStatus === "FINAL" ||
    fixtureStatus === "CANCELLED" ||
    fixtureStatus === "POSTPONED"
  ) {
    throw new Error("GAME_NOT_MUTABLE");
  }
}

// syncUltraTimeState, STAT_FIELD, and ULTRA_TIME_STAT_FIELD moved to ./actions-internal (A5,
// 2026-09-29) alongside the five ledger-writing actions that use them - syncUltraTimeState is
// still called from this file (pauseGame/resumeGame/advancePeriod below), imported above.

export async function startGame(fixtureId: string) {
  const { organizationId } = await requireFixturePermission("game:operate", fixtureId);
  await withOrganizationContext(organizationId, async (tx) => {
    const fixture = await tx.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      select: {
        status: true,
        seasonId: true,
        division: { select: { competition: { select: { sport: { select: { id: true, slug: true } } } } } },
      },
    });
    if (fixture.status === "CANCELLED" || fixture.status === "POSTPONED" || fixture.status === "FINAL") {
      throw new Error("INVALID_FIXTURE");
    }

    // Resolve this competition's structure (periods, period length, shot clock, clock mode) from the
    // season rule set, then the organization override, then the sport definition.
    const sport = fixture.division.competition.sport;
    const definition = getSportDefinition(sport.slug);
    const structure = definition
      ? structureFromRules({
          structure: definition.structure,
          rules: (await resolveSeasonRuleValues(tx, {
            organizationId,
            seasonId: fixture.seasonId,
            sportId: sport.id,
            definition,
          })).values,
        })
      : LEGACY_STRUCTURE;

    const game = await tx.game.upsert({
      where: { fixtureId },
      create: {
        organizationId,
        fixtureId,
        status: "LIVE",
        startedAt: new Date(),
        clockStartedAt: new Date(),
        clockSecondsRemaining: structure.periodSeconds,
        shotClockSecondsRemaining: structure.shotClockSeconds,
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

    // Freeze the rules for this game once, so a played game stays explicable even if the rule set
    // changes later. A reopened game keeps its original snapshot.
    if (definition) {
      const existingSnapshot = await tx.gameRuleSnapshot.findUnique({
        where: { gameId: game.id },
        select: { id: true },
      });
      if (!existingSnapshot) {
        const ruleValues = (await resolveSeasonRuleValues(tx, {
          organizationId,
          seasonId: fixture.seasonId,
          sportId: sport.id,
          definition,
        })).values;
        await tx.gameRuleSnapshot.create({
          data: {
            organizationId,
            gameId: game.id,
            sportId: sport.id,
            ruleSetName: `${definition.name} (${structure.periodCount} x ${Math.round(structure.periodSeconds / 60)})`,
            ruleSetVersion: definition.version,
            definitionVersion: definition.version,
            ruleValues,
            periodCount: structure.periodCount,
            periodDurationSeconds: structure.periodSeconds,
            overtimeDurationSeconds: structure.overtimeSeconds,
            shotClockSeconds: structure.shotClockSeconds,
            clockMode: structure.clockMode,
            fourPointEnabled: ruleValues.FOUR_POINT_ENABLED !== false,
            fourPointBaseValue: Number(ruleValues.FOUR_POINT_BASE_VALUE ?? 4),
            ultraTimeEnabled: ruleValues.ULTRA_TIME_ENABLED !== false,
            ultraTimeStartRemainingSeconds: Number(ruleValues.ULTRA_TIME_THRESHOLD_SECONDS ?? 60),
            ultraTimeMultiplier: Number(ruleValues.ULTRA_TIME_MULTIPLIER ?? 2),
            ultraTimeAppliesFinalPeriodOnly: true,
            fourPointDefinitionType: "OPPOSITE_HALF_ORIGIN",
            mandatorySubstitutionEnabled: false,
            mandatorySubstitutionPeriod: structure.periodCount,
            mandatorySubstitutionPolicy: "AT_LEAST_ONE_PER_HALF",
          },
        });
      }
    }

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "LIVE" },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
}

export async function pauseGame(gameId: string, fixtureId: string) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
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
    await syncUltraTimeState(tx, { ...game, status: "PAUSED" }, organizationId, session.user.id, remaining);
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
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: { select: { status: true } }, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "PAUSED") throw new Error("GAME_NOT_PAUSED");

    await syncUltraTimeState(tx, { ...game, status: "LIVE" }, organizationId, session.user.id, remainingClockSeconds(game));
    await tx.game.update({
      where: { id: gameId },
      data: { status: "LIVE", clockStartedAt: new Date() },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function advancePeriod(gameId: string, fixtureId: string) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  await withOrganizationContext(organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: { select: { status: true } }, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);

    // Period length comes from this game's snapshot: a 4-quarter game resets to its own period
    // length, and anything past the final period is an overtime (shorter) period.
    const snapshot = game.ruleSnapshot;
    const periodCount = snapshot?.periodCount ?? LEGACY_STRUCTURE.periodCount;
    const nextPeriod = game.currentPeriod + 1;
    const nextPeriodSeconds =
      nextPeriod > periodCount
        ? snapshot?.overtimeDurationSeconds ?? LEGACY_STRUCTURE.overtimeSeconds
        : snapshot?.periodDurationSeconds ?? LEGACY_STRUCTURE.periodSeconds;
    const nextShotClockSeconds = snapshot?.shotClockSeconds ?? LEGACY_STRUCTURE.shotClockSeconds;

    await syncUltraTimeState(
      tx,
      { ...game, currentPeriod: nextPeriod, status: "PAUSED" },
      organizationId,
      session.user.id,
      nextPeriodSeconds,
    );
    await tx.game.update({
      where: { id: gameId },
      data: {
        currentPeriod: { increment: 1 },
        clockSecondsRemaining: nextPeriodSeconds,
        clockStartedAt: null,
        shotClockSecondsRemaining: nextShotClockSeconds,
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
      include: { fixture: { select: { status: true } }, ruleSnapshot: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE") throw new Error("GAME_NOT_LIVE");
    const shotClockSeconds = game.ruleSnapshot?.shotClockSeconds ?? LEGACY_STRUCTURE.shotClockSeconds;

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
          shotClockSecondsRemaining: shotClockSeconds,
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

// Thin wrapper: authorization stays here (requireFixturePermission), the actual write logic lives
// in recordScoreInternal (./actions-internal), which takes an injected actor instead of deriving
// one from a session - see actions-internal.ts's header comment for why. External signature
// unchanged, so live/page.tsx's `<form action={recordScore.bind(null, gameId, fixtureId)}>` keeps
// working exactly as before.
export async function recordScore(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const actor: AuthActor = { id: session.user.id, organizationId };
  await recordScoreInternal(gameId, fixtureId, formData, actor);

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

// Reverses a SCORE event's effect (fixture score, player/team totals) and marks it VOIDED. Thin
// wrapper - see recordScore's comment above for the split rationale.
export async function voidScoreEventAction(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const actor: AuthActor = { id: session.user.id, organizationId };
  await voidScoreEventActionInternal(gameId, fixtureId, formData, actor);

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

// Corrects a SCORE event's value and/or scoring player without losing the original record. Thin
// wrapper - see recordScore's comment above for the split rationale.
export async function correctScoreEventAction(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const actor: AuthActor = { id: session.user.id, organizationId };
  await correctScoreEventActionInternal(gameId, fixtureId, formData, actor);

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

// Thin wrapper - see recordScore's comment above for the split rationale.
export async function recordStatEvent(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const actor: AuthActor = { id: session.user.id, organizationId };
  await recordStatEventInternal(gameId, fixtureId, formData, actor);

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
  const knockout = isKnockoutFormat(
    resolveFormat({
      divisionFormat: current.fixture.division.format,
      competitionFormat: current.fixture.division.competition.format,
    }).format,
  );
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
// Thin wrapper - see recordScore's comment above for the split rationale.
export async function undoLastEvent(gameId: string, fixtureId: string) {
  const { session, organizationId } = await requireFixturePermission("game:operate", fixtureId);
  const actor: AuthActor = { id: session.user.id, organizationId };
  await undoLastEventInternal(gameId, fixtureId, actor);

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

// Sport-agnostic capture for a sport's NON-scoring catalog events (cards, fouls, substitutions,
// serves...), recorded with the catalog key in GameEvent.typeKey. Scoring events are rejected here:
// they must go through the path that actually changes the scoreline (the sport's scoring module, or
// basketball's dedicated recordScore), otherwise a "goal" would be stored as a note that does not
// count. Sides resolve through the fixture-sides helper, so this works for individual sports too.
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

    // The captured party is a SeasonClub (team sports) or an Entrant (individual sports).
    const capturedIsEntrant =
      (game.fixture.homeEntrantId !== null && input.seasonClubId === game.fixture.homeEntrantId) ||
      (game.fixture.awayEntrantId !== null && input.seasonClubId === game.fixture.awayEntrantId);
    const validSide = capturedIsEntrant
      ? true
      : input.seasonClubId === game.fixture.homeSeasonClubId || input.seasonClubId === game.fixture.awaySeasonClubId;
    if (!validSide) {
      throw new Error("INVALID_TEAM");
    }

    const definition = getSportDefinition(game.fixture.division.competition.sport.slug);
    if (!definition) throw new Error("UNKNOWN_SPORT");
    const eventDefinition = definition.events.find((event) => event.key === input.typeKey);
    if (!eventDefinition) throw new Error("UNKNOWN_EVENT");

    // Scoring belongs to the scoring panel - refuse to store a score-less duplicate.
    if (eventDefinition.scores === true && (definition.key === "BASKETBALL" || resolveScoringModule(definition))) {
      throw new Error("USE_SCORING_PANEL");
    }

    const player = !capturedIsEntrant && input.playerId
      ? await tx.player.findFirst({
          where: { id: input.playerId, seasonClubId: input.seasonClubId },
          include: { athlete: true },
        })
      : null;
    if (input.playerId && !capturedIsEntrant && !player) throw new Error("INVALID_PLAYER");

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

    await createGameEvent(
      {
        gameId,
        fixtureId,
        seasonClubId: capturedIsEntrant ? null : input.seasonClubId,
        entrantId: capturedIsEntrant ? input.seasonClubId : null,
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
      },
      { actor: { id: session.user.id, organizationId }, source: "LIVE_UI", tx },
    );

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
  points: z.coerce.number().int().min(0).max(8).optional(),
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
      tennisPoints = replayTennisGamePoints(game.events, game.currentPeriod, {
        entrantId: game.fixture.homeEntrantId,
        seasonClubId: game.fixture.homeSeasonClubId,
      });
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
points: input.points,
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

    await createGameEvent(
      {
        gameId,
        fixtureId,
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
        homeScoreBefore: homeBefore,
        awayScoreBefore: awayBefore,
        homeScoreAfter: result.homeScore,
        awayScoreAfter: result.awayScore,
      },
      { actor: { id: session.user.id, organizationId }, source: "LIVE_UI", tx },
    );

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
      // GAME_ENDED must be created before the FINAL flips below, not after (terminal event
      // ordering - see docs/canonical-write-audit.md): createGameEvent's mutable-game gate
      // rejects a FINAL game, and read-your-own-writes within this transaction means the flip
      // below would already be visible to it. Every field here is already computed above, so
      // creating it here changes nothing about what gets written - the two orderings are
      // externally equivalent since everything commits atomically together.
      await createGameEvent(
        {
          gameId,
          fixtureId,
          eventType: "GAME_ENDED",
          typeKey: "GAME_ENDED",
          period: result.period?.period ?? game.currentPeriod,
          clockSeconds: 0,
          description: `Final ${result.homeScore}\u2013${result.awayScore}`,
        },
        { actor: { id: session.user.id, organizationId }, source: "LIVE_UI", tx },
      );
      await tx.fixture.update({ where: { id: fixtureId }, data: { status: "FINAL", winnerSeasonClubId, winnerEntrantId } });
      await tx.game.update({
        where: { id: gameId },
        data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null, isUltraTimeActive: false },
      });
      // Knockout: when this completes the round, create the next round from the winners.
      await advanceKnockoutBracket(tx, organizationId, game.fixture);
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

    const isKnockout = isKnockoutFormat(
      resolveFormat({
        divisionFormat: game.fixture.division.format,
        competitionFormat: game.fixture.division.competition.format,
      }).format,
    );
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

    await createGameEvent(
      {
        gameId,
        fixtureId,
        seasonClubId: parsed.side === "HOME" ? game.fixture.homeSeasonClubId : game.fixture.awaySeasonClubId,
        entrantId: parsed.side === "HOME" ? game.fixture.homeEntrantId : game.fixture.awayEntrantId,
        eventType: "SCORE",
        typeKey: "PENALTY_SHOOTOUT",
        points: parsed.scored ? 1 : 0,
        data: { sportKey: definition.key, kind: "SHOOTOUT", side: parsed.side, scored: parsed.scored },
        period: game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description: `Shootout — ${parsed.side === "HOME" ? "home" : "away"} ${parsed.scored ? "scored" : "missed"}`,
        homeScoreBefore: game.fixture.homeScore,
        awayScoreBefore: game.fixture.awayScore,
        homeScoreAfter: game.fixture.homeScore,
        awayScoreAfter: game.fixture.awayScore,
      },
      { actor: { id: session.user.id, organizationId }, source: "LIVE_UI", tx },
    );

    const winner = shootoutWinner([...kicks, { side: parsed.side, scored: parsed.scored }]);
    if (winner) {
      const winnerSeasonClubId = winner === "HOME" ? game.fixture.homeSeasonClubId : game.fixture.awaySeasonClubId;
      const winnerEntrantId = winner === "HOME" ? game.fixture.homeEntrantId : game.fixture.awayEntrantId;
      // GAME_ENDED must be created before the FINAL flips below, not after - see the identical
      // note in recordScoringEvent and docs/canonical-write-audit.md's "terminal event ordering".
      await createGameEvent(
        {
          gameId,
          fixtureId,
          eventType: "GAME_ENDED",
          typeKey: "GAME_ENDED",
          period: game.currentPeriod,
          clockSeconds: 0,
          description: `Shootout won by ${winner === "HOME" ? "home" : "away"}`,
        },
        { actor: { id: session.user.id, organizationId }, source: "LIVE_UI", tx },
      );
      await tx.fixture.update({ where: { id: fixtureId }, data: { status: "FINAL", winnerSeasonClubId, winnerEntrantId } });
      await tx.game.update({
        where: { id: gameId },
        data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null, isUltraTimeActive: false },
      });
      // Knockout: when this completes the round, create the next round from the winners.
      await advanceKnockoutBracket(tx, organizationId, game.fixture);
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
