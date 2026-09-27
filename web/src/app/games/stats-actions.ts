"use server";

// Statistician console server actions (G.15). Architecturally independent from the scorer
// console (games/actions.ts): a separate permission (game:record-stats), a separate GameEvent
// source tag (ULTRA_NATIVE_LIVE_STATISTICIAN), and — deliberately — no writes to
// Fixture.homeScore/awayScore or to PlayerStat/TeamStat. The scorer's console remains the sole
// write path for the official score and the canonical box score; the statistician's ledger
// exists purely as an independently-derived cross-check, reconciled against the official score
// (see src/lib/reconciliation.ts). This is the safest way to add a second, genuinely
// independent set of eyes without risking a duplicate/competing scoring truth (Part I.6).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFixturePermission, requireSession, MissingOrganizationContextError } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { createGameEvent, withGameWrite } from "@/server/scoring";
import { remainingClockSeconds } from "@/lib/game-clock";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import {
  effectiveRuleSnapshot,
  isUltraTimeUnderRules,
  scoreShot,
} from "@/lib/ultra-scoring-engine";
import { reconcileGameScore, type GameReconciliation } from "@/lib/reconciliation";
import { compareScores, verificationSummary } from "@/lib/sports/score-verify";
import { requireSeasonClubId } from "@/lib/sports/fixture-sides";
import { COURT_LENGTH_FT, COURT_WIDTH_FT, shotZone } from "@/lib/sports/shot-zones";
import {
  derivePlayerStats,
  deriveTeamStats,
  deriveTeamScore,
  emptyPlayerStats,
  emptyTeamStats,
  type DerivableEvent,
  type DerivedPlayerStats,
  type DerivedTeamStats,
} from "@/lib/event-derived-stats";
import { deriveLineup, validateSubstitution, type Lineup } from "@/lib/lineup";
import type { Prisma } from "@/generated/prisma/client";

const STATISTICIAN_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;

function assertGameIsMutable(status: string, fixtureStatus: string) {
  if (status === "FINAL" || fixtureStatus === "FINAL" || fixtureStatus === "CANCELLED" || fixtureStatus === "POSTPONED") {
    throw new Error("GAME_NOT_MUTABLE");
  }
}

async function loadMutableGame(tx: Prisma.TransactionClient, organizationId: string, gameId: string, fixtureId: string, actorId: string) {
  // Locks the same row the scorer console locks (Fixture, not Game) so a concurrent scorer
  // write and a concurrent statistician write can never both read the same
  // Game.nextEventSequence value before either commits - true mutual exclusion requires both
  // consoles to serialize through one shared lock, even though this path never writes Fixture.
  await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
  const game = await tx.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: true, ruleSnapshot: true },
  });
  assertGameIsMutable(game.status, game.fixture.status);
  if (game.status !== "LIVE" && game.status !== "PAUSED") {
    throw new Error("GAME_NOT_ACTIVE");
  }
  if (game.fixtureId !== fixtureId) throw new Error("INVALID_EVENT");

  // Part XXXIV: statistics that have been VERIFIED must not silently keep that badge once the
  // underlying ledger changes again. Rather than hard-blocking every post-verification entry
  // (which would make correcting a statistician's own mistake impossible without reopening the
  // whole game), any new statistician write automatically clears the stale verification stamp
  // - the reconciliation panel then honestly shows "needs re-verification" instead of a lying
  // green badge. The clearing itself is audited, same as the verification was.
  if (game.statisticsVerifiedAt) {
    await tx.game.update({ where: { id: gameId }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });
    await writeAuditLog(tx, {
      organizationId,
      userId: actorId,
      action: "STATISTICS_VERIFICATION_CLEARED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, reason: "New statistician event recorded after verification" },
    });
  }
  return game;
}

async function nextSequence(tx: Prisma.TransactionClient, gameId: string, current: number) {
  await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });
  return current;
}

// Reads this game's current on-court lineup by combining its confirmed starting five with
// every ACTIVE structured substitution since (Part XII). Pure derivation over persisted data -
// no in-memory state, so it reconstructs identically after a restart.
export async function getGameLineup(gameId: string): Promise<Lineup> {
  const session = await requireSession();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const [starters, substitutions] = await withOrganizationContext(session.user.organizationId, (tx) =>
    Promise.all([
      tx.gameStarter.findMany({ where: { gameId }, select: { seasonClubId: true, playerId: true } }),
      tx.gameEvent.findMany({
        where: { gameId, eventType: "SUBSTITUTION", status: "ACTIVE" },
        orderBy: { sequenceNumber: "asc" },
        select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true },
      }),
    ]),
  );
  return deriveLineup(
    starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })),
    substitutions
      .filter((s): s is typeof s & { seasonClubId: string; substitutedOutPlayerId: string; sequenceNumber: number } =>
        Boolean(s.seasonClubId && s.playerId && s.substitutedOutPlayerId && s.sequenceNumber !== null))
      .map((s) => ({ seasonClubId: s.seasonClubId, playerInId: s.playerId!, playerOutId: s.substitutedOutPlayerId!, sequenceNumber: s.sequenceNumber! })),
  );
}

