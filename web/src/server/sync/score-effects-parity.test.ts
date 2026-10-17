// A5 Step 7's proof: a replayed offline SCORE must leave the database in exactly the state a live
// tap does. Until this existed, replay created the GameEvent row and nothing else - the
// "effects-extraction gap" (docs/canonical-write-audit.md, PRODUCT_ROADMAP.md A5): the ledger said
// one thing and the scoreboard/stats another, latent only because nothing replayed SCORE records in
// production yet.
//
// Method: seed TWO structurally identical games in one isolated schema (same clubs, same roster, same
// prior score, same clock state), score the first through recordScoreInternal (the live path) and
// replay a client-resolved SCORE onto the second through replayOutboxRecord (the sync path), then
// compare every field either path can write. A difference in any of them is the bug this file exists
// to catch - a shared helper that silently diverges for one caller.
//
// Deliberately NOT compared (each is an intentional, documented transport difference, not a parity
// requirement): GameEvent.resolvedBy (SERVER for a live tap, CLIENT for a client-asserted one),
// clientObservedAt, syncBatchId, deviceId/idempotencyKey, the client-generated id, AuditLog (live-only
// - replay has never written one), and row timestamps. Everything else must match, including
// GameEvent.source, which is transport-stable by design (ledgerSourceFor("LIVE_UI", undefined) and
// ledgerSourceFor("OFFLINE_SYNC", "SCORER") both resolve to ULTRA_NATIVE_LIVE_SCORER).
import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import { recordScoreInternal } from "@/app/games/actions-internal";
import type { AuthActor } from "@/server/scoring";
import type { Prisma } from "@/generated/prisma/client";
import type { OutboxRecord } from "@/lib/sync/outbox-schema";
import { replayOutboxRecord } from "./replay-outbox-record";

// Legacy rule defaults (no GameRuleSnapshot row): period 2 with <=60s left is Ultra Time at the 2x
// multiplier. clockStartedAt stays null so remainingClockSeconds returns the stored value verbatim -
// no wall-clock race between the two paths, which is what makes an exact comparison possible.
const ULTRA_TIME_GAME_STATE = { currentPeriod: 2, clockSecondsRemaining: 45, isUltraTimeActive: true };

// isClientObservedAtPlausible's window is 24h, so a literal timestamp would silently expire and turn
// every parity test into an IMPLAUSIBLE_CLIENT_OBSERVATION assertion instead of a parity one.
const RECENT_CLIENT_OBSERVED_AT = new Date(Date.now() - 60_000).toISOString();

const EVENT_FIELDS_COMPARED = [
  "eventType",
  "points",
  "basePointValue",
  "multiplier",
  "made",
  "isFourPointAttempt",
  "isUltraTime",
  "seasonClubId",
  "playerId",
  "period",
  "clockSeconds",
  "description",
  "homeScoreBefore",
  "awayScoreBefore",
  "homeScoreAfter",
  "awayScoreAfter",
  "source",
  "sequenceNumber",
] as const;

function withoutVolatileColumns(row: Record<string, unknown>): Record<string, unknown> {
  const { id, createdAt, updatedAt, gameId, ...rest } = row;
  void id;
  void createdAt;
  void updatedAt;
  void gameId;
  return rest;
}

