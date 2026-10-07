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

test("id: absent by default, so Prisma's @default(cuid()) generates one - every live-UI site's existing behavior", () => {
  const data = buildGameEventCreateData(flipPossessionFields, {
    organizationId: "org-1",
    actorId: "user-1",
    source: "ULTRA_NATIVE_LIVE_STATISTICIAN",
  });
  assert.equal(data.id, undefined);
});

test("id: a caller-supplied value (sync replay preserving the offline client's own id) is honored, not overridden", () => {
  const data = buildGameEventCreateData(
    { ...flipPossessionFields, id: "client-generated-event-id-1" },
    { organizationId: "org-1", actorId: "user-1", source: "OFFLINE_SYNC" },
  );
  assert.equal(data.id, "client-generated-event-id-1");
});

test("sync-replayed statistician events keep the statistician ledger value; syncBatchId is the transport signal", () => {
  const source = ledgerSourceFor("OFFLINE_SYNC", "STATISTICIAN");
  assert.equal(source, "ULTRA_NATIVE_LIVE_STATISTICIAN");

  const data = buildGameEventCreateData({ ...flipPossessionFields, sequenceNumber: 42 }, {
    organizationId: "org-1",
    actorId: "user-1",
    source,
    provenance: {
      deviceId: "tablet-1",
      idempotencyKey: "key-1",
      clientUpdatedAt: "2026-09-27T10:00:00.000Z",
      syncBatchId: "batch-1",
    },
  });
  // source stays the statistician ledger value - identical to a live write - so this row is still
  // visible to loadActiveStatisticianEvents/rebuildGameStatsFromEvents/correctStatisticianEvent.
  // syncBatchId, not source, is what marks it as having arrived via sync.
  assert.equal(data.source, "ULTRA_NATIVE_LIVE_STATISTICIAN");
  assert.equal(data.deviceId, "tablet-1");
  assert.equal(data.idempotencyKey, "key-1");
  assert.equal((data.clientUpdatedAt as Date).toISOString(), "2026-09-27T10:00:00.000Z");
  assert.equal(data.syncBatchId, "batch-1");
  assert.equal(data.sequenceNumber, 42);
});

test("resolvedBy: defaults to SERVER, clientObservedAt to null, for every existing call site", () => {
  const data = buildGameEventCreateData(flipPossessionFields, {
    organizationId: "org-1",
    actorId: "user-1",
    source: "ULTRA_NATIVE_LIVE_STATISTICIAN",
  });
  assert.equal(data.resolvedBy, "SERVER");
  assert.equal(data.clientObservedAt, null);
});

test("resolvedBy: CLIENT and clientObservedAt are honored when the offline scoring-tap replay path supplies them", () => {
  const data = buildGameEventCreateData(
    { ...flipPossessionFields, resolvedBy: "CLIENT", clientObservedAt: "2026-09-28T20:00:00.000Z" },
    { organizationId: "org-1", actorId: "user-1", source: "OFFLINE_SYNC" },
  );
  assert.equal(data.resolvedBy, "CLIENT");
  assert.equal((data.clientObservedAt as Date).toISOString(), "2026-09-28T20:00:00.000Z");
});