const shotSchema = z.object({
  seasonClubId: z.string(),
  playerId: z.string().min(1),
  shotValue: z.coerce.number().int().min(1).max(4),
  made: z.enum(["true", "false"]),
  // Click-to-log coordinates from the court graphic, in feet (see lib/sports/shot-zones). Optional:
  // free throws are logged from the line without clicking.
  x: z.coerce.number().min(0).max(COURT_WIDTH_FT).optional(),
  y: z.coerce.number().min(0).max(COURT_LENGTH_FT).optional(),
  // Links this free throw to the foul that awarded it, so the console can show pending FTs
  // (awarded minus recorded) and voiding an FT reopens its slot.
  causedByEventId: z.string().optional(),
});

// Records one shot attempt (make or miss) into the statistician's own ledger. Deliberately
// does not touch Fixture.homeScore/awayScore or PlayerStat/TeamStat - see file header.
export async function recordStatisticianShot(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = shotSchema.parse(Object.fromEntries(formData.entries()));
  const made = input.made === "true";

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }
    const player = await tx.player.findFirst({ where: { id: input.playerId, seasonClubId: input.seasonClubId }, include: { athlete: true } });
    if (!player) throw new Error("INVALID_PLAYER");

    // The zone is derived server-side from the coordinates, so the console preview and the ledger
    // can never disagree. Free throws logged without a click come from the line.
    if ((input.x === undefined) !== (input.y === undefined)) throw new Error("LOCATION_INCOMPLETE");
    const courtZone =
      input.x !== undefined && input.y !== undefined ? shotZone(input.x, input.y) : input.shotValue === 1 ? "FREE_THROW" : null;

    const remaining = remainingClockSeconds(game);
    const shot = scoreShot({
      rules: effectiveRuleSnapshot(game.ruleSnapshot),
      shotValue: input.shotValue,
      gameStatus: game.status,
      currentPeriod: game.currentPeriod,
      remainingClockSeconds: remaining,
    });
    if (!shot.valid) throw new Error(shot.error);

    // A linked free throw must point at a foul from this same game that actually awarded FTs.
    let causedByEventId: string | undefined;
    if (input.causedByEventId) {
      if (input.shotValue !== 1) throw new Error("LINKED_SHOT_MUST_BE_FREE_THROW");
      const foul = await tx.gameEvent.findFirst({
        where: { id: input.causedByEventId, gameId, eventType: "FOUL", status: "ACTIVE" },
        select: { id: true, freeThrowsAwarded: true },
      });
      if (!foul || !foul.freeThrowsAwarded) throw new Error("INVALID_FOUL_LINK");
      causedByEventId = foul.id;
    }

    const sequenceNumber = await nextSequence(tx, gameId, game.nextEventSequence);
    const eventType =
      input.shotValue === 1
        ? made
          ? "FREE_THROW_MADE"
          : "FREE_THROW_MISSED"
        : made
          ? "SHOT_MADE"
          : "SHOT_MISSED";

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player.id,
        eventType,
        points: made ? shot.pointsAwarded : 0,
        basePointValue: shot.basePointValue,
        multiplier: shot.multiplier,
        made,
        isFourPointAttempt: input.shotValue === 4,
        isUltraTime: shot.isUltraTime,
        x: input.x ?? null,
        y: input.y ?? null,
        courtZone,
        causedByEventId,
        period: game.currentPeriod,
        clockSeconds: remaining,
        description: `${player.athlete.firstName} ${player.athlete.lastName} — ${input.shotValue}PT ${made ? "MADE" : "MISS"}${courtZone ? ` (${courtZone.replace(/_/g, " ")})` : ""}${shot.isUltraTime ? ` (Ultra Time ×${shot.multiplier})` : ""}`,
        sequenceNumber,
        source: STATISTICIAN_SOURCE,
        createdById: session.user.id,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/live`);
}

const OTHER_STAT_TYPES = ["OFFENSIVE_REBOUND", "DEFENSIVE_REBOUND", "ASSIST", "STEAL", "BLOCK", "TURNOVER", "FOUL"] as const;

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const otherStatSchema = z.object({
  seasonClubId: z.string(),
  playerId: z.string().optional(),
  eventType: z.enum(OTHER_STAT_TYPES),
  fouledPlayerId: z.string().optional(),
  foulType: z.preprocess(emptyToUndefined, z.enum(["PERSONAL", "TECHNICAL", "FLAGRANT", "OFFENSIVE"]).optional()),
  // NCAA-style foul depth (stats Phase 3): who the foul was assessed to, Class A/B for technicals,
  // and how many free throws it awarded (drives the pending-FT list on the console).
  foulTarget: z.preprocess(emptyToUndefined, z.enum(["PLAYER", "BENCH", "COACH"]).optional()),
  technicalClass: z.preprocess(emptyToUndefined, z.enum(["CLASS_A", "CLASS_B"]).optional()),
  freeThrowsAwarded: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(3).optional()),
});

export async function recordStatisticianStat(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = otherStatSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }
    const target = input.eventType === "FOUL" ? (input.foulTarget ?? "PLAYER") : "PLAYER";
    const player = input.playerId
      ? await tx.player.findFirst({ where: { id: input.playerId, seasonClubId: input.seasonClubId }, include: { athlete: true } })
      : null;
    if (!player && (input.eventType !== "FOUL" || target === "PLAYER")) {
      throw new Error("INVALID_PLAYER");
    }

    let fouledPlayerId: string | undefined;
    if (input.eventType === "FOUL" && input.fouledPlayerId) {
      const fouledPlayer = await tx.player.findFirst({
        where: { id: input.fouledPlayerId, seasonClubId: { in: [homeId, awayId] } },
      });
      if (!fouledPlayer) throw new Error("INVALID_FOULED_PLAYER");
      fouledPlayerId = fouledPlayer.id;
    }

    // Class A/B only exists on technicals; bench/coach fouls carry no player.
    const foulTarget = input.eventType === "FOUL" ? target : undefined;
    if (input.technicalClass && (input.eventType !== "FOUL" || input.foulType !== "TECHNICAL")) {
      throw new Error("INVALID_TECHNICAL_CLASS");
    }
    const technicalClass = input.eventType === "FOUL" && input.foulType === "TECHNICAL" ? input.technicalClass : undefined;
    const freeThrowsAwarded = input.eventType === "FOUL" ? (input.freeThrowsAwarded ?? 0) : 0;

    const remaining = remainingClockSeconds(game);
    const ultraTime = isUltraTimeUnderRules(effectiveRuleSnapshot(game.ruleSnapshot), game.status, game.currentPeriod, remaining);
    const sequenceNumber = await nextSequence(tx, gameId, game.nextEventSequence);

    const foulLabel =
      input.eventType !== "FOUL"
        ? null
        : [
            input.foulType === "TECHNICAL" && technicalClass ? `Technical foul (Class ${technicalClass === "CLASS_A" ? "A" : "B"})` : (input.foulType ?? "Foul"),
            foulTarget === "BENCH" ? "bench" : foulTarget === "COACH" ? "coaching staff" : null,
          ]
            .filter(Boolean)
            .join(" — ");

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player?.id ?? null,
        fouledPlayerId: input.eventType === "FOUL" ? fouledPlayerId : undefined,
        foulType: input.eventType === "FOUL" ? input.foulType || undefined : undefined,
        technicalClass,
        foulTarget,
        freeThrowsAwarded: input.eventType === "FOUL" && freeThrowsAwarded > 0 ? freeThrowsAwarded : null,
        eventType: input.eventType,
        period: game.currentPeriod,
        clockSeconds: remaining,
        description:
          input.eventType === "FOUL"
            ? `${foulLabel}${player ? ` — ${player.athlete.firstName} ${player.athlete.lastName}` : ""}${freeThrowsAwarded > 0 ? ` · ${freeThrowsAwarded} FT${freeThrowsAwarded === 1 ? "" : "s"}` : ""}`
            : `${player!.athlete.firstName} ${player!.athlete.lastName} — ${input.eventType.replaceAll("_", " ")}`,
        sequenceNumber,
        isUltraTime: ultraTime,
        source: STATISTICIAN_SOURCE,
        createdById: session.user.id,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
}

const substitutionSchema = z.object({
  seasonClubId: z.string(),
  playerInId: z.string().min(1),
  playerOutId: z.string().min(1),
});

// G.16 structured substitution model (Part XI): one event records a whole swap - playerId is
// who came IN, substitutedOutPlayerId is who went OUT - rather than G.15's two directional
// events with direction encoded in free text. Validated against the actual current lineup
// (Part XIV), derived fresh inside this same transaction so a concurrent substitution can never
// corrupt the check (Part XXXIV).
export async function recordSubstitution(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = substitutionSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }
    const [playerIn, playerOut] = await Promise.all([
      tx.player.findFirst({ where: { id: input.playerInId, seasonClubId: input.seasonClubId }, include: { athlete: true } }),
      tx.player.findFirst({ where: { id: input.playerOutId, seasonClubId: input.seasonClubId }, include: { athlete: true } }),
    ]);
    if (!playerIn) throw new Error("INVALID_PLAYER_IN");
    if (!playerOut) throw new Error("INVALID_PLAYER_OUT");

    const [starters, activeSubs] = await Promise.all([
      tx.gameStarter.findMany({ where: { gameId }, select: { seasonClubId: true, playerId: true } }),
      tx.gameEvent.findMany({
        where: { gameId, eventType: "SUBSTITUTION", status: "ACTIVE" },
        orderBy: { sequenceNumber: "asc" },
        select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true },
      }),
    ]);
    if (starters.length === 0) throw new Error("STARTING_FIVE_NOT_CONFIRMED");
    const lineup = deriveLineup(
      starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })),
      activeSubs.map((s) => ({ seasonClubId: s.seasonClubId!, playerInId: s.playerId!, playerOutId: s.substitutedOutPlayerId!, sequenceNumber: s.sequenceNumber! })),
    );
    const validation = validateSubstitution(lineup, input.seasonClubId, playerIn.id, playerOut.id);
    if (!validation.valid) throw new Error(`SUBSTITUTION_INVALID_${validation.error}`);

    const remaining = remainingClockSeconds(game);
    const sequenceNumber = await nextSequence(tx, gameId, game.nextEventSequence);

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: playerIn.id,
        substitutedOutPlayerId: playerOut.id,
        eventType: "SUBSTITUTION",
        period: game.currentPeriod,
        clockSeconds: remaining,
        description: `Substitution: ${playerOut.athlete.firstName} ${playerOut.athlete.lastName} OUT, ${playerIn.athlete.firstName} ${playerIn.athlete.lastName} IN`,
        sequenceNumber,
        source: STATISTICIAN_SOURCE,
        createdById: session.user.id,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
}

const waveSubstitutionSchema = z.object({
  seasonClubId: z.string(),
  playerInIds: z.array(z.string().min(1)).min(1).max(5),
  playerOutIds: z.array(z.string().min(1)).min(1).max(5),
});

// Wave substitution: one to five swaps recorded atomically in a single transaction, each validated
// against the evolving lineup in order - so a wave can rotate the whole five without the intermediate
// states ever failing the single-swap check. "Switch to wave sub" in the console is just this action
// with five pairs; a partial wave (1-4 pairs) is equally valid.
export async function recordWaveSubstitution(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const raw = Object.fromEntries(formData.entries());
  const input = waveSubstitutionSchema.parse({
    seasonClubId: raw.seasonClubId,
    playerInIds: formData.getAll("playerInIds").map(String),
    playerOutIds: formData.getAll("playerOutIds").map(String),
  });
  if (input.playerInIds.length !== input.playerOutIds.length) throw new Error("WAVE_MISMATCHED_PAIRS");

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }

    const allIds = [...input.playerInIds, ...input.playerOutIds];
    if (new Set(allIds).size !== allIds.length) throw new Error("WAVE_DUPLICATE_PLAYER");
    const rostered = await tx.player.findMany({
      where: { id: { in: allIds }, seasonClubId: input.seasonClubId },
      include: { athlete: true },
    });
    if (rostered.length !== allIds.length) throw new Error("WAVE_PLAYER_NOT_ROSTERED");
    const byId = new Map(rostered.map((player) => [player.id, player]));

    const starters = await tx.gameStarter.findMany({ where: { gameId }, select: { seasonClubId: true, playerId: true } });
    if (starters.length === 0) throw new Error("STARTING_FIVE_NOT_CONFIRMED");
    const activeSubs = await tx.gameEvent.findMany({
      where: { gameId, eventType: "SUBSTITUTION", status: "ACTIVE" },
      orderBy: { sequenceNumber: "asc" },
      select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true },
    });
    const lineup = deriveLineup(
      starters.map((starter) => ({ seasonClubId: starter.seasonClubId, playerId: starter.playerId })),
      activeSubs.map((sub) => ({ seasonClubId: sub.seasonClubId!, playerInId: sub.playerId!, playerOutId: sub.substitutedOutPlayerId!, sequenceNumber: sub.sequenceNumber! })),
    );

    const remaining = remainingClockSeconds(game);
    let sequence = game.nextEventSequence;
    const createdIds: string[] = [];
    for (let index = 0; index < input.playerInIds.length; index += 1) {
      const playerInId = input.playerInIds[index];
      const playerOutId = input.playerOutIds[index];
      const validation = validateSubstitution(lineup, input.seasonClubId, playerInId, playerOutId);
      if (!validation.valid) throw new Error(`SUBSTITUTION_INVALID_${validation.error}`);
      const playerIn = byId.get(playerInId)!;
      const playerOut = byId.get(playerOutId)!;
      const sequenceNumber = await nextSequence(tx, gameId, sequence);
      sequence += 1;
      const created = await tx.gameEvent.create({
        data: {
          organizationId,
          gameId,
          seasonClubId: input.seasonClubId,
          playerId: playerIn.id,
          substitutedOutPlayerId: playerOut.id,
          eventType: "SUBSTITUTION",
          period: game.currentPeriod,
          clockSeconds: remaining,
          description: `Substitution: ${playerOut.athlete.firstName} ${playerOut.athlete.lastName} OUT, ${playerIn.athlete.firstName} ${playerIn.athlete.lastName} IN (wave ${index + 1}/${input.playerInIds.length})`,
          sequenceNumber,
          source: STATISTICIAN_SOURCE,
          createdById: session.user.id,
        },
        select: { id: true },
      });
      createdIds.push(created.id);
      lineup.get(input.seasonClubId)!.delete(playerOutId);
      lineup.get(input.seasonClubId)!.add(playerInId);
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "WAVE_SUBSTITUTION_RECORDED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, seasonClubId: input.seasonClubId, count: createdIds.length, eventIds: createdIds },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
  revalidatePath(`/games/${fixtureId}/live`);
}

// Voids one specific ACTIVE statistician event by id (the action log's trash icon). Never touches
// scorer-sourced events and never deletes the row - VOIDED events are excluded from replay, so the
// reconciliation panel updates correctly without losing audit history.
export async function voidStatisticianEvent(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const eventId = z.string().min(1).parse(formData.get("eventId"));

  await withOrganizationContext(organizationId, async (tx) => {
    await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);

    const target = await tx.gameEvent.findFirst({
      where: { id: eventId, gameId, source: STATISTICIAN_SOURCE, status: "ACTIVE" },
    });
    if (!target) throw new Error("EVENT_NOT_VOIDABLE");

    await tx.gameEvent.update({
      where: { id: target.id },
      data: { status: "VOIDED", correctedAt: new Date(), correctedById: session.user.id, correctionReason: "OPERATOR_VOID" },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "STATISTICIAN_EVENT_VOIDED",
      entityType: "GameEvent",
      entityId: target.id,
      details: { fixtureId, gameId, voidedEventType: target.eventType, voidedDescription: target.description },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
  revalidatePath(`/games/${fixtureId}/live`);
}

const timeoutSchema = z.object({
  seasonClubId: z.string().optional(),
});

// Records a timeout (team or, with no side, an officials timeout) into the statistician ledger.
// Never touches the clock - the operator stops it separately, which is also what the scoreboard
// verification prompt hangs off.
export async function recordGameTimeout(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = timeoutSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    if (input.seasonClubId) {
      const homeId = requireSeasonClubId(game.fixture, "HOME");
      const awayId = requireSeasonClubId(game.fixture, "AWAY");
      if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
        throw new Error("INVALID_TEAM");
      }
    }

    const remaining = remainingClockSeconds(game);
    const sequenceNumber = await nextSequence(tx, gameId, game.nextEventSequence);
    const side = !input.seasonClubId
      ? "Officials"
      : input.seasonClubId === game.fixture.homeSeasonClubId
        ? "Home"
        : "Away";

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId ?? null,
        eventType: "TIMEOUT",
        period: game.currentPeriod,
        clockSeconds: remaining,
        description: `Timeout — ${side}`,
        sequenceNumber,
        source: STATISTICIAN_SOURCE,
        createdById: session.user.id,
      },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "STATISTICIAN_TIMEOUT_RECORDED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, seasonClubId: input.seasonClubId ?? null },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
  revalidatePath(`/games/${fixtureId}/live`);
}

const sideSchema = z.object({
  seasonClubId: z.string().min(1),
});

// Opening tip and possession arrow. Recorded as ledger notes (no GameEventType exists for them),
// so the current possession is always derived from the most recent one - never stored state that
// can drift from the history.
export async function recordJumpBall(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = sideSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }

    const remaining = remainingClockSeconds(game);
    const sequenceNumber = await nextSequence(tx, gameId, game.nextEventSequence);
    const side = input.seasonClubId === homeId ? "Home" : "Away";

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        seasonClubId: input.seasonClubId,
        eventType: "NOTE",
        typeKey: "JUMP_BALL",
        period: game.currentPeriod,
        clockSeconds: remaining,
        description: `Jump ball won by ${side} — possession arrow to ${side}`,
        sequenceNumber,
        source: STATISTICIAN_SOURCE,
        createdById: session.user.id,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function flipPossession(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = sideSchema.parse(Object.fromEntries(formData.entries()));

  await withGameWrite(
    gameId,
    fixtureId,
    {
      actor: { id: session.user.id, organizationId },
      source: "LIVE_UI",
      ledgerSourceHint: "STATISTICIAN",
    },
    async ({ game, ...writeCtx }) => {
      const homeId = requireSeasonClubId(game.fixture, "HOME");
      const awayId = requireSeasonClubId(game.fixture, "AWAY");
      if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
        throw new Error("INVALID_TEAM");
      }
      const side = input.seasonClubId === homeId ? "Home" : "Away";

      await createGameEvent(
        {
          fixtureId,
          gameId,
          seasonClubId: input.seasonClubId,
          eventType: "NOTE",
          typeKey: "POSSESSION",
          description: `Possession arrow to ${side}`,
        },
        writeCtx,
      );
    },
  );

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
  revalidatePath(`/games/${fixtureId}/live`);
}

const verifyScoreboardSchema = z.object({
  venueHomeScore: z.coerce.number().int().min(0).max(300),
  venueAwayScore: z.coerce.number().int().min(0).max(300),
  note: z.string().trim().max(280).optional(),
});

// Scoreboard verification: during a timeout or stoppage, confirm the in-app score against the
// venue's physical scoreboard. Compares all three numbers - official (scorer), statistician
// (this ledger, derived fresh), venue (typed in) - and records the outcome as a ledger event so
// the check itself is auditable. A mismatch never rewrites anything; it just says so loudly.
export async function verifyScoreboard(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const input = verifyScoreboardSchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");

    const events = await loadActiveStatisticianEvents(tx, gameId);
    const teamStats = deriveTeamStats(derivePlayerStats(events));
    const official = { home: game.fixture.homeScore, away: game.fixture.awayScore };
    const statistician = { home: deriveTeamScore(teamStats, homeId), away: deriveTeamScore(teamStats, awayId) };
    const venue = { home: input.venueHomeScore, away: input.venueAwayScore };
    const comparison = compareScores(official, statistician, venue);

    const remaining = remainingClockSeconds(game);
    const sequenceNumber = await nextSequence(tx, gameId, game.nextEventSequence);

    await tx.gameEvent.create({
      data: {
        organizationId,
        gameId,
        eventType: "NOTE",
        typeKey: "SCORE_VERIFIED",
        period: game.currentPeriod,
        clockSeconds: remaining,
        description: verificationSummary(official, statistician, venue, comparison),
        sequenceNumber,
        source: STATISTICIAN_SOURCE,
        createdById: session.user.id,
        data: {
          official,
          statistician,
          venue,
          comparison,
          note: input.note?.trim() || null,
        },
      },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SCOREBOARD_VERIFIED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, official, statistician, venue, allMatch: comparison.allMatch },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
  revalidatePath(`/games/${fixtureId}/live`);
}

const startingFiveSchema = z.object({
  seasonClubId: z.string(),
  playerIds: z.array(z.string().min(1)).length(5, "Exactly five starters are required."),
});

// G.16 starting-five capture (Part X). Never auto-selected, never inferred - the operator must
// explicitly choose exactly five rostered players for one team. Re-confirming the same team
// replaces its prior selection (still fully audited both ways) rather than erroring, so a
// pre-tip-off correction doesn't require a support workaround.
export async function confirmStartingFive(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);
  const raw = Object.fromEntries(formData.entries());
  const input = startingFiveSchema.parse({
    seasonClubId: raw.seasonClubId,
    playerIds: formData.getAll("playerIds"),
  });

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);
    const homeId = requireSeasonClubId(game.fixture, "HOME");
    const awayId = requireSeasonClubId(game.fixture, "AWAY");
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }
    const uniqueIds = new Set(input.playerIds);
    if (uniqueIds.size !== 5) throw new Error("DUPLICATE_STARTER");
    const rostered = await tx.player.findMany({ where: { id: { in: [...uniqueIds] }, seasonClubId: input.seasonClubId } });
    if (rostered.length !== 5) throw new Error("STARTER_NOT_ROSTERED");

    await tx.gameStarter.deleteMany({ where: { gameId, seasonClubId: input.seasonClubId } });
    await tx.gameStarter.createMany({
      data: [...uniqueIds].map((playerId) => ({ organizationId, gameId, seasonClubId: input.seasonClubId, playerId, confirmedById: session.user.id })),
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "STARTING_FIVE_CONFIRMED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, seasonClubId: input.seasonClubId, playerIds: [...uniqueIds] },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
}

// Voids the statistician's own most recent ACTIVE event. Never touches scorer-sourced events
// (the two ledgers are undone independently) and never deletes the row - VOIDED events are
// excluded from replayScore, so the reconciliation panel updates correctly without losing
// audit history.
export async function undoLastStatisticianEvent(gameId: string, fixtureId: string) {
  const { session, organizationId } = await requireFixturePermission("game:record-stats", fixtureId);

  await withOrganizationContext(organizationId, async (tx) => {
    await loadMutableGame(tx, organizationId, gameId, fixtureId, session.user.id);

    const last = await tx.gameEvent.findFirst({
      where: { gameId, source: STATISTICIAN_SOURCE, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!last) throw new Error("NO_EVENTS_TO_UNDO");

    await tx.gameEvent.update({
      where: { id: last.id },
      data: { status: "VOIDED", correctedAt: new Date(), correctedById: session.user.id, correctionReason: "OPERATOR_UNDO" },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "STATISTICIAN_EVENT_UNDONE",
      entityType: "GameEvent",
      entityId: last.id,
      details: { fixtureId, gameId, undoneEventType: last.eventType, undoneDescription: last.description },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/stats/live`);
}

