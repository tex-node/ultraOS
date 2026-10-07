import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import { syncOutboxRequestSchema } from "@/lib/sync/outbox-schema";
import { processOutboxBatch } from "@/lib/sync/process-outbox-batch";
import { replayOutboxRecord } from "./replay-outbox-record";
import { drain, pendingCount } from "@/lib/offline/outbox";
import { OfflineScoringDatabase } from "@/lib/offline/db";
import { LocalScoringRepository } from "@/lib/offline/repositories/scoringRepository";

// End-to-end rehearsal: a real offline client (fake-indexeddb, no browser) enqueues real outbox
// records, drain() POSTs them, and the request lands on the real server-side orchestration
// (processOutboxBatch -> replayOutboxRecord) against a real, isolated Postgres schema. Only the
// transport (HTTP), Next.js request parsing, and session/auth are stubbed - the same "substitute an
// explicit actor for a session-derived one, bypass the browser" pattern this project's rehearsal
// scripts already use, applied one layer up (the whole route's request/response shape, not just a
// single canonical-write call).

const ACTOR_ID = "test-actor";
let dexieCounter = 0;

async function seedOrgFixtureAndLiveGame(ctx: TestDbContext) {
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
  // The Game already exists server-side (as if created by an earlier, already-synced action) -
  // this test is about the GameEvent drain/replay round trip, not Game CREATE (covered elsewhere).
  const game = await ctx.prisma.game.create({ data: { organizationId: org.id, fixtureId: fixture.id, status: "LIVE" } });
  return { org, fixture, homeSeasonClub, rosterPlayer, game };
}

test("offline enqueue -> drain -> real server replay: 3 GameEvent CREATEs land, outbox empties, 3 SyncIdempotency rows exist", async () => {
  const ctx = await createTestDbContext();
  const offlineDb = new OfflineScoringDatabase(`ultra-offline-e2e-${dexieCounter++}`);
  try {
    const { org, fixture, homeSeasonClub, rosterPlayer, game } = await seedOrgFixtureAndLiveGame(ctx);
    const repo = new LocalScoringRepository(offlineDb, "device-e2e-1");

    // The local client's own copy of the already-existing game - populated directly (not via
    // repo.createGame(), which would enqueue a redundant Game CREATE that collides with the
    // server-side seed above). A real client would have this from its own earlier createGame call
    // or from a prior sync pulling the game down; reconstructing that pull path is out of scope
    // here.
    await offlineDb.games.put({
      id: game.id,
      organizationId: org.id,
      fixtureId: fixture.id,
      status: "LIVE",
      currentPeriod: 1,
      clockSecondsRemaining: 600,
      clockStartedAt: null,
      shotClockSecondsRemaining: 20,
      shotClockStartedAt: null,
      isUltraTimeActive: false,
      nextEventSequence: 1,
      startedAt: null,
      endedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientUpdatedAt: new Date().toISOString(),
    });

    const eventBase = {
      gameId: game.id,
      seasonClubId: homeSeasonClub.id,
      entrantId: null,
      playerId: rosterPlayer.id,
      fouledPlayerId: null,
      foulType: null,
      causedByEventId: null,
      typeKey: null,
      data: null,
      points: null,
      basePointValue: null,
      multiplier: null,
      made: null,
      isFourPointAttempt: false,
      isUltraTime: false,
      assistedByPlayerId: null,
      substitutedOutPlayerId: null,
      x: null,
      y: null,
      courtZone: null,
      homeScoreBefore: null,
      awayScoreBefore: null,
      homeScoreAfter: null,
      awayScoreAfter: null,
      source: null,
      createdById: null,
      status: "ACTIVE",
      period: 1,
      clockSeconds: 500,
      ledgerSourceHint: "SCORER" as const,
    };
    await repo.logEvent({ ...eventBase, id: "6ba7b810-9dad-11d1-80b4-00c04fd43061", sequenceNumber: null, eventType: "REBOUND", description: "offline rebound 1" });
    await repo.logEvent({ ...eventBase, id: "6ba7b810-9dad-11d1-80b4-00c04fd43062", sequenceNumber: null, eventType: "STEAL", description: "offline steal", clockSeconds: 495 });
    await repo.logEvent({ ...eventBase, id: "6ba7b810-9dad-11d1-80b4-00c04fd43063", sequenceNumber: null, eventType: "ASSIST", description: "offline assist", clockSeconds: 490 });

    assert.equal(await pendingCount(offlineDb), 3, "all 3 offline events start out pending");

    const result = await drain("device-e2e-1", {
      db: offlineDb,
      fetchFn: async (_url, init) => {
        const body = JSON.parse(init!.body as string) as unknown;
        const parsed = syncOutboxRequestSchema.parse(body);
        const outcome = await processOutboxBatch(parsed.records, {
          resolveFixtureIds: async () => new Set([fixture.id]),
          checkFixturePermission: async () => {},
          isAuthorizationError: () => false,
          replay: (record) =>
            replayOutboxRecord(record, {
              actor: { id: ACTOR_ID, organizationId: org.id },
              deviceId: parsed.deviceId,
              syncBatchId: "e2e-batch-1",
              prisma: ctx.prisma,
            }),
        });
        if (!outcome.authorized) {
          return { ok: false, status: 403, json: async () => ({ error: outcome.message }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ results: outcome.results }) } as Response;
      },
    });

    assert.deepEqual(result, { ok: true, attempted: 3, applied: 3, duplicate: 0, failed: 0, conflict: 0 });
    assert.equal(await pendingCount(offlineDb), 0, "the outbox is empty after a fully-successful drain");

    const events = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(events.length, 3);
    assert.equal(events[0].source, "ULTRA_NATIVE_LIVE_SCORER", "SCORER hint resolved correctly through the full drain -> replay round trip");

    const idempotencyRows = await ctx.prisma.syncIdempotency.findMany({ where: { deviceId: "device-e2e-1" } });
    assert.equal(idempotencyRows.length, 3);
  } finally {
    await ctx.teardown();
    await offlineDb.delete();
  }
});
