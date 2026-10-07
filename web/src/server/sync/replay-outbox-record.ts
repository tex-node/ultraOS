import "server-only";

import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { createGame, createGameEvent } from "@/server/scoring";
import { isSupportedReplayOperation, type OutboxRecord, type SyncOutboxRecordResult } from "@/lib/sync/outbox-schema";
import { effectiveRuleSnapshot } from "@/lib/ultra-scoring-engine";
import { isClientObservedAtPlausible, validateClientResolvedShot } from "@/lib/scoring/validate-client-shot";

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
  // A4 (offline scoring tap): present only when the offline scorer console asserted this shot's
  // multiplier/isUltraTime itself (a wall-clock-derived fact the server cannot re-resolve - see
  // docs/canonical-write-audit.md). Absent for every other GameEvent replay, matching today's
  // behavior exactly.
  clientObservedAt: z.string().datetime().optional(),
});

// Structured, not a bare string: a client parsing FAILED results needs to distinguish "your id
// collided with an existing row" from "the game you referenced doesn't exist" from "this payload
// is malformed" programmatically, not by matching English text. ID_COLLISION specifically:
// createGame/createGameEvent always do a plain `create`, never an `upsert` - a caller-supplied id
// that already belongs to a different row hits Postgres's own unique-constraint violation (P2002)
// rather than silently overwriting it.
//
// This function only ever sees a P2002 on one of the two unique constraints the Game/GameEvent
// create calls can hit: the entity table's own id (ID_COLLISION), or Game.fixtureId
// (FIXTURE_ALREADY_HAS_GAME, below) - never SyncIdempotency.idempotencyKey, which the claim step
// above resolves via createMany/skipDuplicates (a row count, never an exception) specifically so
// this function's own P2002 handling doesn't have to disambiguate three cases instead of two.
//
// FIXTURE_ALREADY_HAS_GAME: two devices both offline-created a Game for the same fixture, with two
// different (non-colliding) client-generated ids. Game.fixtureId is @unique, so the second
// device's create fails there, not on `id` - labeling it ID_COLLISION would be actively wrong (the
// ids never collided) and would hide the real, diagnosable cause. What the client does in response
// (discover the winning gameId, rewrite its queued GameEvents to reference it, drop its own
// Game:CREATE from the outbox, re-drain) is a client-side state-machine change this project hasn't
// built yet, plus a response-shape addition (the winning gameId isn't returned today) - not merely
// a product decision about silent-merge-vs-prompt sitting on top of an otherwise-ready mechanism.
// See docs/canonical-write-audit.md.
//
// FIXME: both matchers below key on error.message text, not error.meta - confirmed empirically
// (not assumed) that this driver-adapter build of Prisma does not populate the classic
// meta.target for P2002 at all; the real constraint name lives nested under
// meta.driverAdapterError.cause.constraint.fields, an adapter-internal shape with no documented
// stability guarantee, so message text was the more stable signal available. Verified against
// @prisma/client 7.8.0 + @prisma/adapter-pg 7.8.0 (package.json) by triggering both real
// collisions against staging Postgres and reading the actual error. Re-verify both messages
// on any Prisma major-version bump or driver-adapter change - if the format changes, the fallback
// below (UNKNOWN_CONSTRAINT_VIOLATION) is what stops a silent regression back to a misdiagnosed
// ID_COLLISION, but the specific-code branches will stop firing until this is updated.
const KNOWN_P2002_CONSTRAINTS: ReadonlyArray<{ code: string; message: string; matchesMessage: (message: string) => boolean }> = [
  {
    code: "FIXTURE_ALREADY_HAS_GAME",
    message: "This fixture already has a Game - another device likely started it first.",
    // Loose substring match: Postgres quotes a mixed-case identifier, so the real message embeds
    // `"fixtureId"` (with literal embedded double-quotes) inside backticks - matching the bare
    // "fixtureid" substring case-insensitively sidesteps that quoting rather than reproducing it.
    matchesMessage: (message) => message.toLowerCase().includes("fixtureid"),
  },
  {
    code: "ID_COLLISION",
    message: "An entity with this id already exists.",
    // Exact bracketed match, not a loose substring: "fixtureid" (above) itself contains "id" as a
    // substring, so a loose check here would also match a fixtureId collision. Postgres does not
    // quote an already-lowercase identifier, so a genuine primary-key collision's message names it
    // as the bare, unquoted `id` - checked as that exact backtick-wrapped field reference.
    matchesMessage: (message) => message.includes("`id`"),
  },
];

