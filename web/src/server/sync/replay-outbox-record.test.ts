import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import { replayOutboxRecord } from "./replay-outbox-record";
import { sortRecordsForProcessing, type OutboxRecord } from "@/lib/sync/outbox-schema";

const ACTOR_ID = "test-actor";

async function seedOrgAndFixture(ctx: TestDbContext) {
  const org = await ctx.prisma.organization.create({ data: { name: "Test Org", slug: "test-org" } });
  const sport = await ctx.prisma.sport.create({ data: { name: "Test Sport", slug: "test-sport" } });
  const competition = await ctx.prisma.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: "C", slug: "c" } });
  const division = await ctx.prisma.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: "D", slug: "d" } });
  const season = await ctx.prisma.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: "S", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
  const venue = await ctx.prisma.venue.create({ data: { organizationId: org.id, name: "V", address: "1 St", city: "City", capacity: 10 } });
  const homeClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Home", shortName: "H" } });
  const awayClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Away", shortName: "A" } });
  const homeSeasonClub = await ctx.prisma.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: homeClub.id, divisionId: division.id } });
  const awaySeasonClub = await ctx.prisma.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: awayClub.id, divisionId: division.id } });
  const athlete = await ctx.prisma.athlete.create({
    data: { organizationId: org.id, firstName: "P", lastName: "One", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" },
  });
  const rosterPlayer = await ctx.prisma.player.create({
    data: { organizationId: org.id, athleteId: athlete.id, seasonId: season.id, seasonClubId: homeSeasonClub.id, position: "G", heightCm: 180, weightKg: 80 },
  });
  const fixture = await ctx.prisma.fixture.create({
    data: {
      organizationId: org.id, seasonId: season.id, divisionId: division.id, venueId: venue.id,
      scheduledAt: new Date("2026-06-01T12:00:00.000Z"),
      homeSeasonClubId: homeSeasonClub.id, awaySeasonClubId: awaySeasonClub.id, status: "LIVE",
    },
  });
  return { org, fixture, homeSeasonClub, rosterPlayer };
}

async function seedGame(ctx: TestDbContext, organizationId: string, fixtureId: string) {
  return ctx.prisma.game.create({ data: { organizationId, fixtureId, status: "LIVE" } });
}

function gameEventRecord(overrides: Partial<OutboxRecord> & { payload: Record<string, unknown> }): OutboxRecord {
  return {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    entityType: "GameEvent",
    operation: "CREATE",
    entityId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    clientUpdatedAt: "2026-09-28T10:00:00.000Z",
    ledgerSourceHint: "SCORER",
    ...overrides,
  } as OutboxRecord;
}

// ================= Test 1: single record end-to-end =================
test("single GameEvent CREATE for an existing game: APPLIED, one GameEvent row (source resolved from hint), one SyncIdempotency row", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer } = await seedOrgAndFixture(ctx);
    const game = await seedGame(ctx, org.id, fixture.id);

    const record = gameEventRecord({
      payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "REBOUND", description: "test rebound", period: 1, clockSeconds: 500 },
    });
    const result = await replayOutboxRecord(record, { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-1", prisma: ctx.prisma });

    assert.equal(result.status, "APPLIED");
    const events = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(events.length, 1);
    assert.equal(events[0].source, "ULTRA_NATIVE_LIVE_SCORER", "SCORER hint under OFFLINE_SYNC must resolve to the same ledger value a live scorer write would get");
    assert.equal(events[0].syncBatchId, "batch-1");

    const idempotencyRows = await ctx.prisma.syncIdempotency.findMany({ where: { idempotencyKey: record.idempotencyKey } });
    assert.equal(idempotencyRows.length, 1);
    assert.equal(idempotencyRows[0].responseStatus, "APPLIED");

    const conflictRows = await ctx.prisma.syncConflictLog.findMany({});
    assert.equal(conflictRows.length, 0, "Commit 3 never writes SyncConflictLog - that's Commit 4's scope");
  } finally {
    await ctx.teardown();
  }
});

