import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { queueGameLifecycleFeed, queueWinProbabilityFeed } from "@/lib/data-feed/dispatcher";
import { winProbabilityForGame } from "@/lib/analytics/win-probability-context";
import { getSportDefinition } from "@/lib/sports/registry";
import { applyRuleValues, parseRuleConfig, type RuleValue } from "@/lib/sports/rule-values";
import { resolveSeasonRuleValues } from "@/lib/sports/rule-set-store";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { replayTennisGamePoints } from "@/lib/sports/tennis-scoring";
import { remainingClockSeconds } from "@/lib/game-clock";
import { isLegalDelivery } from "@/lib/sports/innings-scoring";
import { createGameEvent } from "./createGameEvent";
import { advanceKnockoutBracket } from "@/lib/sports/knockout-bracket";
import { recalculateStandings } from "@/lib/standings-recalculate";

// One delivery, applied to the ledger (streak v6, Prompt 2).
//
// This is the body of `recordScoringEvent` without the Next.js wrapper (auth, revalidatePath). Extracted so
// the console action and the verification script drive the SAME code: module resolution, tennis point replay,
// fixture score, per-period score, the ledger event, period advance, finalisation (GAME_ENDED, winner,
// knockout advance, standings), partner GAME_FINAL and the audit row.
//
// The alternative - a script that reimplements these steps - would verify a copy, not the product.

export type ScoringGamePayload = Prisma.GameGetPayload<{
  include: {
    fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } };
    periodScores: true;
    ruleSnapshot: true;
    events: { select: { period: true; typeKey: true; seasonClubId: true; entrantId: true; sequenceNumber: true } };
  };
}>;

export type ScoringDeliveryInput = {
  seasonClubId: string;
  typeKey?: string;
  runs?: number;
  points?: number;
  playerId?: string;
  description?: string;
};

export type ScoringDeliveryResult = {
  moduleKey: string;
  typeKey: string;
  homeScore: number;
  awayScore: number;
  finalized: boolean;
  tennisPoints?: { home: number; away: number };
};

/**
 * The rule values in force for this game, in precedence order: the frozen snapshot, then the season rule set
 * (which itself falls back to an organization override and then the definition).
 */
async function resolveGameRuleValues(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  game: ScoringGamePayload;
  definition: ReturnType<typeof getSportDefinition> & object;
}): Promise<Record<string, RuleValue>> {
  const frozen = args.game.ruleSnapshot?.ruleValues;
  if (frozen && typeof frozen === "object") {
    try {
      return parseRuleConfig(frozen);
    } catch {
      // A malformed snapshot must not stop a live game; fall through to the season rule set.
    }
  }
  const resolved = await resolveSeasonRuleValues(args.tx, {
    organizationId: args.organizationId,
    seasonId: args.game.fixture.seasonId,
    sportId: args.game.fixture.division.competition.sport.id,
    definition: args.definition,
  });
  return resolved.values;
}

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