async function loadActiveStatisticianEvents(client: Prisma.TransactionClient | typeof prisma, gameId: string): Promise<DerivableEvent[]> {
  return client.gameEvent.findMany({
    where: { gameId, source: STATISTICIAN_SOURCE, status: "ACTIVE" },
    orderBy: { sequenceNumber: "asc" },
    select: { eventType: true, status: true, seasonClubId: true, playerId: true, points: true, basePointValue: true, isUltraTime: true },
  });
}

// Reads the statistician's own ledger and reconciles it against the official Fixture score,
// using the same event-derived engine that materialization uses (Part V: one statistical
// truth, never two independent ways of arriving at "the statistician's score"). Read-only -
// safe to call from a Server Component render.
export async function getGameReconciliation(gameId: string): Promise<GameReconciliation> {
  const session = await requireSession();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  return withOrganizationContext(session.user.organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    const events = await loadActiveStatisticianEvents(tx, gameId);
    const hasStatisticianEvents = events.length > 0;
    const teamStats = deriveTeamStats(derivePlayerStats(events));
    const homeScore = deriveTeamScore(teamStats, game.fixture.homeSeasonClubId!);
    const awayScore = deriveTeamScore(teamStats, game.fixture.awaySeasonClubId!);
    return reconcileGameScore(game.fixture.homeScore, game.fixture.awayScore, homeScore, awayScore, hasStatisticianEvents);
  });
}