// ================= Test 2: mixed batch, partial success =================
test("mixed batch: 4 valid records APPLIED, 1 with a bad gameId FAILED - the good ones still land", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer } = await seedOrgAndFixture(ctx);
    const game = await seedGame(ctx, org.id, fixture.id);
    const ctxArgs = { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-2", prisma: ctx.prisma };

    const records: OutboxRecord[] = [
      gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440001", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43001", payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "REBOUND", description: "r1", period: 1, clockSeconds: 500 } }),
      gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440002", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43002", payload: { gameId: "not-a-real-game", seasonClubId: homeSeasonClub.id, eventType: "STEAL", description: "bad", period: 1, clockSeconds: 490 } }),
      gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440003", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43003", payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "ASSIST", description: "a1", period: 1, clockSeconds: 480 } }),
      gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440004", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43004", payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "STEAL", description: "s1", period: 1, clockSeconds: 470 } }),
      gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440005", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43005", payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "BLOCK", description: "b1", period: 1, clockSeconds: 460 } }),
    ];

    const results = [];
    for (const record of records) results.push(await replayOutboxRecord(record, ctxArgs));

    const statuses = results.map((r) => r.status);
    assert.deepEqual(statuses, ["APPLIED", "FAILED", "APPLIED", "APPLIED", "APPLIED"]);

    const events = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(events.length, 4, "the 4 good records must land even though one failed");
  } finally {
    await ctx.teardown();
  }
});

// ================= Test 3: idempotent replay =================
test("idempotent replay: resubmitting the exact same batch returns DUPLICATE, creates zero new rows", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer } = await seedOrgAndFixture(ctx);
    const game = await seedGame(ctx, org.id, fixture.id);
    const ctxArgs = { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-3", prisma: ctx.prisma };
    const record = gameEventRecord({ payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "FOUL", description: "f1", period: 1, clockSeconds: 500 } });

    const first = await replayOutboxRecord(record, ctxArgs);
    assert.equal(first.status, "APPLIED");
    const countAfterFirst = await ctx.prisma.gameEvent.count({ where: { gameId: game.id } });
    const idempotencyCountAfterFirst = await ctx.prisma.syncIdempotency.count();
    const appliedAtAfterFirst = (await ctx.prisma.syncIdempotency.findUniqueOrThrow({ where: { idempotencyKey: record.idempotencyKey } })).appliedAt;

    const second = await replayOutboxRecord(record, ctxArgs);
    assert.equal(second.status, "DUPLICATE");
    const countAfterSecond = await ctx.prisma.gameEvent.count({ where: { gameId: game.id } });
    const idempotencyCountAfterSecond = await ctx.prisma.syncIdempotency.count();
    const appliedAtAfterSecond = (await ctx.prisma.syncIdempotency.findUniqueOrThrow({ where: { idempotencyKey: record.idempotencyKey } })).appliedAt;

    assert.equal(countAfterSecond, countAfterFirst, "no new GameEvent row on replay");
    assert.equal(idempotencyCountAfterSecond, idempotencyCountAfterFirst, "no new SyncIdempotency row on replay");
    assert.deepEqual(appliedAtAfterSecond, appliedAtAfterFirst, "the existing SyncIdempotency row's appliedAt is untouched");
  } finally {
    await ctx.teardown();
  }
});

