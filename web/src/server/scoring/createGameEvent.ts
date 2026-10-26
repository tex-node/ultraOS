import "server-only";

import { remainingClockSeconds } from "@/lib/game-clock";
import { hasFeedSubscriber, queueScoreChangedFeed, queueWinProbabilityFeed } from "@/lib/data-feed/dispatcher";
import { getSportDefinition } from "@/lib/sports/registry";
import { winProbabilityForGame } from "@/lib/analytics/win-probability-context";
import { ledgerSourceFor } from "@/lib/scoring/provenance";
import { buildGameEventCreateData } from "@/lib/scoring/build-game-event";
import { loadMutableGame } from "./load-mutable-game";
import { assignNextSequence } from "./sequence";
import type { CreateGameEventInput, WriteContext } from "./types";

// The single canonical write path for a GameEvent. Three callers, one function:
//   - the live UI server actions (source: LIVE_UI)
//   - the sync replay endpoint (source: OFFLINE_SYNC, tx supplied, called in a loop)
//   - the vision promotion seam (source: VISION_PROMOTED) â€” B4
//
// The service owns the ENTIRE canonical write:
//   1. Lock Fixture (FOR UPDATE) + load game + assert mutable/active
//   2. Clear verification stamp for statistician writes (with audit log)
//   3. Compute remainingClockSeconds (if not provided)
//   4. Assign sequence number (increment counter, use old value)
//   5. Insert GameEvent with source mapping + provenance columns
//
// `ctx.tx` is REQUIRED: this function never opens its own transaction. The caller owns the
// boundary â€” a single statement for the live UI, or a 100-record atomic batch for sync. The
// service stays idempotency-agnostic; the SyncIdempotency insert lives in the sync endpoint,
// inside the same transaction (see docs/canonical-write-audit.md and the rule-#6 brief).
export async function createGameEvent(
  input: CreateGameEventInput,
  ctx: WriteContext,
): Promise<{ id: string; sequenceNumber: number }> {
  const tx = ctx.tx;

  // 1. Load mutable game (lock + mutable check + verification-stamp clearing)
  const game = await loadMutableGame(
    tx,
    ctx.actor.organizationId,
    input.gameId,
    input.fixtureId,
    ctx.actor.id,
    ctx.source,
    ctx.ledgerSourceHint,
  );

  // 2. Compute clock (use provided value for sync replay, otherwise compute from game state)
  const clockSeconds = input.clockSeconds ?? remainingClockSeconds(game);

  // 3. Assign sequence (increment counter, use old value)
  const sequenceNumber = await assignNextSequence(tx, input.gameId, game.nextEventSequence);

  // 4. Validate seasonClubId if provided
  if (input.seasonClubId) {
    const homeId = game.fixture.homeSeasonClubId;
    const awayId = game.fixture.awaySeasonClubId;
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }
  }

  // 5. Insert
  const created = await tx.gameEvent.create({
    data: buildGameEventCreateData(
      { ...input, clockSeconds, sequenceNumber, period: input.period ?? game.currentPeriod },
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        source: ledgerSourceFor(ctx.source, ctx.ledgerSourceHint),
        provenance: ctx.provenance,
      },
    ),
    select: { id: true, sequenceNumber: true },
  });

  // 6. Partner data feed (streak v5, Prompt 2). An INSERT of one outbox row per interested subscriber, in
  // THIS transaction - no network, no timer. The drain that signs and POSTs runs after commit, so a slow
  // subscriber can never stall the canonical write. Only scoring events are queued here; lifecycle events
  // (GAME_STARTED / GAME_FINAL) are queued by the status transition via queueGameLifecycleFeed.
  // A scoring change is not always a `points` value. Tennis (and any rally-point sport) records every rally with
  // points = 0 - the match score moves in sets and the set score in `tennisPoints` - so keying the feed on points > 0
  // silently emitted nothing for tennis, which the multi-sport stress test caught (4 of 5 sports produced
  // win-probability deliveries; tennis produced none). The condition now also looks at the score before/after and at
  // a tennis point, so every sport that moves a score emits.
  const scoreChanged =
    (input.points ?? 0) > 0 ||
    (input.homeScoreAfter !== undefined &&
      input.awayScoreAfter !== undefined &&
      (input.homeScoreAfter !== (input.homeScoreBefore ?? input.homeScoreAfter) || input.awayScoreAfter !== (input.awayScoreBefore ?? input.awayScoreAfter))) ||
    (input.data as { tennisPoints?: unknown } | null | undefined)?.tennisPoints !== undefined;
  if (scoreChanged) {
    await queueScoreChangedFeed(tx, {
      organizationId: ctx.actor.organizationId,
      gameId: input.gameId,
      event: {
        eventId: created.id,
        sequenceNumber: created.sequenceNumber ?? sequenceNumber,
        period: input.period ?? game.currentPeriod,
        clockSeconds,
        points: input.points ?? null,
        eventType: input.eventType,
        // The drain resolves this to a name when it builds the payload - no join on the scoring path.
        playerId: input.playerId ?? null,
      },
    });

    // Win probability (streak v12, Prompt 2). Emitted HERE rather than in a scoring module, because this is the one
    // canonical write every sport goes through - basketball's dedicated scorer included, which is exactly the sport a
    // sportsbook cares about most and the one a module-level hook would have silently missed.
    if (await hasFeedSubscriber(tx, ctx.actor.organizationId, "WIN_PROBABILITY_UPDATED")) {
      const division = await tx.division.findUnique({
        where: { id: game.fixture.divisionId },
        select: { competition: { select: { sport: { select: { slug: true } } } } },
      });
      const definition = division ? getSportDefinition(division.competition.sport.slug) : null;
      if (definition) {
        const probability = winProbabilityForGame({
          definition,
          status: game.status,
          homeScore: input.homeScoreAfter ?? game.fixture.homeScore,
          awayScore: input.awayScoreAfter ?? game.fixture.awayScore,
          period: input.period ?? game.currentPeriod,
          clockSecondsRemaining: clockSeconds,
        });
        await queueWinProbabilityFeed(tx, {
          organizationId: ctx.actor.organizationId,
          gameId: input.gameId,
          event: {
            eventId: `${input.gameId}:wp:${created.sequenceNumber ?? sequenceNumber}`,
            sequenceNumber: created.sequenceNumber ?? sequenceNumber,
            period: input.period ?? game.currentPeriod,
            clockSeconds,
            points: null,
            eventType: "WIN_PROBABILITY_UPDATED",
            winProbHome: probability.home,
            winProbAway: probability.away,
            method: probability.method,
            confidence: probability.confidence,
            homeScore: input.homeScoreAfter ?? game.fixture.homeScore,
            awayScore: input.awayScoreAfter ?? game.fixture.awayScore,
          },
        });
      }
    }
  }

  return { id: created.id, sequenceNumber: created.sequenceNumber ?? sequenceNumber };
}
