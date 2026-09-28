import "server-only";

import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { createGame, createGameEvent } from "@/server/scoring";
import type { OutboxRecord, SyncOutboxRecordResult } from "@/lib/sync/outbox-schema";

export interface ReplayContext {
  actor: { id: string; organizationId: string };
  deviceId: string;
  syncBatchId: string;
  // The client to open this record's own transaction on - injected, not imported as a hardcoded
  // singleton, the same "caller owns the transaction boundary" rule every other canonical service
  // in this codebase follows (createGameEvent, withGameWrite, ...). Caught by this function's own
  // tests: a first version imported the global `prisma` singleton directly, which made it silently
  // ignore an isolated test schema's scoped client and query the wrong database entirely - every
  // test failed with "no record found" for rows that definitely existed, just in a different
  // schema than the one this function was actually querying.
  prisma: PrismaClient;
}

// Only CREATE is implemented: it's the only operation the current offline client
// (LocalScoringRepository) ever enqueues for Game or GameEvent - both createGame and logEvent
// enqueue "CREATE" unconditionally. UPDATE/DELETE are part of the wire contract for forward
// compatibility (see OutboxEntityType), but have no producer yet and no defined replay semantics -
// failing them explicitly is honest about current scope, not a gap to silently paper over.
const gameCreatePayloadSchema = z.object({
  fixtureId: z.string().min(1),
  status: z.enum(["NOT_STARTED", "LIVE", "PAUSED", "FINAL"]).optional(),
  currentPeriod: z.number().int().optional(),
  clockSecondsRemaining: z.number().int().optional(),
  shotClockSecondsRemaining: z.number().int().optional(),
});

const gameEventCreatePayloadSchema = z.object({
  gameId: z.string().min(1),
  eventType: z.string().min(1),
  description: z.string(),
  period: z.number().int().optional(),
  clockSeconds: z.number().int().optional(),
  seasonClubId: z.string().nullable().optional(),
  entrantId: z.string().nullable().optional(),
  playerId: z.string().nullable().optional(),
  fouledPlayerId: z.string().nullable().optional(),
  foulType: z.string().nullable().optional(),
  causedByEventId: z.string().nullable().optional(),
  typeKey: z.string().nullable().optional(),
  points: z.number().nullable().optional(),
  basePointValue: z.number().nullable().optional(),
  multiplier: z.number().nullable().optional(),
  made: z.boolean().nullable().optional(),
  isFourPointAttempt: z.boolean().optional(),
  isUltraTime: z.boolean().optional(),
  assistedByPlayerId: z.string().nullable().optional(),
  substitutedOutPlayerId: z.string().nullable().optional(),
  homeScoreBefore: z.number().nullable().optional(),
  awayScoreBefore: z.number().nullable().optional(),
  homeScoreAfter: z.number().nullable().optional(),
  awayScoreAfter: z.number().nullable().optional(),
});

// Structured, not a bare string: a client parsing FAILED results needs to distinguish "your id
// collided with an existing row" from "the game you referenced doesn't exist" from "this payload
// is malformed" programmatically, not by matching English text. ID_COLLISION specifically:
// createGame/createGameEvent always do a plain `create`, never an `upsert` - a caller-supplied id
// that already belongs to a different row hits Postgres's own unique-constraint violation (P2002)
// rather than silently overwriting it. This also covers the id-vs-idempotencyKey mismatch case (two
// records with different idempotencyKeys claiming the same entityId): the SyncIdempotency check
// only keys on idempotencyKey, so both would pass it, but the second one's create then collides on
// id - the same protection, not a separate code path.
function errorDetail(error: unknown): { code: string; message: string } {
  if (error instanceof z.ZodError) return { code: "INVALID_PAYLOAD", message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { code: "ID_COLLISION", message: "An entity with this id already exists." };
    if (error.code === "P2003" || error.code === "P2025") return { code: "REFERENCED_ENTITY_NOT_FOUND", message: error.message };
    return { code: `PRISMA_${error.code}`, message: error.message };
  }
  if (error instanceof Error) return { code: "UNKNOWN", message: error.message };
  return { code: "UNKNOWN", message: String(error) };
}

// The core of A3b: per-record idempotency check + canonical-write replay, one Postgres
// transaction per record (not one for the whole batch - see docs/canonical-write-audit.md's
// Point 6 for why). Serial iteration over an already-ordered batch (route.ts sorts by
// clientUpdatedAt before calling this) means a GameEvent's dependent Game, if created earlier in
// the same batch, has already committed by the time this record's own transaction opens - a
// plain DB lookup resolves fixtureId from gameId here, no in-batch synthesis needed (that's only
// required pre-write, in the authorization check, before anything has been created yet).
//
// Atomicity: if the canonical write throws after the idempotency check has already found no
// existing key, the whole transaction (idempotency check included) rolls back - no SyncIdempotency
// row is left behind for a write that didn't happen. A retry of the same record sees no key and
// tries again cleanly, rather than being permanently blocked by a partial commit.
export async function replayOutboxRecord(record: OutboxRecord, ctx: ReplayContext): Promise<SyncOutboxRecordResult> {
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      const existing = await tx.syncIdempotency.findUnique({ where: { idempotencyKey: record.idempotencyKey } });
      if (existing) {
        return { idempotencyKey: record.idempotencyKey, status: "DUPLICATE" as const };
      }

      if (record.operation !== "CREATE") {
        throw new Error(`UNSUPPORTED_OPERATION: ${record.entityType}.${record.operation} has no replay implementation yet.`);
      }

      const provenance = {
        deviceId: ctx.deviceId,
        idempotencyKey: record.idempotencyKey,
        clientUpdatedAt: record.clientUpdatedAt,
        syncBatchId: ctx.syncBatchId,
      };

      if (record.entityType === "Game") {
        const payload = gameCreatePayloadSchema.parse(record.payload);
        await createGame(
          { id: record.entityId, ...payload },
          { actor: ctx.actor, source: "OFFLINE_SYNC", provenance, tx },
        );
      } else {
        const payload = gameEventCreatePayloadSchema.parse(record.payload);
        // The wire payload carries gameId, not fixtureId (LocalGameEvent's own shape has no
        // fixtureId field) - resolved here via a plain lookup, which succeeds because a dependent
        // Game.CREATE earlier in this same serially-processed batch has already committed by now.
        const game = await tx.game.findUniqueOrThrow({ where: { id: payload.gameId }, select: { fixtureId: true } });
        await createGameEvent(
          // id: the offline client's own client-generated id, preserved rather than replaced by
          // a new server-generated one - a later record (in this batch or a future one)
          // referencing this event via causedByEventId/supersedesEventId uses that same id.
          { ...payload, id: record.entityId, gameId: payload.gameId, fixtureId: game.fixtureId },
          { actor: ctx.actor, source: "OFFLINE_SYNC", ledgerSourceHint: record.ledgerSourceHint, provenance, tx },
        );
      }

      await tx.syncIdempotency.create({
        data: {
          organizationId: ctx.actor.organizationId,
          idempotencyKey: record.idempotencyKey,
          entityType: record.entityType,
          entityId: record.entityId,
          deviceId: ctx.deviceId,
          requestPayload: record.payload === undefined ? undefined : (record.payload as Prisma.InputJsonValue),
          responseStatus: "APPLIED",
        },
      });

      return { idempotencyKey: record.idempotencyKey, status: "APPLIED" as const };
    });
  } catch (error) {
    return { idempotencyKey: record.idempotencyKey, status: "FAILED", detail: errorDetail(error) };
  }
}