// ================= Test 4: crash simulation - the important one =================
test("crash simulation: a real mid-transaction failure rolls back everything, including work that happened before the failure", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub } = await seedOrgAndFixture(ctx);
    const game = await seedGame(ctx, org.id, fixture.id);
    const ctxArgs = { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-4", prisma: ctx.prisma };

    const gameBefore = await ctx.prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    assert.equal(gameBefore.nextEventSequence, 1);

    // playerId references a Player row that does not exist - createGameEvent's internal
    // assignNextSequence (a real tx.game.update, incrementing nextEventSequence) runs and commits
    // its statement BEFORE the final tx.gameEvent.create fails on the playerId foreign-key
    // constraint - real prior work in the same transaction, not a mocked throw.
    const badRecord = gameEventRecord({
      payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: "not-a-real-player", eventType: "STEAL", description: "crash test", period: 1, clockSeconds: 500 },
    });
    const failedResult = await replayOutboxRecord(badRecord, ctxArgs);
    assert.equal(failedResult.status, "FAILED");

    const gameAfterFailure = await ctx.prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    assert.equal(gameAfterFailure.nextEventSequence, 1, "the sequence increment that happened before the FK violation must have been rolled back too - proves transaction atomicity, not just 'the final insert failed'");

    const eventsAfterFailure = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(eventsAfterFailure.length, 0, "no GameEvent row from the failed attempt");

    const idempotencyAfterFailure = await ctx.prisma.syncIdempotency.findUnique({ where: { idempotencyKey: badRecord.idempotencyKey } });
    assert.equal(idempotencyAfterFailure, null, "no SyncIdempotency row was left behind by the rolled-back transaction");

    // Retry the exact same idempotencyKey with a corrected payload - must apply cleanly, not be
    // blocked by any lingering partial state from the failed attempt.
    const athlete = await ctx.prisma.athlete.create({
      data: { organizationId: org.id, firstName: "P", lastName: "Two", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" },
    });
    const rosterPlayer = await ctx.prisma.player.create({
      data: { organizationId: org.id, athleteId: athlete.id, seasonId: fixture.seasonId, seasonClubId: homeSeasonClub.id, position: "G", heightCm: 180, weightKg: 80 },
    });
    const retryRecord = { ...badRecord, payload: { ...(badRecord.payload as Record<string, unknown>), playerId: rosterPlayer.id } };
    const retryResult = await replayOutboxRecord(retryRecord, ctxArgs);
    assert.equal(retryResult.status, "APPLIED", "the retry with the same idempotencyKey must succeed cleanly");

    const eventsAfterRetry = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(eventsAfterRetry.length, 1);
    const gameAfterRetry = await ctx.prisma.game.findUniqueOrThrow({ where: { id: game.id } });
    assert.equal(gameAfterRetry.nextEventSequence, 2, "the sequence counter only advanced once, from the successful retry - not twice, and not zero times");
  } finally {
    await ctx.teardown();
  }
});

// ================= Test 5: cross-record dependency within a batch =================
test("a batch containing Game CREATE followed by a dependent GameEvent CREATE: both APPLIED, the event's gameId matches the created game's id", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer } = await seedOrgAndFixture(ctx);
    const ctxArgs = { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-5", prisma: ctx.prisma };
    const clientGameId = "6ba7b810-9dad-11d1-80b4-00c04fd43010";
    const clientEventId = "6ba7b810-9dad-11d1-80b4-00c04fd43011";

    const gameRecord: OutboxRecord = {
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440010",
      entityType: "Game",
      operation: "CREATE",
      entityId: clientGameId,
      // status: "LIVE" - a realistic offline "start game" payload, matching startGame's
      // live-console equivalent. The default (NOT_STARTED) is correctly rejected by
      // createGameEvent's mutable gate (LIVE/PAUSED only) - this test is about dependency
      // resolution within a batch, not about exercising that gate.
      payload: { fixtureId: fixture.id, status: "LIVE" },
      clientUpdatedAt: "2026-09-28T09:00:00.000Z",
    };
    const eventRecord = gameEventRecord({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440011",
      entityId: clientEventId,
      clientUpdatedAt: "2026-09-28T09:00:01.000Z",
      payload: { gameId: clientGameId, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "REBOUND", description: "dependent event", period: 1, clockSeconds: 500 },
    });

    // Serial, in clientUpdatedAt order - matching what route.ts's sortRecordsForProcessing +
    // for-loop actually do. The Game record's transaction commits before the GameEvent record's
    // transaction opens, so the plain tx.game.findUniqueOrThrow inside replay for the GameEvent
    // finds it via a normal DB lookup - no special in-batch synthesis needed at replay time (only
    // the pre-write authorization check needs that).
    const gameResult = await replayOutboxRecord(gameRecord, ctxArgs);
    const eventResult = await replayOutboxRecord(eventRecord, ctxArgs);

    assert.equal(gameResult.status, "APPLIED");
    assert.equal(eventResult.status, "APPLIED");

    const createdGame = await ctx.prisma.game.findUniqueOrThrow({ where: { id: clientGameId } });
    assert.equal(createdGame.fixtureId, fixture.id);

    const createdEvent = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { id: clientEventId } });
    assert.equal(createdEvent.gameId, clientGameId, "the event's gameId matches the client-supplied id the Game was created with - no server-side id reconciliation needed, since createGame preserves the caller-supplied id");
  } finally {
    await ctx.teardown();
  }
});