async function seedParityPair(
  ctx: TestDbContext,
  options: {
    gameState?: Partial<Prisma.GameUncheckedCreateInput>;
    homeScore?: number;
    awayScore?: number;
  } = {},
) {
  const org = await ctx.prisma.organization.create({ data: { name: "Parity Org", slug: "parity-org" } });
  // recordScoreInternal's audit write has a real FK to User (same finding the invocation suite
  // documents); replay writes no audit row, so only the live path needs the actor to exist.
  const actorUser = await ctx.prisma.user.create({ data: { name: "Parity Actor", email: `parity-actor-${org.id}@example.com` } });
  const sport = await ctx.prisma.sport.create({ data: { name: "Parity Sport", slug: `parity-sport-${org.id}` } });
  const competition = await ctx.prisma.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: "C", slug: "c" } });
  const division = await ctx.prisma.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: "D", slug: "d" } });
  const season = await ctx.prisma.season.create({
    data: { organizationId: org.id, competitionId: competition.id, name: "S", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
  });
  const venue = await ctx.prisma.venue.create({ data: { organizationId: org.id, name: "V", address: "1 St", city: "City", capacity: 10 } });
  const homeClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Home", shortName: "H" } });
  const awayClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Away", shortName: "A" } });
  const homeSeasonClub = await ctx.prisma.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: homeClub.id, divisionId: division.id } });
  const awaySeasonClub = await ctx.prisma.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: awayClub.id, divisionId: division.id } });

  const homeAthlete = await ctx.prisma.athlete.create({
    data: { organizationId: org.id, firstName: "P", lastName: "Home", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" },
  });
  const homePlayer = await ctx.prisma.player.create({
    data: { organizationId: org.id, athleteId: homeAthlete.id, seasonId: season.id, seasonClubId: homeSeasonClub.id, position: "G", heightCm: 180, weightKg: 80 },
  });
  const awayAthlete = await ctx.prisma.athlete.create({
    data: { organizationId: org.id, firstName: "P", lastName: "Away", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" },
  });
  const awayPlayer = await ctx.prisma.player.create({
    data: { organizationId: org.id, athleteId: awayAthlete.id, seasonId: season.id, seasonClubId: awaySeasonClub.id, position: "G", heightCm: 180, weightKg: 80 },
  });

  const homeScore = options.homeScore ?? 0;
  const awayScore = options.awayScore ?? 0;
  const fixtureData = {
    organizationId: org.id,
    seasonId: season.id,
    divisionId: division.id,
    venueId: venue.id,
    scheduledAt: new Date("2026-06-01T12:00:00.000Z"),
    homeSeasonClubId: homeSeasonClub.id,
    awaySeasonClubId: awaySeasonClub.id,
    status: "LIVE" as const,
    homeScore,
    awayScore,
  };
  const liveFixture = await ctx.prisma.fixture.create({ data: fixtureData });
  const replayFixture = await ctx.prisma.fixture.create({ data: fixtureData });
  const liveGame = await ctx.prisma.game.create({
    data: { organizationId: org.id, fixtureId: liveFixture.id, status: "LIVE", ...options.gameState },
  });
  const replayGame = await ctx.prisma.game.create({
    data: { organizationId: org.id, fixtureId: replayFixture.id, status: "LIVE", ...options.gameState },
  });

  const actor: AuthActor = { id: actorUser.id, organizationId: org.id };
  return { org, actor, homeSeasonClub, awaySeasonClub, homePlayer, awayPlayer, liveFixture, replayFixture, liveGame, replayGame };
}

function scoreForm(seasonClubId: string, playerId: string, points: number, description: string) {
  const form = new FormData();
  form.set("seasonClubId", seasonClubId);
  form.set("playerId", playerId);
  form.set("points", String(points));
  form.set("description", description);
  return form;
}

function scoreRecord(overrides: { gameId: string; entityId: string; payload: Record<string, unknown> }): OutboxRecord {
  return {
    idempotencyKey: `550e8400-e29b-41d4-a716-${overrides.entityId.slice(-12)}`,
    entityType: "GameEvent",
    operation: "CREATE",
    entityId: overrides.entityId,
    clientUpdatedAt: RECENT_CLIENT_OBSERVED_AT,
    ledgerSourceHint: "SCORER",
    payload: overrides.payload,
  } as OutboxRecord;
}

// Snapshots everything either path can write, with volatile columns removed - see the header's list
// of intentional differences.
async function snapshot(ctx: TestDbContext, gameId: string, fixtureId: string) {
  const fixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } });
  const events = await ctx.prisma.gameEvent.findMany({ where: { gameId }, orderBy: { sequenceNumber: "asc" } });
  const playerStats = await ctx.prisma.playerStat.findMany({ where: { gameId }, orderBy: { playerId: "asc" } });
  const teamStats = await ctx.prisma.teamStat.findMany({ where: { gameId }, orderBy: { seasonClubId: "asc" } });
  return {
    fixture: { homeScore: fixture.homeScore, awayScore: fixture.awayScore },
    events: events.map((event) =>
      Object.fromEntries(EVENT_FIELDS_COMPARED.map((field) => [field, (event as Record<string, unknown>)[field]])),
    ),
    playerStats: playerStats.map((row) => withoutVolatileColumns(row as unknown as Record<string, unknown>)),
    teamStats: teamStats.map((row) => withoutVolatileColumns(row as unknown as Record<string, unknown>)),
  };
}

// ---- Case 1: plain-time 3PT, home -----------------------------------------------------------------

test("parity: a home 3PT scores identically through the live path and through offline replay (fixture, event, PlayerStat, TeamStat)", async () => {
  const ctx = await createTestDbContext();
  try {
    const { actor, homeSeasonClub, homePlayer, liveFixture, replayFixture, liveGame, replayGame } = await seedParityPair(ctx, {
      homeScore: 12,
      awayScore: 7,
    });

    await recordScoreInternal(liveGame.id, liveFixture.id, scoreForm(homeSeasonClub.id, homePlayer.id, 3, "3PT jumper"), actor, ctx.prisma);

    const record = scoreRecord({
      gameId: replayGame.id,
      entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43101",
      payload: {
        gameId: replayGame.id,
        seasonClubId: homeSeasonClub.id,
        playerId: homePlayer.id,
        eventType: "SCORE",
        description: "3PT jumper",
        period: 1,
        clockSeconds: 600,
        basePointValue: 3,
        multiplier: 1,
        points: 3,
        isUltraTime: false,
        made: true,
        clientObservedAt: RECENT_CLIENT_OBSERVED_AT,
      },
    });
    const replayed = await replayOutboxRecord(record, {
      actor,
      deviceId: "parity-device",
      syncBatchId: "parity-batch-1",
      prisma: ctx.prisma,
    });
    assert.equal(replayed.status, "APPLIED");

    assert.deepEqual(await snapshot(ctx, replayGame.id, replayFixture.id), await snapshot(ctx, liveGame.id, liveFixture.id));
  } finally {
    await ctx.teardown();
  }
});

