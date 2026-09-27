// Characterization test for the canonical GameEvent create payload. Captures the behavior of the
// flipPossession site (Batch 1) pre-refactor: a statistician "NOTE"/"POSSESSION" event with
// source ULTRA_NATIVE_LIVE_STATISTICIAN, the sequence assigned by the service (not passed in),
// and an absent `data` field remaining SQL NULL.

import { buildGameEventCreateData } from "./build-game-event";
import { ledgerSourceFor } from "./provenance";
import assert from "node:assert/strict";
import test from "node:test";

const flipPossessionFields = {
  gameId: "game-1",
  sequenceNumber: 1,
  eventType: "NOTE",
  typeKey: "POSSESSION",
  period: 2,
  clockSeconds: 420,
  description: "Possession arrow to Home",
  seasonClubId: "season-club-home",
};

test("flipPossession: statistician source is preserved by the mapping + builder", () => {
  const source = ledgerSourceFor("LIVE_UI", "STATISTICIAN");
  assert.equal(source, "ULTRA_NATIVE_LIVE_STATISTICIAN");

  const data = buildGameEventCreateData(flipPossessionFields, {
    organizationId: "org-1",
    actorId: "user-1",
    source,
  });

  assert.equal(data.source, "ULTRA_NATIVE_LIVE_STATISTICIAN");
  assert.equal(data.eventType, "NOTE");
  assert.equal(data.typeKey, "POSSESSION");
  assert.equal(data.createdById, "user-1");
  assert.equal(data.seasonClubId, "season-club-home");
  assert.equal(data.period, 2);
  assert.equal(data.clockSeconds, 420);
});

test("flipPossession: an absent `data` field is omitted, so the column stays SQL NULL", () => {
  const data = buildGameEventCreateData(flipPossessionFields, {
    organizationId: "org-1",
    actorId: "user-1",
    source: "ULTRA_NATIVE_LIVE_STATISTICIAN",
  });
  // Prisma treats `undefined` as "omit the field", which leaves the column at SQL NULL. JSONB-null
  // (Prisma.JsonNull) is a different value and would be a silent divergence from the original site.
  assert.equal(data.data, undefined);
});

test("flipPossession: provenance columns are null when the caller supplies none", () => {
  const data = buildGameEventCreateData(flipPossessionFields, {
    organizationId: "org-1",
    actorId: "user-1",
    source: "ULTRA_NATIVE_LIVE_STATISTICIAN",
  });
  assert.equal(data.deviceId, null);
  assert.equal(data.idempotencyKey, null);
  assert.equal(data.clientUpdatedAt, null);
  assert.equal(data.syncBatchId, null);
});

test("sync-replayed events carry provenance and OFFLINE_SYNC source", () => {
  const data = buildGameEventCreateData({ ...flipPossessionFields, sequenceNumber: 42 }, {
    organizationId: "org-1",
    actorId: "user-1",
    source: "OFFLINE_SYNC",
    provenance: {
      deviceId: "tablet-1",
      idempotencyKey: "key-1",
      clientUpdatedAt: "2026-09-27T10:00:00.000Z",
      syncBatchId: "batch-1",
    },
  });
  assert.equal(data.source, "OFFLINE_SYNC");
  assert.equal(data.deviceId, "tablet-1");
  assert.equal(data.idempotencyKey, "key-1");
  assert.equal((data.clientUpdatedAt as Date).toISOString(), "2026-09-27T10:00:00.000Z");
  assert.equal(data.syncBatchId, "batch-1");
  assert.equal(data.sequenceNumber, 42);
});