export type LiveBoxScore = {
  players: DerivedPlayerStats[];
  teams: { home: DerivedTeamStats; away: DerivedTeamStats };
};

// Live derived box score (Part IX) - a pure READ MODEL over the ACTIVE event ledger, computed
// on every render. Never writes PlayerStat/TeamStat itself; that only happens through the
// audited rebuildGameStatsFromEvents() materialization path below, gated on verification.
export async function getGameLiveBoxScore(gameId: string): Promise<LiveBoxScore> {
  const session = await requireSession();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  return withOrganizationContext(session.user.organizationId, async (tx) => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    const events = await loadActiveStatisticianEvents(tx, gameId);
    const playerStats = derivePlayerStats(events);
    const teamStats = deriveTeamStats(playerStats);
    return {
      players: [...playerStats.values()],
      teams: {
        home: teamStats.get(game.fixture.homeSeasonClubId!) ?? emptyTeamStats(game.fixture.homeSeasonClubId!),
        away: teamStats.get(game.fixture.awaySeasonClubId!) ?? emptyTeamStats(game.fixture.awaySeasonClubId!),
      },
    };
  });
}

// Materializes PlayerStat/TeamStat from the VERIFIED statistician ledger (Part VIII). Every
// player who has ever appeared in this game's statistician events (active or not) gets an
// explicit upsert - including an all-zero row if every one of their events has since been
// voided - so a rebuild is a genuine full snapshot, not an incremental patch that could leave
// stale non-zero data behind after a correction. Deterministic and idempotent: called twice
// against the same ACTIVE event set produces byte-identical PlayerStat/TeamStat rows both times.
async function rebuildGameStatsFromEvents(tx: Prisma.TransactionClient, organizationId: string, gameId: string) {
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
  const [everyPlayer, activeEvents] = await Promise.all([
    tx.gameEvent.findMany({
      where: { gameId, source: STATISTICIAN_SOURCE, playerId: { not: null } },
      distinct: ["playerId"],
      select: { playerId: true, seasonClubId: true },
    }),
    loadActiveStatisticianEvents(tx, gameId),
  ]);

  const derivedPlayers = derivePlayerStats(activeEvents);
  for (const { playerId, seasonClubId } of everyPlayer) {
    if (!playerId || !seasonClubId) continue;
    const p = derivedPlayers.get(playerId) ?? emptyPlayerStats(playerId, seasonClubId);
    await tx.playerStat.upsert({
      where: { gameId_playerId: { gameId, playerId } },
      create: {
        organizationId, gameId, playerId, seasonClubId: p.seasonClubId,
        points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls,
        fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted,
        twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted,
        threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted,
        freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted,
        offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds,
        fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted,
        ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted,
        statSource: "EVENT_DERIVED",
      },
      update: {
        points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls,
        fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted,
        twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted,
        threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted,
        freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted,
        offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds,
        fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted,
        ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted,
        statSource: "EVENT_DERIVED",
      },
    });
  }

  const derivedTeams = deriveTeamStats(derivedPlayers);
  for (const seasonClubId of [game.fixture.homeSeasonClubId!, game.fixture.awaySeasonClubId!]) {
    const t = derivedTeams.get(seasonClubId) ?? emptyTeamStats(seasonClubId);
    await tx.teamStat.upsert({
      where: { gameId_seasonClubId: { gameId, seasonClubId } },
      create: {
        organizationId, gameId, seasonClubId,
        points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls,
        fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor,
        statSource: "EVENT_DERIVED",
      },
      update: {
        points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls,
        fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor,
        statSource: "EVENT_DERIVED",
      },
    });
  }

  return { players: [...derivedPlayers.values()], teams: [...derivedTeams.values()] };
}

