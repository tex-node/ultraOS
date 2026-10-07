import { MAX_BATCH_SIZE, isSupportedReplayOperation, sortRecordsForProcessing, syncOutboxRequestSchema } from "./outbox-schema";
import assert from "node:assert/strict";
import test from "node:test";

function record(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    entityType: "GameEvent",
    operation: "CREATE",
    entityId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    payload: { gameId: "game-1" },
    clientUpdatedAt: "2026-09-28T10:00:00.000Z",
    ledgerSourceHint: "SCORER",
    ...overrides,
  };
}

test("contract shape: ledgerSourceHint is required for GameEvent records", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ ledgerSourceHint: undefined })],
  });
  assert.equal(result.success, false);
});

test("contract shape: ledgerSourceHint is NOT required for Game records (no scorer/statistician distinction)", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ entityType: "Game", ledgerSourceHint: undefined, payload: { fixtureId: "fixture-1" } })],
  });
  assert.equal(result.success, true);
});

test("contract shape: a well-formed request with one record parses successfully", () => {
  const result = syncOutboxRequestSchema.safeParse({ deviceId: "device-1", records: [record()] });
  assert.equal(result.success, true);
});

test("contract shape: entityType is restricted to Game | GameEvent, matching OutboxEntityType", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ entityType: "PlayerStat" })],
  });
  assert.equal(result.success, false);
});

test("contract shape: operation is restricted to CREATE | UPDATE | DELETE", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ operation: "UPSERT" })],
  });
  assert.equal(result.success, false);
});

test("contract shape: idempotencyKey must be a valid UUID, not an arbitrary string", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ idempotencyKey: "not-a-uuid" })],
  });
  assert.equal(result.success, false);
});

test("contract shape: clientUpdatedAt must be ISO 8601, not an arbitrary string", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ clientUpdatedAt: "not-a-date" })],
  });
  assert.equal(result.success, false);
});

test("empty batch: zero records is a valid request, not a validation error", () => {
  const result = syncOutboxRequestSchema.safeParse({ deviceId: "device-1", records: [] });
  assert.equal(result.success, true);
});

test("batch size limit: exactly MAX_BATCH_SIZE records is valid", () => {
  const records = Array.from({ length: MAX_BATCH_SIZE }, (_, i) => record({ idempotencyKey: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, "0")}` }));
  const result = syncOutboxRequestSchema.safeParse({ deviceId: "device-1", records });
  assert.equal(result.success, true);
});

test("batch size limit: MAX_BATCH_SIZE + 1 records is rejected", () => {
  const records = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => record({ idempotencyKey: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, "0")}` }));
  const result = syncOutboxRequestSchema.safeParse({ deviceId: "device-1", records });
  assert.equal(result.success, false);
});

test("contract shape: entityId must be a valid UUID, matching crypto.randomUUID() - the same generator idempotencyKey already uses", () => {
  const result = syncOutboxRequestSchema.safeParse({
    deviceId: "device-1",
    records: [record({ entityId: "not-a-uuid" })],
  });
  assert.equal(result.success, false);
});

test("ordering: records are sorted by clientUpdatedAt ascending, regardless of input array order", () => {
  const early = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440001", entityId: "early", clientUpdatedAt: "2026-09-28T09:00:00.000Z" });
  const late = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440002", entityId: "late", clientUpdatedAt: "2026-09-28T11:00:00.000Z" });
  const middle = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440003", entityId: "middle", clientUpdatedAt: "2026-09-28T10:00:00.000Z" });

  const sorted = sortRecordsForProcessing([late, early, middle] as never[]);
  assert.deepEqual(sorted.map((r) => (r as { entityId: string }).entityId), ["early", "middle", "late"]);
});

test("ordering: identical clientUpdatedAt breaks the tie by idempotencyKey ascending", () => {
  const sameTime = "2026-09-28T10:00:00.000Z";
  const b = record({ idempotencyKey: "b0000000-0000-0000-0000-000000000000", entityId: "b", clientUpdatedAt: sameTime });
  const a = record({ idempotencyKey: "a0000000-0000-0000-0000-000000000000", entityId: "a", clientUpdatedAt: sameTime });

  const sorted = sortRecordsForProcessing([b, a] as never[]);
  assert.deepEqual(sorted.map((r) => (r as { entityId: string }).entityId), ["a", "b"]);
});

test("ordering: numeric timestamp comparison is correct even with differing fractional-second precision", () => {
  const withMillis = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440004", entityId: "with-millis", clientUpdatedAt: "2026-09-28T10:00:00.500Z" });
  const withoutMillis = record({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440005", entityId: "without-millis", clientUpdatedAt: "2026-09-28T10:00:00Z" });

  // Lexicographic comparison of these two strings would put "without-millis" (shorter, no
  // fractional part) in the wrong position relative to some intermediate timestamps; numeric
  // comparison of parsed Date values does not have this problem.
  const sorted = sortRecordsForProcessing([withMillis, withoutMillis] as never[]);
  assert.deepEqual(sorted.map((r) => (r as { entityId: string }).entityId), ["without-millis", "with-millis"]);
});

// ================= replay vocabulary: narrower than the wire format =================
// The wire format (operation: CREATE|UPDATE|DELETE) is forward-compatible on purpose - see the
// tests above. isSupportedReplayOperation is the separate, narrower gate replayOutboxRecord
// actually enforces: only the two combinations with a real producer and a real replay
// implementation today.

test("isSupportedReplayOperation: Game CREATE is supported", () => {
  assert.equal(isSupportedReplayOperation({ entityType: "Game", operation: "CREATE" }), true);
});

test("isSupportedReplayOperation: GameEvent CREATE is supported", () => {
  assert.equal(isSupportedReplayOperation({ entityType: "GameEvent", operation: "CREATE" }), true);
});

test("isSupportedReplayOperation: Game UPDATE is not supported - no producer, no defined conflict-resolution shape", () => {
  assert.equal(isSupportedReplayOperation({ entityType: "Game", operation: "UPDATE" }), false);
});

test("isSupportedReplayOperation: GameEvent UPDATE is not supported", () => {
  assert.equal(isSupportedReplayOperation({ entityType: "GameEvent", operation: "UPDATE" }), false);
});

test("isSupportedReplayOperation: DELETE is not supported for either entity type", () => {
  assert.equal(isSupportedReplayOperation({ entityType: "Game", operation: "DELETE" }), false);
  assert.equal(isSupportedReplayOperation({ entityType: "GameEvent", operation: "DELETE" }), false);
});