// ---- Case 2: Ultra Time, home (player + team + opponent bookkeeping) ------------------------------

test("parity: an Ultra Time 2PT (doubled) scores identically live vs replay, including the opponent's ultraTimePointsAgainst row", async () => {
  const ctx = await createTestDbContext();
  try {
    const { actor, homeSeasonClub, homePlayer, liveFixture, replayFixture, liveGame, replayGame } = await seedParityPair(ctx, {
      gameState: ULTRA_TIME_GAME_STATE,
      homeScore: 10,
      awayScore: 7,
    });

    await recordScoreInternal(liveGame.id, liveFixture.id, scoreForm(homeSeasonClub.id, homePlayer.id, 2, "Ultra Time 2PT"), actor, ctx.prisma);

    const record = scoreRecord({
      gameId: replayGame.id,
      entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43102",
      payload: {
        gameId: replayGame.id,
        seasonClubId: homeSeasonClub.id,
        playerId: homePlayer.id,
        eventType: "SCORE",
        description: "Ultra Time 2PT",
        period: 2,
        clockSeconds: 45,
        basePointValue: 2,
        multiplier: 2,
        points: 4,
        isUltraTime: true,
        made: true,
        clientObservedAt: RECENT_CLIENT_OBSERVED_AT,
      },
    });
    const replayed = await replayOutboxRecord(record, {
      actor,
      deviceId: "parity-device",
      syncBatchId: "parity-batch-2",
      prisma: ctx.prisma,
    });
    assert.equal(replayed.status, "APPLIED");

    const live = await snapshot(ctx, liveGame.id, liveFixture.id);
    const replay = await snapshot(ctx, replayGame.id, replayFixture.id);
    assert.deepEqual(replay, live);

    // Explicit, so a regression that changes BOTH sides identically still fails here: the Ultra Time
    // shot is 4 points on a 2-point shot, and the opponent's row records 4 points against.
    assert.equal(live.fixture.homeScore, 14);
    assert.equal(live.teamStats.length, 2, "an Ultra Time shot writes the opponent's TeamStat row too");
  } finally {
    await ctx.teardown();
  }
});

// ---- Case 3: plain-time 3PT, away (the isHome/opponent-resolution branch) -------------------------

test("parity: an AWAY 3PT scores identically live vs replay, with no opponent-side TeamStat row in either", async () => {
  const ctx = await createTestDbContext();
  try {
    const { actor, awaySeasonClub, awayPlayer, liveFixture, replayFixture, liveGame, replayGame } = await seedParityPair(ctx, {
      homeScore: 12,
      awayScore: 7,
    });

    await recordScoreInternal(liveGame.id, liveFixture.id, scoreForm(awaySeasonClub.id, awayPlayer.id, 3, "away 3PT"), actor, ctx.prisma);

    const record = scoreRecord({
      gameId: replayGame.id,
      entityId: "6ba7b810-9dad-11d1-80b4-00c04fd43103",
      payload: {
        gameId: replayGame.id,
        seasonClubId: awaySeasonClub.id,
        playerId: awayPlayer.id,
        eventType: "SCORE",
        description: "away 3PT",
        period: 1,
        clockSeconds: 600,
        basePointValue: 3,
        multiplier: 1,
        points: 3,
        isUltraTime: false,
        made: true,
        clientObservedAt: RECENT_CLIENT_OBSERVED_AT,
      },
    });
    const replayed = await replayOutboxRecord(record, {
      actor,
      deviceId: "parity-device",
      syncBatchId: "parity-batch-3",
      prisma: ctx.prisma,
    });
    assert.equal(replayed.status, "APPLIED");

    const live = await snapshot(ctx, liveGame.id, liveFixture.id);
    assert.deepEqual(await snapshot(ctx, replayGame.id, replayFixture.id), live);
    assert.equal(live.fixture.awayScore, 10);
    assert.equal(live.fixture.homeScore, 12);
    assert.equal(live.teamStats.length, 1, "a non-Ultra Time shot never creates the opponent's TeamStat row");
    assert.equal(live.teamStats[0].seasonClubId, awaySeasonClub.id);
  } finally {
    await ctx.teardown();
  }
});
