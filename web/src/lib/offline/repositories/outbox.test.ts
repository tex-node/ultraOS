import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import test from "node:test";
import { OfflineScoringDatabase } from "../db";
import { DEAD_LETTER_ATTEMPT_THRESHOLD, MANUAL_RETRY_COOLDOWN_MS, deadLetterCount, drain, enqueue, markFailed, markSynced, pendingCount, readPendingBatch, retryDeadLetteredRecords } from "../outbox";

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

test("readPendingBatch returns pending records ordered by clientUpdatedAt and honors batchSize", async () => {
  const db = freshDb();
  await enqueue({ entityType: "Game", entityId: "g-late", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-03T00:00:00.000Z" }, db);
  await enqueue({ entityType: "Game", entityId: "g-early", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-01T00:00:00.000Z" }, db);
  await enqueue({ entityType: "Game", entityId: "g-mid", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-02T00:00:00.000Z" }, db);

  const batch = await readPendingBatch(2, db);
  assert.deepEqual(
    batch.map((r) => r.entityId),
    ["g-early", "g-mid"],
  );
  assert.equal(batch.length, 2);
});

test("readPendingBatch excludes synced records but keeps failed ones eligible for retry", async () => {
  const db = freshDb();
  const syncedId = await enqueue({ entityType: "Game", entityId: "s", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const failedId = await enqueue({ entityType: "Game", entityId: "f", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await enqueue({ entityType: "Game", entityId: "p", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await markSynced([syncedId], db);
  await markFailed(failedId, "VALIDATION_ERROR", db);

  // A failed record is still "pending" - dead-lettering it permanently is A4's job (a real
  // attemptCount threshold), not this filter's. Only syncedAt excludes a record here.
  const batch = await readPendingBatch(10, db);
  assert.deepEqual(new Set(batch.map((r) => r.entityId)), new Set(["f", "p"]));
  assert.equal(await pendingCount(db), 2);
});

test("markSynced stamps syncedAt and removes the record from the pending set", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "p1", operation: "UPDATE", payload: {}, deviceId: "d" }, db);
  await markSynced([id], db);
  const record = await db.outbox.get(id);
  assert.ok(record?.syncedAt);
  assert.equal(await pendingCount(db), 0);
});

test("markFailed records the reason but the record stays pending for a later retry", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "GameEvent", entityId: "e1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await markFailed(id, "SCHEMA_REJECTED", db);
  const record = await db.outbox.get(id);
  assert.equal(record?.failureReason, "SCHEMA_REJECTED");
  assert.equal(await pendingCount(db), 1, "a failure alone must not remove the record from the pending set - only a real dead-letter cutoff (A4) should");
});

test("markFailed increments attemptCount on every call, starting from 0 at enqueue", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "GameEvent", entityId: "e1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  assert.equal((await db.outbox.get(id))?.attemptCount, 0, "a freshly enqueued record has made zero attempts");

  await markFailed(id, "FIRST_FAILURE", db);
  assert.equal((await db.outbox.get(id))?.attemptCount, 1);

  await markFailed(id, "SECOND_FAILURE", db);
  assert.equal((await db.outbox.get(id))?.attemptCount, 2, "a repeated failure on the same record keeps incrementing, not resetting");
});

// ================= drain(): the network-syncing orchestrator =================

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

test("drain with an empty outbox returns attempted:0 and never calls fetch", async () => {
  const db = freshDb();
  let fetchCalls = 0;
  const result = await drain("device-1", { db, fetchFn: async () => { fetchCalls++; return fakeResponse(200, { results: [] }); } });
  assert.deepEqual(result, { ok: true, attempted: 0, applied: 0, duplicate: 0, failed: 0, conflict: 0 });
  assert.equal(fetchCalls, 0, "an empty outbox has nothing to POST");
});

test("drain matches results by idempotencyKey, not array index - marks the right record synced even when the server's result order differs from the request order", async () => {
  const db = freshDb();
  const idA = await enqueue({ entityType: "Game", entityId: "ga", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-01T00:00:00.000Z" }, db);
  const idB = await enqueue({ entityType: "Game", entityId: "gb", operation: "CREATE", payload: {}, deviceId: "d", clientUpdatedAt: "2026-01-02T00:00:00.000Z" }, db);
  const [recA, recB] = [await db.outbox.get(idA), await db.outbox.get(idB)];

  const result = await drain("device-1", {
    db,
    fetchFn: async () =>
      // Server returns B's result first, A's second - the reverse of clientUpdatedAt order this
      // client submitted in - proving drain() can't be matching by array position.
      fakeResponse(200, {
        results: [
          { idempotencyKey: recB!.idempotencyKey, status: "APPLIED" },
          { idempotencyKey: recA!.idempotencyKey, status: "DUPLICATE" },
        ],
      }),
  });

  assert.deepEqual(result, { ok: true, attempted: 2, applied: 1, duplicate: 1, failed: 0, conflict: 0 });
  assert.ok((await db.outbox.get(idA))?.syncedAt, "record A (DUPLICATE) must be marked synced");
  assert.ok((await db.outbox.get(idB))?.syncedAt, "record B (APPLIED) must be marked synced");
});

test("drain marks synced only for APPLIED/DUPLICATE; FAILED and CONFLICT stay pending with attemptCount incremented", async () => {
  const db = freshDb();
  const idApplied = await enqueue({ entityType: "Game", entityId: "g1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const idDuplicate = await enqueue({ entityType: "Game", entityId: "g2", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const idFailed = await enqueue({ entityType: "Game", entityId: "g3", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const idConflict = await enqueue({ entityType: "Game", entityId: "g4", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const records = await Promise.all([idApplied, idDuplicate, idFailed, idConflict].map((id) => db.outbox.get(id)));
  const [rApplied, rDuplicate, rFailed, rConflict] = records;

  const result = await drain("device-1", {
    db,
    fetchFn: async () =>
      fakeResponse(200, {
        results: [
          { idempotencyKey: rApplied!.idempotencyKey, status: "APPLIED" },
          { idempotencyKey: rDuplicate!.idempotencyKey, status: "DUPLICATE" },
          { idempotencyKey: rFailed!.idempotencyKey, status: "FAILED", detail: { code: "INVALID_PAYLOAD" } },
          { idempotencyKey: rConflict!.idempotencyKey, status: "CONFLICT" },
        ],
      }),
  });

  assert.deepEqual(result, { ok: true, attempted: 4, applied: 1, duplicate: 1, failed: 1, conflict: 1 });
  assert.ok((await db.outbox.get(idApplied))?.syncedAt);
  assert.ok((await db.outbox.get(idDuplicate))?.syncedAt);
  assert.equal((await db.outbox.get(idFailed))?.syncedAt, null, "FAILED must not be marked synced");
  assert.equal((await db.outbox.get(idFailed))?.attemptCount, 1);
  assert.equal((await db.outbox.get(idConflict))?.syncedAt, null, "CONFLICT must not be marked synced");
  assert.equal((await db.outbox.get(idConflict))?.attemptCount, 1);
  assert.equal(await pendingCount(db), 2, "the FAILED and CONFLICT records remain pending for a later drain");
});

test("drain's in-flight guard: a second concurrent call is a no-op, not a second POST", async () => {
  const db = freshDb();
  await enqueue({ entityType: "Game", entityId: "g1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  let fetchCalls = 0;
  let resolveFetch!: () => void;
  const gate = new Promise<void>((resolve) => { resolveFetch = resolve; });

  const first = drain("device-1", {
    db,
    fetchFn: async () => {
      fetchCalls++;
      await gate;
      return fakeResponse(200, { results: [] });
    },
  });
  // Called before the first drain's single fetch has resolved - synchronous re-entrancy, the case
  // the module-level flag exists for.
  const second = await drain("device-1", { db, fetchFn: async () => { fetchCalls++; return fakeResponse(200, { results: [] }); } });
  assert.deepEqual(second, { ok: false, reason: "ALREADY_DRAINING" });

  resolveFetch();
  await first;
  assert.equal(fetchCalls, 1, "the second call must never have reached fetch");
});

test("drain on a non-ok response leaves the outbox untouched and reports the status", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "g1", operation: "CREATE", payload: {}, deviceId: "d" }, db);

  const result = await drain("device-1", { db, fetchFn: async () => fakeResponse(403, { error: "not authorized" }) });

  assert.deepEqual(result, { ok: false, reason: "REQUEST_FAILED", status: 403 });
  const record = await db.outbox.get(id);
  assert.equal(record?.syncedAt, null, "a whole-batch rejection is not this record's fault");
  assert.equal(record?.attemptCount, 0, "attemptCount must not be bumped for a batch-level rejection");
});

// ================= A4 PR 2: dead-letter after DEAD_LETTER_ATTEMPT_THRESHOLD failures =================

function alwaysFailingFetch(): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(init!.body as string) as { records: Array<{ idempotencyKey: string }> };
    return fakeResponse(200, {
      results: body.records.map((r) => ({ idempotencyKey: r.idempotencyKey, status: "FAILED", detail: { code: "REFERENCED_ENTITY_NOT_FOUND" } })),
    });
  }) as typeof fetch;
}

test("a record that always fails is dead-lettered after DEAD_LETTER_ATTEMPT_THRESHOLD attempts, and a sixth drain() does not even try it again", async () => {
  assert.equal(DEAD_LETTER_ATTEMPT_THRESHOLD, 5, "this test's own attempt counting below assumes 5 - update alongside the constant if it ever changes");
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "bad-fk", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const fetchFn = alwaysFailingFetch();
  let fetchCallCount = 0;
  const countingFetchFn: typeof fetch = async (...args) => { fetchCallCount++; return fetchFn(...args); };

  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = await drain("device-1", { db, fetchFn: countingFetchFn });
    assert.deepEqual(result, { ok: true, attempted: 1, applied: 0, duplicate: 0, failed: 1, conflict: 0 }, `attempt ${attempt}`);
    const record = await db.outbox.get(id);
    assert.equal(record?.attemptCount, attempt);
    assert.equal(record?.deadLetteredAt, null, `must not be dead-lettered before attempt ${DEAD_LETTER_ATTEMPT_THRESHOLD}`);
  }

  // The 5th failure crosses the threshold.
  const fifthResult = await drain("device-1", { db, fetchFn: countingFetchFn });
  assert.deepEqual(fifthResult, { ok: true, attempted: 1, applied: 0, duplicate: 0, failed: 1, conflict: 0 });
  const afterFifth = await db.outbox.get(id);
  assert.equal(afterFifth?.attemptCount, 5);
  assert.ok(afterFifth?.deadLetteredAt, "dead-lettered exactly at the threshold");

  assert.equal(fetchCallCount, 5, "sanity check: exactly 5 fetch calls so far, one per attempt");

  // A 6th drain() must not even include the dead-lettered record in its batch - readPendingBatch
  // excludes it, so fetch is never called again for it (an empty outbox short-circuits before fetch).
  const sixthResult = await drain("device-1", { db, fetchFn: countingFetchFn });
  assert.deepEqual(sixthResult, { ok: true, attempted: 0, applied: 0, duplicate: 0, failed: 0, conflict: 0 });
  assert.equal(fetchCallCount, 5, "the 6th drain() must not have called fetch again - the record is no longer offered for retry");
  assert.equal(await pendingCount(db), 0, "a dead-lettered record is not counted as pending");
  assert.equal(await deadLetterCount(db), 1);
});

test("retryDeadLetteredRecords resets attemptCount and deadLetteredAt, making the record retryable again", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "bad-fk", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const fetchFn = alwaysFailingFetch();

  for (let attempt = 1; attempt <= DEAD_LETTER_ATTEMPT_THRESHOLD; attempt++) {
    await drain("device-1", { db, fetchFn });
  }
  assert.equal(await deadLetterCount(db), 1);
  assert.equal(await pendingCount(db), 0);

  const resetCount = await retryDeadLetteredRecords(db);
  assert.equal(resetCount, 1);

  const record = await db.outbox.get(id);
  assert.equal(record?.attemptCount, 0, "attemptCount resets, not just deadLetteredAt - a fresh run of 5 attempts before dead-lettering again");
  assert.equal(record?.deadLetteredAt, null);
  assert.equal(record?.failureReason, null);
  assert.equal(await deadLetterCount(db), 0);
  assert.equal(await pendingCount(db), 1, "the record is offered to the next drain() again");

  // And a subsequent drain() actually attempts it again (proving the reset isn't just a DB-field
  // change with no effect on what readPendingBatch offers).
  let fetchCallCount = 0;
  const countingFetchFn: typeof fetch = async (...args) => { fetchCallCount++; return fetchFn(...args); };
  await drain("device-1", { db, fetchFn: countingFetchFn });
  assert.equal(fetchCallCount, 1);
  assert.equal((await db.outbox.get(id))?.attemptCount, 1, "counting resumes from 0, not from where it left off before the reset");
});

test("retryDeadLetteredRecords is a no-op (returns 0) when nothing is dead-lettered", async () => {
  const db = freshDb();
  await enqueue({ entityType: "Game", entityId: "g1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  assert.equal(await retryDeadLetteredRecords(db), 0);
});

test("retryDeadLetteredRecords stamps lastManualRetryAt and skips a record retried within the cooldown window - stopping a permanent failure from burning another 5 attempts on every repeated click", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "bad-fk", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await db.outbox.update(id, { attemptCount: DEAD_LETTER_ATTEMPT_THRESHOLD, deadLetteredAt: new Date().toISOString() });

  const firstResetCount = await retryDeadLetteredRecords(db);
  assert.equal(firstResetCount, 1);
  const afterFirstRetry = await db.outbox.get(id);
  assert.equal(afterFirstRetry?.attemptCount, 0);
  assert.equal(afterFirstRetry?.deadLetteredAt, null);
  assert.ok(afterFirstRetry?.lastManualRetryAt, "the reset must stamp when it happened");

  // Simulate the record failing 5 more times immediately (a genuinely permanent failure) and the
  // scorekeeper clicking Retry again right away, well inside the cooldown window.
  await db.outbox.update(id, { attemptCount: DEAD_LETTER_ATTEMPT_THRESHOLD, deadLetteredAt: new Date().toISOString() });
  const secondResetCount = await retryDeadLetteredRecords(db);
  assert.equal(secondResetCount, 0, "a record retried within the cooldown window must not be reset again");
  const afterSecondAttempt = await db.outbox.get(id);
  assert.equal(afterSecondAttempt?.attemptCount, DEAD_LETTER_ATTEMPT_THRESHOLD, "attemptCount must be untouched - the reset was skipped, not partially applied");
  assert.ok(afterSecondAttempt?.deadLetteredAt, "still dead-lettered - the cooldown guard means the click did nothing this time, not that it silently succeeded");
});

test("retryDeadLetteredRecords resets again once the cooldown window has passed", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "bad-fk", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  const longAgo = new Date(Date.now() - MANUAL_RETRY_COOLDOWN_MS - 1000).toISOString();
  await db.outbox.update(id, { attemptCount: DEAD_LETTER_ATTEMPT_THRESHOLD, deadLetteredAt: new Date().toISOString(), lastManualRetryAt: longAgo });

  const resetCount = await retryDeadLetteredRecords(db);
  assert.equal(resetCount, 1, "a retry from before the cooldown window must be eligible again");
  const record = await db.outbox.get(id);
  assert.equal(record?.attemptCount, 0);
  assert.equal(record?.deadLetteredAt, null);
});

test("a record that fails a couple of times before eventually succeeding has its failure history fully cleared, not just syncedAt set", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "g1", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await markFailed(id, "TRANSIENT_ERROR", db);
  await markFailed(id, "TRANSIENT_ERROR_AGAIN", db);
  const beforeSync = await db.outbox.get(id);
  assert.equal(beforeSync?.attemptCount, 2);
  assert.equal(beforeSync?.failureReason, "TRANSIENT_ERROR_AGAIN");

  await markSynced([id], db);

  const record = await db.outbox.get(id);
  assert.ok(record?.syncedAt);
  assert.equal(record?.attemptCount, 0, "a synced record must not still show a stale attempt count from before it succeeded");
  assert.equal(record?.failureReason, null, "a synced record must not still show a stale error message from before it succeeded");
  assert.equal(record?.deadLetteredAt, null);
});

test("a dead-lettered record that is manually retried and then succeeds is fully clean - not visible as both synced and dead-lettered", async () => {
  const db = freshDb();
  const id = await enqueue({ entityType: "Game", entityId: "bad-fk", operation: "CREATE", payload: {}, deviceId: "d" }, db);
  await db.outbox.update(id, { attemptCount: DEAD_LETTER_ATTEMPT_THRESHOLD, deadLetteredAt: new Date().toISOString() });

  await retryDeadLetteredRecords(db);
  await markSynced([id], db);

  const record = await db.outbox.get(id);
  assert.ok(record?.syncedAt);
  assert.equal(record?.deadLetteredAt, null);
  assert.equal(record?.attemptCount, 0);
  assert.equal(record?.failureReason, null);
  assert.equal(await deadLetterCount(db), 0, "must not still be counted as dead-lettered");
  assert.equal(await pendingCount(db), 0, "must not still be counted as pending");
});