function classifyUniqueConstraintViolation(error: Prisma.PrismaClientKnownRequestError): { code: string; message: string } {
  const known = KNOWN_P2002_CONSTRAINTS.find((constraint) => constraint.matchesMessage(error.message));
  if (known) return { code: known.code, message: known.message };
  // Loud, not a silent misdiagnosis: an unrecognized P2002 must never quietly default to
  // ID_COLLISION (the exact bug FIXTURE_ALREADY_HAS_GAME was added to fix) just because it wasn't
  // the fixtureId case. This is also the production signal that the message-format assumption
  // above has broken and needs re-verifying.
  return { code: "UNKNOWN_CONSTRAINT_VIOLATION", message: error.message };
}

// Thrown, not returned directly, from inside a validation branch that runs after the
// SyncIdempotency claim has already been inserted (the claim happens first, atomically, before any
// canonical write - see the claim step's own comment below). Returning a FAILED result directly
// from inside ctx.prisma.$transaction's callback would let the transaction COMMIT normally (a
// returned value means success to Prisma, only a throw rolls back) - leaving the claim row
// persisted for a write that never happened, exactly the orphaned-claim bug the claim-then-write
// ordering exists to prevent. Throwing here routes through the same catch/errorDetail path every
// other mid-transaction failure already uses, so the whole transaction (claim included) rolls back.
class ReplayValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function errorDetail(error: unknown): { code: string; message: string } {
  if (error instanceof ReplayValidationError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { code: "INVALID_PAYLOAD", message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return classifyUniqueConstraintViolation(error);
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
// Atomicity: if the canonical write throws after the idempotency row has already been claimed,
// the whole transaction (claim included) rolls back - no SyncIdempotency row is left behind for a
// write that didn't happen. A retry of the same record sees no claimed key and tries again
// cleanly, rather than being permanently blocked by a partial commit.
export async function replayOutboxRecord(record: OutboxRecord, ctx: ReplayContext): Promise<SyncOutboxRecordResult> {
  // Checked before opening a transaction at all - a doomed record shouldn't cost a DB round trip.
  // The accepted vocabulary (outbox-schema.ts's supportedReplayOperationSchema) is narrower than
  // the wire format's operation: CREATE|UPDATE|DELETE: only Game:CREATE and GameEvent:CREATE have
  // both a real client producer and a real replay implementation today. Rejecting per-record here
  // (not at the batch's wire-format validation) means one client with a stale/buggy producer never
  // blocks every other record in its batch.
  if (!isSupportedReplayOperation(record)) {
    return {
      idempotencyKey: record.idempotencyKey,
      status: "FAILED",
      detail: { code: "UNSUPPORTED_OPERATION", message: `${record.entityType}.${record.operation} has no replay implementation.` },
    };
  }
  // Defense-in-depth, not redundant with the wire schema's superRefine: that check runs in
  // route.ts, one hop upstream of this function, and this function is also called directly by
  // this project's own test suite (bypassing wire validation entirely) - so it is reachable with
  // no hint attached today, not just hypothetically. Without this guard, ledgerSourceFor's
  // undefined-hint branch for OFFLINE_SYNC does not throw - it silently returns the bare
  // "OFFLINE_SYNC" ledger value, and (per that function's own comment) a statistician event that
  // lost its hint this way becomes invisible to the live box score and uncorrectable. Silent wrong
  // output is worse than a rejected record, so this fails loudly instead.
  if (record.entityType === "GameEvent" && !record.ledgerSourceHint) {
    return {
      idempotencyKey: record.idempotencyKey,
      status: "FAILED",
      detail: { code: "MISSING_LEDGER_SOURCE_HINT", message: "GameEvent records must carry ledgerSourceHint - it determines which console's ledger the replayed event belongs to." },
    };
  }
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      // Claim the idempotency key FIRST, atomically, before touching any entity table - and via
      // skipDuplicates specifically, not a separate findUnique-then-create, so that a genuine
      // concurrent resubmission of this exact record (same idempotencyKey, raced) is resolved by
      // *this* insert rather than by racing both transactions into the entity table's own create.
      // Postgres's ON CONFLICT DO NOTHING makes the loser of that race a no-op (count: 0) instead
      // of a thrown error, which is what keeps this case distinguishable from a genuine id
      // collision - see errorDetail's comment on why that distinction has to live here, not in
      // catch-and-inspect logic after the fact.
      const claim = await tx.syncIdempotency.createMany({
        data: [
          {
            organizationId: ctx.actor.organizationId,
            idempotencyKey: record.idempotencyKey,
            entityType: record.entityType,
            entityId: record.entityId,
            deviceId: ctx.deviceId,
            requestPayload: record.payload === undefined ? undefined : (record.payload as Prisma.InputJsonValue),
            responseStatus: "APPLIED",
          },
        ],
        skipDuplicates: true,
      });
      if (claim.count === 0) {
        return { idempotencyKey: record.idempotencyKey, status: "DUPLICATE" as const };
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
        // ruleSnapshot is only needed for the client-resolved-shot validation branch below, but
        // selecting it unconditionally is cheap and keeps this one lookup shared by both paths.
        const game = await tx.game.findUniqueOrThrow({
          where: { id: payload.gameId },
          select: {
            fixtureId: true,
            ruleSnapshot: {
              select: {
                fourPointEnabled: true,
                fourPointBaseValue: true,
                ultraTimeEnabled: true,
                ultraTimeMultiplier: true,
                ultraTimeStartRemainingSeconds: true,
                ultraTimeAppliesFinalPeriodOnly: true,
                periodCount: true,
              },
            },
          },
        });

        let resolvedBy: "SERVER" | "CLIENT" = "SERVER";
        if (payload.clientObservedAt) {
          // The offline scorer console asserted this shot's multiplier/isUltraTime itself - see
          // validate-client-shot.ts's own header comment for why the server validates rather than
          // re-resolves. Two independent checks, either of which fails the record (not the batch):
          // the observation timestamp is plausible, and the asserted values are internally
          // consistent and legal under this game's rules.
          if (!isClientObservedAtPlausible(payload.clientObservedAt)) {
            throw new ReplayValidationError("IMPLAUSIBLE_CLIENT_OBSERVATION", "clientObservedAt is too old or too far in the future to be trusted.");
          }
          const shotValidation = validateClientResolvedShot(
            {
              basePointValue: payload.basePointValue ?? 0,
              multiplier: payload.multiplier ?? 1,
              points: payload.points ?? 0,
              isUltraTime: payload.isUltraTime ?? false,
            },
            effectiveRuleSnapshot(game.ruleSnapshot),
          );
          if (!shotValidation.valid) {
            throw new ReplayValidationError(shotValidation.error, "The offline console's asserted shot resolution failed server-side validation.");
          }
          resolvedBy = "CLIENT";
        }

        await createGameEvent(
          // id: the offline client's own client-generated id, preserved rather than replaced by
          // a new server-generated one - a later record (in this batch or a future one)
          // referencing this event via causedByEventId/supersedesEventId uses that same id.
          { ...payload, id: record.entityId, gameId: payload.gameId, fixtureId: game.fixtureId, resolvedBy, clientObservedAt: payload.clientObservedAt },
          { actor: ctx.actor, source: "OFFLINE_SYNC", ledgerSourceHint: record.ledgerSourceHint, provenance, tx },
        );
      }

      return { idempotencyKey: record.idempotencyKey, status: "APPLIED" as const };
    });
  } catch (error) {
    return { idempotencyKey: record.idempotencyKey, status: "FAILED", detail: errorDetail(error) };
  }
}
