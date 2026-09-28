// Proves the per-schema test-isolation mechanism (db-test-context.ts) with a real round-trip
// through the actual createGameEvent canonical service - not a mock, not a raw query. This is the
// load-bearing check for A3b's test infrastructure: if this passes, every future A3b test can
// build on createTestDbContext() with confidence the isolation itself works.
//
// Requires DATABASE_URL to point at a real Postgres server, and NODE_OPTIONS=--conditions=react-
// server so the "server-only" package guard resolves to its build-time stub (createGameEvent's
// module chain is server-only) instead of the throwing default a plain test run otherwise gets -
// see package.json's "test:db" script.
import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext } from "./db-test-context";
import { createGameEvent } from "@/server/scoring";

test("createTestDbContext: an isolated schema supports a real createGameEvent round-trip", async () => {
  const ctx = await createTestDbContext();
  try {
    const org = await ctx.prisma.organization.create({ data: { name: "Test Org", slug: "test-org" } });
    const sport = await ctx.prisma.sport.create({ data: { name: "Test Basketball", slug: "test-basketball" } });
    const competition = await ctx.prisma.competition.create({
      data: { organizationId: org.id, sportId: sport.id, name: "Test Competition", slug: "test-competition" },
    });
    const division = await ctx.prisma.division.create({
      data: { organizationId: org.id, competitionId: competition.id, name: "Test Division", slug: "test-division" },
    });
    const season = await ctx.prisma.season.create({
      data: {
        organizationId: org.id,
        competitionId: competition.id,
        name: "Test Season",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
    const venue = await ctx.prisma.venue.create({
      data: { organizationId: org.id, name: "Test Venue", address: "1 Test St", city: "Test City", capacity: 100 },
    });
    const homeClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Home Club", shortName: "HOME" } });
    const awayClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Away Club", shortName: "AWAY" } });
    const homeSeasonClub = await ctx.prisma.seasonClub.create({
      data: { organizationId: org.id, seasonId: season.id, clubId: homeClub.id, divisionId: division.id },
    });
    const awaySeasonClub = await ctx.prisma.seasonClub.create({
      data: { organizationId: org.id, seasonId: season.id, clubId: awayClub.id, divisionId: division.id },
    });
    const fixture = await ctx.prisma.fixture.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        scheduledAt: new Date("2026-06-01T12:00:00.000Z"),
        homeSeasonClubId: homeSeasonClub.id,
        awaySeasonClubId: awaySeasonClub.id,
        status: "LIVE",
      },
    });
    const game = await ctx.prisma.game.create({
      data: { organizationId: org.id, fixtureId: fixture.id, status: "LIVE" },
    });

    const result = await ctx.prisma.$transaction((tx) =>
      createGameEvent(
        {
          gameId: game.id,
          fixtureId: fixture.id,
          eventType: "NOTE",
          period: 1,
          clockSeconds: 500,
          description: "Isolation round-trip test event",
        },
        { actor: { id: "test-actor", organizationId: org.id }, source: "LIVE_UI", tx },
      ),
    );

    assert.ok(result.id);
    assert.equal(result.sequenceNumber, 1);

    const persisted = await ctx.prisma.gameEvent.findUniqueOrThrow({ where: { id: result.id } });
    assert.equal(persisted.gameId, game.id);
    assert.equal(persisted.description, "Isolation round-trip test event");
    assert.equal(persisted.source, "ULTRA_NATIVE_LIVE_SCORER");

    // Confirms isolation, not just that the write worked: a second schema exists concurrently and
    // sees none of this one's rows - not "the DB is empty right now", an actual cross-schema check.
    const otherCtx = await createTestDbContext();
    try {
      const orgCountInOtherSchema = await otherCtx.prisma.organization.count();
      assert.equal(orgCountInOtherSchema, 0, "a second, independently-provisioned schema must not see the first schema's rows");
    } finally {
      await otherCtx.teardown();
    }
  } finally {
    await ctx.teardown();
  }
});