// ================= Test 6: ID collision =================
test("ID collision: a second record with a different idempotencyKey but the same entityId FAILS with ID_COLLISION, never overwrites", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer } = await seedOrgAndFixture(ctx);
    const game = await seedGame(ctx, org.id, fixture.id);
    const ctxArgs = { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-6", prisma: ctx.prisma };
    const sharedEntityId = "6ba7b810-9dad-11d1-80b4-00c04fd43099";

    const first = gameEventRecord({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440020",
      entityId: sharedEntityId,
      payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "REBOUND", description: "original", period: 1, clockSeconds: 500 },
    });
    const firstResult = await replayOutboxRecord(first, ctxArgs);
    assert.equal(firstResult.status, "APPLIED");

    // A distinct idempotencyKey means the SyncIdempotency check alone won't catch this - it's the
    // plain `create` (never `upsert`) on GameEvent.id that must reject it.
    const second = gameEventRecord({
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440021",
      entityId: sharedEntityId,
      payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "STEAL", description: "colliding", period: 1, clockSeconds: 490 },
    });
    const secondResult = await replayOutboxRecord(second, ctxArgs);
    assert.equal(secondResult.status, "FAILED");
    assert.equal((secondResult.detail as { code: string }).code, "ID_COLLISION");

    const event = await ctx.prisma.gameEvent.findUniqueOrThrow({ where: { id: sharedEntityId } });
    assert.equal(event.description, "original", "the original row must never be silently overwritten by the colliding second attempt");
  } finally {
    await ctx.teardown();
  }
});

// ================= Test 7: ordering preserved at replay level =================
test("ordering: records processed out of array order still land in clientUpdatedAt order (visible in sequenceNumber assignment)", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer } = await seedOrgAndFixture(ctx);
    const game = await seedGame(ctx, org.id, fixture.id);
    const ctxArgs = { actor: { id: ACTOR_ID, organizationId: org.id }, deviceId: "device-1", syncBatchId: "batch-7", prisma: ctx.prisma };

    // Deliberately out of clientUpdatedAt order in the array itself - route.ts's
    // sortRecordsForProcessing (Commit 2) is what puts them back in order before calling this
    // function one at a time; this test proves that once correctly ordered, processing serially
    // in that order produces the expected sequenceNumber assignment (early event gets sequence 1).
    const early = gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440030", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43030", clientUpdatedAt: "2026-09-28T09:00:00.000Z", payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "REBOUND", description: "early", period: 1, clockSeconds: 500 } });
    const late = gameEventRecord({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440031", entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43031", clientUpdatedAt: "2026-09-28T09:00:05.000Z", payload: { gameId: game.id, seasonClubId: homeSeasonClub.id, playerId: rosterPlayer.id, eventType: "STEAL", description: "late", period: 1, clockSeconds: 495 } });

    const orderedInput = sortRecordsForProcessing([late, early]);
    assert.deepEqual(orderedInput.map((r) => r.entityId), [early.entityId, late.entityId], "sortRecordsForProcessing must put the earlier clientUpdatedAt first regardless of input array order");

    const results = [];
    for (const record of orderedInput) results.push(await replayOutboxRecord(record, ctxArgs));
    assert.deepEqual(results.map((r) => r.status), ["APPLIED", "APPLIED"]);
    assert.deepEqual(results.map((r) => r.idempotencyKey), [early.idempotencyKey, late.idempotencyKey], "results[] is in processed order, matching the sorted input order, not the original (out-of-order) array");

    const earlyEvent = await ctx.prisma.gameEvent.findUniqueOrThrow({ where: { id: early.entityId } });
    const lateEvent = await ctx.prisma.gameEvent.findUniqueOrThrow({ where: { id: late.entityId } });
    assert.ok(earlyEvent.sequenceNumber! < lateEvent.sequenceNumber!, "the event with the earlier clientUpdatedAt got the earlier sequence number, proving it was replayed first");
  } finally {
    await ctx.teardown();
  }
});