export async function applyScoringDelivery(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actorId: string;
  fixtureId: string;
  game: ScoringGamePayload;
  input: ScoringDeliveryInput;
}): Promise<ScoringDeliveryResult> {
  const { tx, organizationId, actorId, fixtureId, game, input } = args;
  const gameId = game.id;

  const definition = getSportDefinition(game.fixture.division.competition.sport.slug);
  if (!definition) throw new Error("UNKNOWN_SPORT");
  // Rule-set resolution (streak v7, Prompt 1). The scoring modules read their config from the DEFINITION, so
  // a season RuleSet could never turn a best-of-5 into a best-of-3 - the row was stored and ignored.
  // Precedence: the game's FROZEN snapshot (a played game must stay explicable after a rule change), then
  // the season/organization rule set, then the definition default.
  const effectiveDefinition = applyRuleValues(definition, await resolveGameRuleValues({ tx, organizationId, game, definition }));
  const scoringModule = resolveScoringModule(effectiveDefinition);
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

  // Tennis: replay this set's point events to recover the current game's point counts. The ledger is the
  // source of truth, so the console and the server can never disagree about whether it is deuce.
  let tennisPoints: { home: number; away: number } | undefined;
  if (scoringModule.kind === "TENNIS") {
    tennisPoints = replayTennisGamePoints(game.events, game.currentPeriod, {
      entrantId: game.fixture.homeEntrantId,
      seasonClubId: game.fixture.homeSeasonClubId,
    });
  }

  const result = scoringModule.apply(effectiveDefinition, {
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
  await tx.fixture.update({ where: { id: fixtureId }, data: { homeScore: result.homeScore, awayScore: result.awayScore } });

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
      data: { sportKey: effectiveDefinition.key, module: scoringModule.key, note: result.note, tennisPoints: result.tennisPoints },
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
    { actor: { id: actorId, organizationId }, source: "LIVE_UI", tx },
  );

  if (result.nextPeriod) {
    await tx.game.update({ where: { id: gameId }, data: { currentPeriod: result.nextPeriod } });
  }

  // Win probability (streak v12, Prompt 2). Queued after every scoring change, in the same transaction as the score
  // itself, so a partner never receives a probability that precedes the score it describes. The model is named in the
  // payload and the number is clamped away from 0/1 while the game is live.
  const nextPeriodNumber = result.nextPeriod ?? result.period?.period ?? game.currentPeriod;
  const probability = winProbabilityForGame({
    definition: effectiveDefinition,
    status: result.finalize ? "FINAL" : game.status,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    period: nextPeriodNumber,
    clockSecondsRemaining: remainingClockSeconds(game),
    currentPoints: result.tennisPoints ?? null,
  });
  await queueWinProbabilityFeed(tx, {
    organizationId,
    gameId,
    event: {
      eventId: `${gameId}:wp`,
      sequenceNumber: game.nextEventSequence,
      period: nextPeriodNumber,
      clockSeconds: remainingClockSeconds(game),
      points: null,
      eventType: "WIN_PROBABILITY_UPDATED",
      winProbHome: probability.home,
      winProbAway: probability.away,
      method: probability.method,
      confidence: probability.confidence,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    },
  });

  if (result.finalize) {
    const winnerSeasonClubId =
      result.finalizeWinner === "HOME" ? game.fixture.homeSeasonClubId : result.finalizeWinner === "AWAY" ? game.fixture.awaySeasonClubId : null;
    const winnerEntrantId =
      result.finalizeWinner === "HOME" ? game.fixture.homeEntrantId : result.finalizeWinner === "AWAY" ? game.fixture.awayEntrantId : null;
    // GAME_ENDED must be created before the FINAL flips below (terminal event ordering, see
    // docs/canonical-write-audit.md): createGameEvent's mutable-game gate rejects a FINAL game and
    // read-your-own-writes within this transaction would already see the flip.
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
      { actor: { id: actorId, organizationId }, source: "LIVE_UI", tx },
    );
    await tx.fixture.update({ where: { id: fixtureId }, data: { status: "FINAL", winnerSeasonClubId, winnerEntrantId } });
    await tx.game.update({ where: { id: gameId }, data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null, isUltraTimeActive: false } });
    await queueGameLifecycleFeed(tx, {
      organizationId,
      gameId,
      eventType: "GAME_FINAL",
      event: { eventId: gameId, sequenceNumber: game.nextEventSequence, period: result.period?.period ?? game.currentPeriod, clockSeconds: 0, points: null, eventType: "GAME_FINAL" },
    });
    await advanceKnockoutBracket(tx, organizationId, game.fixture);
    await recalculateStandings(tx, organizationId, game.fixture.seasonId);
  }

  await writeAuditLog(tx, {
    organizationId,
    userId: actorId,
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

  return {
    moduleKey: scoringModule.key,
    typeKey: result.typeKey,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    finalized: result.finalize,
    tennisPoints: result.tennisPoints,
  };
}
