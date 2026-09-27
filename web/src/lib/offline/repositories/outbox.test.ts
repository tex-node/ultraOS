import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import test from "node:test";
import { OfflineScoringDatabase } from "../db";
import { drain, enqueue, markFailed, markSynced, pendingCount } from "../outbox";

let counter = 0;
const freshDb = () => new OfflineScoringDatabase(`ultra-offline-test-${counter++}`);

test("enqueue writes one record with a generated idempotency key and pending syncedAt", async () => {
  const db = freshDb();
  const localId = await enqueue(
    { entityType: "Game", entityId: "g1", operation: "CREATE", payload: { a: 1 }, deviceId: "dev-1" },
    db,
  );
  const record = await db.outbox.get(localId);
  assert.equal(record?.entityType, "Game");
  assert.equal(record?.entityId, "g1");
  assert.equal(record?.operation, "CREATE");
  assert.equal(record?.deviceId, "dev-1");
  assert.ok(record?.idempotencyKey);
  assert.equal(record?.syncedAt, null);
  assert.equal(await pendingCount(db), 1);
});

test("enqueue generates a unique idempotency key per call", async () => {
  const db = freshDb();
  const a = await enqueue({ entityType: "GameEvent", entityId: "e1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const b = await enqueue({ entityType: "GameEvent", entityId: "e2", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const [ra, rb] = [await db.outbox.get(a), await db.outbox.get(b)];
  assert.notEqual(ra?.idempotencyKey, rb?.idempotencyKey);
});

test("drain returns pending records ordered by clientUpdatedAt and honors batchSize", async () => {
  const db = freshDb();
  await enqueue({ entityType: "Game", entityId: "g-late", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-03T00:00:00.000Z" }, db);
  await enqueue({ entityType: "Game", entityId: "g-early", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-01T00:00:00.000Z" }, db);
  await enqueue({ entityType: "Game", entityId: "g-mid", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-02T00:00:00.000Z" }, db);

  const batch = await drain(2, db);
  assert.deepEqual(
    batch.map((r) => r.entityId),
    ["g-early", "g-mid"],
  );
  assert.equal(batch.length, 2);
});

test("drain excludes already-synced and failed records", async () => {
  const db = freshDb();
  const syncedId = await enqueue({ entityType: "Game", entityId: "s", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const failedId = await enqueue({ entityType: "Game", entityId: "f", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await enqueue({ entityType: "Game", entityId: "p", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await markSynced([syncedId], db);
  await markFailed(failedId, "VALIDATION_ERROR", db);

  const batch = await drain(10, db);
  assert.deepEqual(batch.map((r) => r.entityId), ["p"]);
  assert.equal(await pendingCount(db), 1);
});

test("markSynced stamps syncedAt and removes the record from the pending set", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "PlayerStat", entityId: "p1", operation: "UPDATE", payload: {}, deviceId: "d" }, db);
  await markSynced([id], db);
  const record = await db.outbox.get(id);
  assert.ok(record?.syncedAt);
  assert.equal(await pendingCount(db), 0);
});

test("markFailed records the reason and removes the record from the pending set", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "GameEvent", entityId: "e1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await markFailed(id, "SCHEMA_REJECTED", db);
  const record = await db.outbox.get(id);
  assert.equal(record?.failureReason, "SCHEMA_REJECTED");
  assert.equal(await pendingCount(db), 0);
});