const verifySchema = z.object({
  overrideReason: z.string().optional(),
});

// Marks Game.statisticsVerifiedAt/By - a distinct signal from Fixture/Game FINAL status (Part
// XVII). Does not require a MATCHED reconciliation: a MISMATCH can be verified through with an
// explicit override reason, written to AuditLog rather than silently accepted. On success,
// materializes PlayerStat/TeamStat from the verified ledger (Part XVI) - verification is not a
// cosmetic flag, it is the gate that promotes the statistician's ledger into the canonical box
// score.
export async function verifyStatistics(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("result:confirm", fixtureId);
  const input = verifySchema.parse(Object.fromEntries(formData.entries()));

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    const events = await loadActiveStatisticianEvents(tx, gameId);
    const hasStatisticianEvents = events.length > 0;
    if (!hasStatisticianEvents) throw new Error("NO_STATISTICIAN_EVENTS_TO_VERIFY");

    const teamStats = deriveTeamStats(derivePlayerStats(events));
    const homeScore = deriveTeamScore(teamStats, game.fixture.homeSeasonClubId!);
    const awayScore = deriveTeamScore(teamStats, game.fixture.awaySeasonClubId!);
    const reconciliation = reconcileGameScore(game.fixture.homeScore, game.fixture.awayScore, homeScore, awayScore, hasStatisticianEvents);

    if (reconciliation.overallStatus === "MISMATCH" && !input.overrideReason?.trim()) {
      throw new Error("RECONCILIATION_MISMATCH_REQUIRES_OVERRIDE_REASON");
    }

    const materialized = await rebuildGameStatsFromEvents(tx, organizationId, gameId);

    await tx.game.update({
      where: { id: gameId },
      data: { statisticsVerifiedAt: new Date(), statisticsVerifiedById: session.user.id },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "STATISTICS_VERIFIED",
      entityType: "Game",
      entityId: gameId,
      details: {
        fixtureId,
        reconciliationStatus: reconciliation.overallStatus,
        home: reconciliation.home,
        away: reconciliation.away,
        overrideReason: input.overrideReason || null,
        materializedPlayerCount: materialized.players.length,
        materializedTeamCount: materialized.teams.length,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/live`);
}

// --- G.17 Part VII: post-final statistical correction ---

async function loadFinalGameForCorrection(tx: Prisma.TransactionClient, gameId: string, fixtureId: string) {
  await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true, ruleSnapshot: true } });
  if (game.fixtureId !== fixtureId) throw new Error("INVALID_EVENT");
  if (game.fixture.status === "CANCELLED" || game.fixture.status === "POSTPONED") throw new Error("GAME_NOT_MUTABLE");
  // Deliberately the opposite gate from loadMutableGame(): this workflow exists specifically
  // for a FINAL game. A still-live game should use the ordinary undo/void/re-record flow above
  // instead - routing a live correction through here would bypass loadMutableGame's LIVE/PAUSED
  // check for no reason.
  if (game.status !== "FINAL") throw new Error("GAME_NOT_FINAL_USE_LIVE_CORRECTION_INSTEAD");
  return game;
}

const postFinalCorrectionSchema = z.object({
  eventId: z.string().min(1),
  reason: z.string().min(5, "A reason is required."),
  // Present only when replacing the event's value (e.g. a 2PT that should have been a 3PT).
  // Absent when the correction is a pure removal (e.g. "this rebound never happened").
  replacementShotValue: z.coerce.number().int().min(1).max(4).optional(),
  replacementMade: z.enum(["true", "false"]).optional(),
});

// Corrects (or removes) a single statistician event on an already-FINAL game (Part VII, Stage
// 9). Gated behind result:confirm - the same tier that finalizes/verifies, not the everyday
// game:record-stats statistician permission, since altering history after the fact is a bigger
// deal than live entry. The original event is never deleted: it flips to CORRECTED (or VOIDED,
// for a pure-removal correction) and, if a replacement value was supplied, a new ACTIVE event is
// created via supersedesEventId - the exact same non-destructive pattern the live scorer's own
// correctScoreEventAction already uses. Clears any existing statistics verification
// unconditionally, since the materialized PlayerStat/TeamStat snapshot is now stale by
// definition - re-verifying (the existing verifyStatistics(), unchanged) re-derives and
// re-materializes from the corrected ledger. This function deliberately does NOT itself rebuild
// or reconcile: "capture once, verify once, derive everything else" means there is exactly one
// materialization code path, not two.
export async function correctStatisticianEventPostFinal(gameId: string, fixtureId: string, formData: FormData) {
  const { session, organizationId } = await requireFixturePermission("result:confirm", fixtureId);
  const input = postFinalCorrectionSchema.parse(Object.fromEntries(formData.entries()));
  const hasReplacement = input.replacementShotValue !== undefined && input.replacementMade !== undefined;

  await withOrganizationContext(organizationId, async (tx) => {
    const game = await loadFinalGameForCorrection(tx, gameId, fixtureId);

    const original = await tx.gameEvent.findUniqueOrThrow({ where: { id: input.eventId } });
    if (original.gameId !== gameId) throw new Error("INVALID_EVENT");
    if (original.source !== STATISTICIAN_SOURCE) throw new Error("NOT_A_STATISTICIAN_EVENT");
    if (original.status !== "ACTIVE") throw new Error("EVENT_NOT_ACTIVE");

    const verificationBefore = game.statisticsVerifiedAt
      ? { verifiedAt: game.statisticsVerifiedAt.toISOString(), verifiedById: game.statisticsVerifiedById }
      : null;

    let replacementEventId: string | null = null;
    if (hasReplacement) {
      const shot = scoreShot({
        rules: effectiveRuleSnapshot(game.ruleSnapshot),
        shotValue: input.replacementShotValue!,
        gameStatus: "LIVE", // re-evaluated under the ORIGINAL event's own frozen clock context below, not "now"
        currentPeriod: original.period,
        remainingClockSeconds: original.clockSeconds,
      });
      if (!shot.valid) throw new Error(shot.error);
      const made = input.replacementMade === "true";
      const sequenceNumber = game.nextEventSequence;
      await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });
      const eventType = input.replacementShotValue === 1 ? (made ? "FREE_THROW_MADE" : "FREE_THROW_MISSED") : (made ? "SHOT_MADE" : "SHOT_MISSED");
      const replacement = await tx.gameEvent.create({
        data: {
          organizationId, gameId, seasonClubId: original.seasonClubId, playerId: original.playerId, eventType,
          points: made ? shot.pointsAwarded : 0, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made,
          isFourPointAttempt: input.replacementShotValue === 4, isUltraTime: shot.isUltraTime,
          period: original.period, clockSeconds: original.clockSeconds,
          description: `Post-final correction: ${input.reason}`, sequenceNumber,
          source: STATISTICIAN_SOURCE, createdById: session.user.id, supersedesEventId: original.id,
        },
      });
      replacementEventId = replacement.id;
      await tx.gameEvent.update({
        where: { id: original.id },
        data: { status: "CORRECTED", correctedAt: new Date(), correctedById: session.user.id, correctionReason: input.reason },
      });
    } else {
      await tx.gameEvent.update({
        where: { id: original.id },
        data: { status: "VOIDED", correctedAt: new Date(), correctedById: session.user.id, correctionReason: input.reason },
      });
    }

    await tx.game.update({ where: { id: gameId }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "POST_FINAL_STATISTICAL_CORRECTION",
      entityType: "GameEvent",
      entityId: original.id,
      details: {
        fixtureId, gameId,
        originalEventType: original.eventType, originalDescription: original.description,
        replacementEventId, reason: input.reason,
        verificationBefore, verificationAfter: null,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/stats`);
  revalidatePath(`/games/${fixtureId}/live`);
}

// True once any post-final correction has ever been recorded for this game - drives the
// "STATISTICS CORRECTED AFTER FINAL" banner (Part VII, Stage 9). Read-only.
export async function hasPostFinalCorrections(gameId: string): Promise<boolean> {
  const session = await requireSession();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const count = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.auditLog.count({ where: { entityType: "GameEvent", action: "POST_FINAL_STATISTICAL_CORRECTION", details: { path: ["gameId"], equals: gameId } } }),
  );
  return count > 0;
}
