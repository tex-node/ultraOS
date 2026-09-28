import { processOutboxBatch } from "./process-outbox-batch";
import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxRecord } from "./outbox-schema";

class FakeAuthorizationError extends Error {}
const isFake = (e: unknown): e is FakeAuthorizationError => e instanceof FakeAuthorizationError;

function record(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    entityType: "GameEvent",
    operation: "CREATE",
    entityId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    payload: { gameId: "game-1" },
    clientUpdatedAt: "2026-09-28T10:00:00.000Z",
    ledgerSourceHint: "SCORER",
    ...overrides,
  } as OutboxRecord;
}

test("empty batch: authorized true, empty results, no dependency ever called", async () => {
  let replayCalls = 0;
  const outcome = await processOutboxBatch([], {
    resolveFixtureIds: async () => {
      throw new Error("must not be called for an empty batch");
    },
    checkFixturePermission: async () => {
      throw new Error("must not be called for an empty batch");
    },
    isAuthorizationError: isFake,
    replay: async () => {
      replayCalls++;
      return { idempotencyKey: "x", status: "APPLIED" };
    },
  });
  assert.deepEqual(outcome, { authorized: true, results: [] });
  assert.equal(replayCalls, 0);
});

// This is the specific proof the review asked for: "auth rejection aborts the whole batch,
// verified by zero rows created, not just the rejection response." replay is the only dependency
// that ever writes anything (in production, it's replayOutboxRecord, which does the real DB
// writes) - a replay call count of zero is equivalent to zero GameEvent/SyncIdempotency rows,
// proven without needing a real database to assert row counts against.
test("auth rejection: replay is called for ZERO records - not the failing one, not any other one in the batch", async () => {
  const replayedIds: string[] = [];
  const records = [
    record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440001", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43001" }),
    record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440002", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43002" }),
    record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440003", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43003" }),
  ];

  const outcome = await processOutboxBatch(records, {
    resolveFixtureIds: async () => new Set(["fixture-a", "fixture-bad", "fixture-c"]),
    checkFixturePermission: async (fixtureId) => {
      if (fixtureId === "fixture-bad") throw new FakeAuthorizationError("no access to fixture-bad");
    },
    isAuthorizationError: isFake,
    replay: async (record) => {
      replayedIds.push(record.idempotencyKey);
      return { idempotencyKey: record.idempotencyKey, status: "APPLIED" };
    },
  });

  assert.equal(outcome.authorized, false);
  if (!outcome.authorized) assert.equal(outcome.message, "no access to fixture-bad");
  assert.deepEqual(replayedIds, [], "replay must be called zero times - not for the good records, not for any record - when any fixture in the batch is unauthorized");
});

test("all fixtures authorized: replay is called once per record, in processed (sorted) order", async () => {
  const replayedIds: string[] = [];
  const early = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440010", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43010", clientUpdatedAt: "2026-09-28T09:00:00.000Z" });
  const late = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440011", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43011", clientUpdatedAt: "2026-09-28T09:00:05.000Z" });

  const outcome = await processOutboxBatch([late, early], {
    resolveFixtureIds: async () => new Set(["fixture-a"]),
    checkFixturePermission: async () => {},
    isAuthorizationError: isFake,
    replay: async (record) => {
      replayedIds.push(record.idempotencyKey);
      return { idempotencyKey: record.idempotencyKey, status: "APPLIED" };
    },
  });

  assert.equal(outcome.authorized, true);
  assert.deepEqual(replayedIds, [early.idempotencyKey, late.idempotencyKey], "replayed in clientUpdatedAt order, not the input array's (out-of-order) order");
  if (outcome.authorized) {
    assert.deepEqual(outcome.results.map((r) => r.idempotencyKey), [early.idempotencyKey, late.idempotencyKey], "results[] matches processed order too");
  }
});
