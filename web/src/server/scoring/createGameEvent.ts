import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ledgerSourceFor } from "@/lib/scoring/provenance";
import type { CreateGameEventInput, WriteContext } from "./types";

// Maps the transport-level EventSource to the canonical GameEvent.source (StatDataSource) ledger
// value. The pure mapping is shared with the client (src/lib/scoring/provenance.ts) so the value
// never depends on which caller invoked the service.
function ledgerSource(ctx: WriteContext): Prisma.GameEventCreateInput["source"] {
  return ledgerSourceFor(ctx.source, ctx.ledgerSourceHint);
}

// Outcomes the service distinguishes for callers. Kept as a reason string (not a throw for the
// ordinary "game not mutable" case) so the sync endpoint can map it to a per-record FAILED result
// without exception handling, while live callers can still throw on it.
export class GameNotMutableError extends Error {
  constructor(message = "GAME_NOT_MUTABLE") {
    super(message);
    this.name = "GameNotMutableError";
  }
}

export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`GAME_NOT_FOUND:${gameId}`);
    this.name = "GameNotFoundError";
  }
}

function assertGameIsMutable(status: string) {
  if (status === "FINAL" || status === "CANCELLED" || status === "POSTPONED") {
    throw new GameNotMutableError();
  }
}

// The single canonical write path for a GameEvent. Three callers, one function:
//   - the live UI server actions (source: LIVE_UI)
//   - the sync replay endpoint (source: OFFLINE_SYNC, tx supplied, called in a loop)
//   - the vision promotion seam (source: VISION_PROMOTED) — B4
//
// `ctx.tx` is REQUIRED here: this function never opens its own transaction. The caller owns the
// boundary — a single statement for the live UI, or a 100-record atomic batch for sync. The
// service stays idempotency-agnostic; the SyncIdempotency insert lives in the sync endpoint,
// inside the same transaction (see docs/canonical-write-audit.md and the rule-#6 brief).
export async function createGameEvent(
  input: CreateGameEventInput,
  ctx: WriteContext,
): Promise<{ id: string; sequenceNumber: number }> {
  const tx = ctx.tx;
  if (!tx) throw new Error("createGameEvent requires ctx.tx (caller owns the transaction)");

  const game = await tx.game.findUnique({
    where: { id: input.gameId },
    select: { id: true, status: true, nextEventSequence: true },
  });
  if (!game) throw new GameNotFoundError(input.gameId);
  assertGameIsMutable(game.status);

  const sequenceNumber = input.sequenceNumber ?? game.nextEventSequence;
  const advanceSequence = input.advanceSequence ?? input.sequenceNumber == null;
  if (advanceSequence) {
    await tx.game.update({
      where: { id: input.gameId },
      data: { nextEventSequence: { increment: 1 } },
    });
  }

  const created = await tx.gameEvent.create({
    data: {
      organizationId: ctx.actor.organizationId,
      gameId: input.gameId,
      sequenceNumber,
      seasonClubId: input.seasonClubId ?? null,
      entrantId: input.entrantId ?? null,
      playerId: input.playerId ?? null,
      fouledPlayerId: input.fouledPlayerId ?? null,
      foulType: (input.foulType as Prisma.GameEventCreateInput["foulType"]) ?? null,
      causedByEventId: input.causedByEventId ?? null,
      eventType: input.eventType as Prisma.GameEventCreateInput["eventType"],
      typeKey: input.typeKey ?? null,
      data: input.data ?? Prisma.JsonNull,
      points: input.points ?? null,
      basePointValue: input.basePointValue ?? null,
      multiplier: input.multiplier ?? null,
      made: input.made ?? null,
      isFourPointAttempt: input.isFourPointAttempt ?? false,
      isUltraTime: input.isUltraTime ?? false,
      assistedByPlayerId: input.assistedByPlayerId ?? null,
      substitutedOutPlayerId: input.substitutedOutPlayerId ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      courtZone: input.courtZone ?? null,
      homeScoreBefore: input.homeScoreBefore ?? null,
      awayScoreBefore: input.awayScoreBefore ?? null,
      homeScoreAfter: input.homeScoreAfter ?? null,
      awayScoreAfter: input.awayScoreAfter ?? null,
      supersedesEventId: input.supersedesEventId ?? null,
      period: input.period,
      clockSeconds: input.clockSeconds,
      description: input.description,
      source: ledgerSource(ctx),
      createdById: ctx.actor.id,
      // Provenance columns (null on LIVE_UI unless the caller supplies them). See the A3 tagging
      // scheme: source is immutable; the three timestamps stay distinct (domain time = period/
      // clockSeconds, clientUpdatedAt = device, createdAt = serverReceipt).
      deviceId: ctx.provenance?.deviceId ?? null,
      idempotencyKey: ctx.provenance?.idempotencyKey ?? null,
      clientUpdatedAt: ctx.provenance?.clientUpdatedAt ? new Date(ctx.provenance.clientUpdatedAt) : null,
      syncBatchId: ctx.provenance?.syncBatchId ?? null,
    },
    select: { id: true, sequenceNumber: true },
  });

  return { id: created.id, sequenceNumber: created.sequenceNumber ?? sequenceNumber };
}
