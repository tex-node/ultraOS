// Proves the "synthesized reference" mechanism named in resolve-batch-authorization.ts: a
// GameEvent record that only carries a gameId resolves to the SAME fixtureId as the in-batch Game
// CREATE record for that gameId - without needing that Game to exist in the database yet. This is
// the specific failure mode named in the pre-Commit-3 checklist: a batch with a bad-organization
// Game and a dependent GameEvent referencing it via client id must resolve to ONE fixtureId, not
// two, so a single authorization check rejects both.
import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext } from "@/test-support/db-test-context";
import { resolveFixtureIdsToAuthorize } from "./resolve-batch-authorization";
import type { OutboxRecord } from "@/lib/sync/outbox-schema";

function gameCreateRecord(entityId: string, fixtureId: string): OutboxRecord {
  return {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    entityType: "Game",
    operation: "CREATE",
    entityId,
    payload: { fixtureId },
    clientUpdatedAt: "2026-09-28T10:00:00.000Z",
  };
}

function gameEventRecord(entityId: string, gameId: string): OutboxRecord {
  return {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
    entityType: "GameEvent",
    operation: "CREATE",
    entityId,
    payload: { gameId },
    clientUpdatedAt: "2026-09-28T10:00:01.000Z",
  };
}

test("a GameEvent referencing an in-batch Game synthesizes the same fixtureId - no DB lookup, no second fixture", async () => {
  const ctx = await createTestDbContext();
  try {
    const records: OutboxRecord[] = [
      gameCreateRecord("game-1", "fixture-not-yet-in-db"),
      gameEventRecord("event-1", "game-1"),
    ];

    const fixtureIds = await ctx.prisma.$transaction((tx) => resolveFixtureIdsToAuthorize(tx, records));

    assert.equal(fixtureIds.size, 1, "the Game and its dependent GameEvent must resolve to exactly one fixtureId, not two");
    assert.ok(fixtureIds.has("fixture-not-yet-in-db"));
  } finally {
    await ctx.teardown();
  }
});

test("a GameEvent whose game already exists (not in this batch) falls back to a DB lookup", async () => {
  const ctx = await createTestDbContext();
  try {
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
    const fixture = await ctx.prisma.fixture.create({
      data: {
        organizationId: org.id, seasonId: season.id, divisionId: division.id, venueId: venue.id,
        scheduledAt: new Date("2026-06-01T12:00:00.000Z"),
        homeSeasonClubId: homeSeasonClub.id, awaySeasonClubId: awaySeasonClub.id, status: "LIVE",
      },
    });
    const game = await ctx.prisma.game.create({ data: { organizationId: org.id, fixtureId: fixture.id, status: "LIVE" } });

    const records: OutboxRecord[] = [gameEventRecord("event-1", game.id)];
    const fixtureIds = await ctx.prisma.$transaction((tx) => resolveFixtureIdsToAuthorize(tx, records));

    assert.equal(fixtureIds.size, 1);
    assert.ok(fixtureIds.has(fixture.id));
  } finally {
    await ctx.teardown();
  }
});
