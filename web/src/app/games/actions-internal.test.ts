// The recordScore invocation test (A5, Step 1's actual safety net) - the baseline this suite
// pins down before computeScoreConsequences/applyScoreEffects extraction begins, so that extraction can
// be verified against unchanged behavior rather than trusted on faith. Exercises
// recordScoreInternal directly with an injected AuthActor, against a real isolated Postgres schema
// (createTestDbContext) - no NextAuth/session dependency, which is the whole point of the actor
// injection this file's sibling actions-internal.ts now supports.
//
// Getting a test-scoped Prisma client all the way into recordScoreInternal required one small
// upstream fix: withGameWrite (src/server/scoring/with-game-write.ts) previously always opened its
// transaction on the global `prisma` singleton, which is bound once at module load to
// process.env.DATABASE_URL's default `public` schema - invisible to this test's isolated schema.
// withGameWrite now accepts an optional injected `prisma` (default: the global singleton, so every
// production call site is unaffected), and each *Internal function forwards its own optional
// trailing `prisma` param through to it - the same "caller owns which client opens the
// transaction" pattern replayOutboxRecord already established.
//
// Coverage map (deliberate - this is the net computeScoreConsequences/applyScoreEffects extraction is
// verified against, so each row exists to catch a specific way that extraction could silently change
// behavior):
//   - Shot categories, home team scoring: 1PT (the one non-field-goal), 2PT, 3PT, 4PT.
//   - Away team scoring (both directions of every isHome branch): plain 2PT and 3PT, and Ultra Time.
//   - Ultra Time, BOTH directions, with prior scores chosen so every value that could be swapped is
//     distinct (home 10 / away 7; plain tests use 12 / 7): the opponent-side TeamStat's own `points`
//     must be the OPPONENT's score, which only a non-zero, asymmetric starting score can tell apart
//     from the scoring side's score - a 0-0 start cannot, and passes even if the sides are swapped.
//   - Error paths: INVALID_TEAM, INVALID_PLAYER, FOUR_POINT_DISABLED (a real GameRuleSnapshot, not the
//     legacy fallback), and input-schema rejection. INVALID_SHOT_VALUE is deliberately NOT tested
//     here: it is unreachable through recordScoreInternal, whose zod schema rejects every value
//     scoreShot would reject first (as a ZodError) - see compute-score-consequences.ts's header.
//   - Manual negative correction: never multiplied, floored at zero, no PlayerStat fabricated.
import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import { recordScoreInternal } from "./actions-internal";
import type { AuthActor } from "@/server/scoring";
import type { Prisma } from "@/generated/prisma/client";

// Legacy rule defaults (no GameRuleSnapshot row - see effectiveRuleSnapshot's LEGACY_RULE_SNAPSHOT
// fallback in ultra-scoring-engine.ts): periodCount 2, ultraTimeStartRemainingSeconds 60,
// ultraTimeMultiplier 2, ultraTimeAppliesFinalPeriodOnly true. A game at period 2 with <=60s left
// (clockStartedAt left null so remainingClockSeconds returns clockSecondsRemaining verbatim, with
// no wall-clock race) puts every Ultra Time test in Ultra Time deterministically, with no need to
// seed a GameRuleSnapshot row at all.
const ULTRA_TIME_GAME_STATE = { currentPeriod: 2, clockSecondsRemaining: 45, isUltraTimeActive: true };

async function seedLiveGame(
  ctx: TestDbContext,
  gameOverrides: Partial<Prisma.GameUncheckedCreateInput> = {},
  fixtureOverrides: Partial<Prisma.FixtureUncheckedCreateInput> = {},
) {
  const org = await ctx.prisma.organization.create({ data: { name: "Test Org", slug: "test-org" } });
  // writeAuditLog's userId column has a real FK to User - an arbitrary string id (the shape every
  // other DB-integration test in this suite uses, since none of their code paths touch AuditLog)
  // fails here with a foreign-key violation, not a validation error. Discovered empirically, not
  // assumed, by actually running this test against a real Postgres server.
  const actorUser = await ctx.prisma.user.create({ data: { name: "Test Actor", email: `test-actor-${org.id}@example.com` } });
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
  const awayAthlete = await ctx.prisma.athlete.create({
    data: { organizationId: org.id, firstName: "P", lastName: "Two", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" },
  });
  const awayPlayer = await ctx.prisma.player.create({
    data: { organizationId: org.id, athleteId: awayAthlete.id, seasonId: season.id, seasonClubId: awaySeasonClub.id, position: "G", heightCm: 180, weightKg: 80 },
  });
  const fixture = await ctx.prisma.fixture.create({
    data: {
      organizationId: org.id, seasonId: season.id, divisionId: division.id, venueId: venue.id,
      scheduledAt: new Date("2026-06-01T12:00:00.000Z"),
      homeSeasonClubId: homeSeasonClub.id, awaySeasonClubId: awaySeasonClub.id, status: "LIVE",
      ...fixtureOverrides,
    },
  });
  const game = await ctx.prisma.game.create({ data: { organizationId: org.id, fixtureId: fixture.id, status: "LIVE", ...gameOverrides } });
  const actor: AuthActor = { id: actorUser.id, organizationId: org.id };
  return { org, fixture, game, homeSeasonClub, awaySeasonClub, rosterPlayer, awayPlayer, actor };
}

// A real GameRuleSnapshot row (not the legacy fallback) - the only way to reach FOUR_POINT_DISABLED.
async function seedRuleSnapshot(
  ctx: TestDbContext,
  organizationId: string,
  gameId: string,
  overrides: Partial<Prisma.GameRuleSnapshotUncheckedCreateInput> = {},
) {
  return ctx.prisma.gameRuleSnapshot.create({
    data: {
      organizationId, gameId, ruleSetName: "Test Rules", ruleSetVersion: 1,
      periodCount: 2, periodDurationSeconds: 600, overtimeDurationSeconds: 300, shotClockSeconds: 20, clockMode: "RUNNING",
      fourPointEnabled: true, fourPointDefinitionType: "OPPOSITE_HALF_ORIGIN", fourPointBaseValue: 4,
      ultraTimeEnabled: true, ultraTimeStartRemainingSeconds: 60, ultraTimeMultiplier: 2, ultraTimeAppliesFinalPeriodOnly: true,
      mandatorySubstitutionEnabled: false, mandatorySubstitutionPeriod: 1, mandatorySubstitutionPolicy: "NONE",
      ...overrides,
    },
  });
}

function scoreForm(seasonClubId: string, playerId: string, points: number, description = "") {
  const form = new FormData();
  form.set("seasonClubId", seasonClubId);
  form.set("playerId", playerId);
  form.set("points", String(points));
  form.set("description", description);
  return form;
}

test("recordScoreInternal: a made 2PT shot updates Fixture.homeScore, writes one SCORE GameEvent, a PlayerStat row, a TeamStat row, and an audit log entry", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);

    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 2, "2PT jumper"), actor, ctx.prisma);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 2);
    assert.equal(updatedFixture.awayScore, 0);

    const events = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.eventType, "SCORE");
    assert.equal(event.points, 2);
    assert.equal(event.basePointValue, 2);
    assert.equal(event.multiplier, 1);
    assert.equal(event.isUltraTime, false);
    assert.equal(event.made, true);
    assert.equal(event.seasonClubId, homeSeasonClub.id);
    assert.equal(event.playerId, rosterPlayer.id);
    assert.equal(event.homeScoreBefore, 0);
    assert.equal(event.homeScoreAfter, 2);
    assert.equal(event.awayScoreBefore, 0);
    assert.equal(event.awayScoreAfter, 0);

    const playerStat = await ctx.prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: rosterPlayer.id } } });
    assert.equal(playerStat.points, 2);
    assert.equal(playerStat.twoPointsMade, 1);
    assert.equal(playerStat.twoPointsAttempted, 1);
    assert.equal(playerStat.fieldGoalsMade, 1);
    assert.equal(playerStat.fieldGoalsAttempted, 1);

    const teamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
    assert.equal(teamStat.points, 2);

    const auditLogs = await ctx.prisma.auditLog.findMany({ where: { entityId: game.id, action: "SCORE_CHANGED" } });
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].userId, actor.id);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: a made 3PT shot increments threePointsMade/Attempted (not twoPoints), fieldGoals, and PlayerStat/TeamStat/Fixture points by 3", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);

    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 3, "3PT"), actor, ctx.prisma);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 3);

    const event = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
    assert.equal(event.basePointValue, 3);
    assert.equal(event.multiplier, 1);
    assert.equal(event.points, 3);

    const playerStat = await ctx.prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: rosterPlayer.id } } });
    assert.equal(playerStat.points, 3);
    assert.equal(playerStat.threePointsMade, 1);
    assert.equal(playerStat.threePointsAttempted, 1);
    assert.equal(playerStat.twoPointsMade, 0, "a 3PT make must not also be counted as a 2PT make");
    assert.equal(playerStat.fieldGoalsMade, 1);
    assert.equal(playerStat.fieldGoalsAttempted, 1);

    const teamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
    assert.equal(teamStat.points, 3);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: a made 4PT shot increments fourPointsMade/Attempted and PlayerStat/TeamStat/Fixture points by 4", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);

    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 4, "4PT"), actor, ctx.prisma);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 4);

    const event = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
    assert.equal(event.basePointValue, 4);
    assert.equal(event.multiplier, 1);
    assert.equal(event.points, 4);
    assert.equal(event.isFourPointAttempt, true);

    const playerStat = await ctx.prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: rosterPlayer.id } } });
    assert.equal(playerStat.points, 4);
    assert.equal(playerStat.fourPointsMade, 1);
    assert.equal(playerStat.fourPointsAttempted, 1);
    assert.equal(playerStat.fieldGoalsMade, 1);
    assert.equal(playerStat.fieldGoalsAttempted, 1);

    const teamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
    assert.equal(teamStat.points, 4);
    assert.equal(teamStat.fourPointsMade, 1);
    assert.equal(teamStat.fourPointsAttempted, 1);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: a made free throw (1PT) increments freeThrowsMade/Attempted, NOT fieldGoalsMade/Attempted - the one shot category that isn't a field goal", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);

    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 1, "FT"), actor, ctx.prisma);

    const playerStat = await ctx.prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: rosterPlayer.id } } });
    assert.equal(playerStat.points, 1);
    assert.equal(playerStat.freeThrowsMade, 1);
    assert.equal(playerStat.freeThrowsAttempted, 1);
    assert.equal(playerStat.fieldGoalsMade, 0, "a free throw is not a field goal - shotStatDeltas only sets fieldGoalsMade for basePointValue >= 2");
    assert.equal(playerStat.fieldGoalsAttempted, 0);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: an Ultra Time 2PT shot doubles points via multiplier, credits the shooting team's ultraTimePointsFor, and credits the opponent's ultraTimePointsAgainst without changing the opponent's own score", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, awaySeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx, ULTRA_TIME_GAME_STATE);

    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 2, "Ultra Time 2PT"), actor, ctx.prisma);

    // isUltraTimeActive seeded true and the game state still evaluates to active, so
    // syncUltraTimeState sees no transition and writes no extra ULTRA_TIME_STARTED event -
    // exactly one GameEvent (the SCORE itself) is expected here.
    const events = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.basePointValue, 2, "the base shot category is still 2PT - the multiplier doubles points, not the reported category");
    assert.equal(event.multiplier, 2);
    assert.equal(event.points, 4, "2 base points * 2x Ultra Time multiplier = 4");
    assert.equal(event.isUltraTime, true);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 4);
    assert.equal(updatedFixture.awayScore, 0, "the opponent's own score must be untouched by the scoring team's Ultra Time shot");

    const playerStat = await ctx.prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: rosterPlayer.id } } });
    assert.equal(playerStat.points, 4);
    assert.equal(playerStat.twoPointsMade, 1, "the base category (2PT) is still recorded once, unmultiplied");
    assert.equal(playerStat.ultraTimeTwoPointsMade, 1, "the Ultra Time-specific category is also recorded once");
    assert.equal(playerStat.ultraTimeFieldGoalsMade, 1);

    const homeTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
    assert.equal(homeTeamStat.points, 4);
    assert.equal(homeTeamStat.ultraTimePointsFor, 4, "the shooting team's own Ultra Time points-for tally");

    // Opponent-side bookkeeping: the case named as "the one most likely to be missed" - a TeamStat
    // row is created for the OPPOSING seasonClub too, carrying only the ultraTimePointsAgainst
    // delta (their own `points` field mirrors their actual, unchanged score - see
    // recordScoreInternal's second applyTeamShotStatDeltas call).
    const awayTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: awaySeasonClub.id } } });
    assert.equal(awayTeamStat.points, 0, "the opponent's own absolute score is unchanged");
    assert.equal(awayTeamStat.ultraTimePointsAgainst, 4, "the opponent's ultraTimePointsAgainst must reflect the 4 Ultra Time points scored against them");
    assert.equal(awayTeamStat.ultraTimePointsFor, 0);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: a seasonClubId that is not one of the fixture's two sides is rejected as INVALID_TEAM, with no GameEvent or score change", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, game, rosterPlayer, actor } = await seedLiveGame(ctx);
    const sport = await ctx.prisma.sport.findFirstOrThrow();
    const otherClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Other", shortName: "O" } });
    const foreignSeasonClub = await ctx.prisma.seasonClub.create({
      data: { organizationId: org.id, seasonId: fixture.seasonId, clubId: otherClub.id, divisionId: fixture.divisionId },
    });

    await assert.rejects(
      () => recordScoreInternal(game.id, fixture.id, scoreForm(foreignSeasonClub.id, rosterPlayer.id, 2), actor, ctx.prisma),
      /INVALID_TEAM/,
    );

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 0);
    const events = await ctx.prisma.gameEvent.findMany({ where: { gameId: game.id } });
    assert.equal(events.length, 0);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: a manual negative correction is never multiplied and never drives the score below zero", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);

    // Fixture.homeScore starts at 0 - a -2 correction here has nothing to reduce, so the floor
    // (Math.max(0, currentScore + pointsAwarded)) must clamp the actual delta to 0, not go negative.
    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, -2, "correction"), actor, ctx.prisma);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 0, "the floor must prevent a negative score");

    const event = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
    assert.equal(event.points, 0, "the persisted delta must reflect the actual (clamped) change, not the raw -2 requested");
    assert.equal(event.basePointValue, null, "a manual correction (shotValue <= 0) is never attributed a shot category");
    assert.equal(event.multiplier, null);
    assert.equal(event.isUltraTime, false);

    // A zero-effect correction must not fabricate a PlayerStat/TeamStat row with all-zero deltas.
    const playerStat = await ctx.prisma.playerStat.findUnique({ where: { gameId_playerId: { gameId: game.id, playerId: rosterPlayer.id } } });
    assert.equal(playerStat, null);
  } finally {
    await ctx.teardown();
  }
});

// ---- Away-team scoring (plain time) ----------------------------------------------------------
// Prior score 12 (home) - 7 (away), all distinct from any value a swapped side could produce.

for (const { points, expectedAway, label } of [
  { points: 2, expectedAway: 9, label: "2PT" },
  { points: 3, expectedAway: 10, label: "3PT" },
]) {
  test(`recordScoreInternal: an AWAY-team made ${label} updates awayScore only, with home/away before/after fields on the correct sides and no opponent-side TeamStat`, async () => {
    const ctx = await createTestDbContext();
    try {
      const { fixture, game, homeSeasonClub, awaySeasonClub, awayPlayer, actor } = await seedLiveGame(ctx, {}, { homeScore: 12, awayScore: 7 });

      await recordScoreInternal(game.id, fixture.id, scoreForm(awaySeasonClub.id, awayPlayer.id, points, `away ${label}`), actor, ctx.prisma);

      const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
      assert.equal(updatedFixture.awayScore, expectedAway);
      assert.equal(updatedFixture.homeScore, 12, "the home score must be untouched by an away-team shot");

      const event = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
      assert.equal(event.seasonClubId, awaySeasonClub.id);
      assert.equal(event.points, points);
      assert.equal(event.basePointValue, points);
      assert.equal(event.homeScoreBefore, 12);
      assert.equal(event.homeScoreAfter, 12);
      assert.equal(event.awayScoreBefore, 7);
      assert.equal(event.awayScoreAfter, expectedAway);

      const playerStat = await ctx.prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: awayPlayer.id } } });
      assert.equal(playerStat.points, points);
      assert.equal(playerStat.seasonClubId, awaySeasonClub.id);

      const awayTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: awaySeasonClub.id } } });
      assert.equal(awayTeamStat.points, expectedAway, "the scoring team's TeamStat.points is its new absolute score");
      const homeTeamStat = await ctx.prisma.teamStat.findUnique({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
      assert.equal(homeTeamStat, null, "a non-Ultra Time shot never touches the opponent's TeamStat row");
    } finally {
      await ctx.teardown();
    }
  });
}

// ---- Ultra Time, both directions ---------------------------------------------------------------
// Prior score home 10 / away 7. Home scoring (+4): home 14, opponent=away must read 7 (not 10, not
// 14). Away scoring (+4): away 11, opponent=home must read 10 (not 7, not 11). Every candidate for
// the wrong-side bug is a different number, so a swapped side cannot pass by coincidence.

test("recordScoreInternal: Ultra Time, HOME scores - opponent (away) TeamStat.points is the AWAY score, ultraTimePointsAgainst is credited to away", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, awaySeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx, ULTRA_TIME_GAME_STATE, { homeScore: 10, awayScore: 7 });

    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 2, "UT home"), actor, ctx.prisma);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.homeScore, 14);
    assert.equal(updatedFixture.awayScore, 7);

    const event = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
    assert.equal(event.points, 4);
    assert.equal(event.multiplier, 2);
    assert.equal(event.isUltraTime, true);
    assert.deepEqual(
      { hb: event.homeScoreBefore, ha: event.homeScoreAfter, ab: event.awayScoreBefore, aa: event.awayScoreAfter },
      { hb: 10, ha: 14, ab: 7, aa: 7 },
    );

    const homeTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
    assert.equal(homeTeamStat.points, 14);
    assert.equal(homeTeamStat.ultraTimePointsFor, 4);
    assert.equal(homeTeamStat.ultraTimePointsAgainst, 0);

    const awayTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: awaySeasonClub.id } } });
    assert.equal(awayTeamStat.points, 7, "the opponent's TeamStat.points is the opponent's OWN score - not the shooter's old (10) or new (14) score");
    assert.equal(awayTeamStat.ultraTimePointsAgainst, 4);
    assert.equal(awayTeamStat.ultraTimePointsFor, 0);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: Ultra Time, AWAY scores - opponent (home) TeamStat.points is the HOME score, ultraTimePointsAgainst is credited to home", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, awaySeasonClub, awayPlayer, actor } = await seedLiveGame(ctx, ULTRA_TIME_GAME_STATE, { homeScore: 10, awayScore: 7 });

    await recordScoreInternal(game.id, fixture.id, scoreForm(awaySeasonClub.id, awayPlayer.id, 2, "UT away"), actor, ctx.prisma);

    const updatedFixture = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
    assert.equal(updatedFixture.awayScore, 11);
    assert.equal(updatedFixture.homeScore, 10);

    const event = await ctx.prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id } });
    assert.equal(event.points, 4);
    assert.equal(event.multiplier, 2);
    assert.equal(event.isUltraTime, true);
    assert.deepEqual(
      { hb: event.homeScoreBefore, ha: event.homeScoreAfter, ab: event.awayScoreBefore, aa: event.awayScoreAfter },
      { hb: 10, ha: 10, ab: 7, aa: 11 },
    );

    const awayTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: awaySeasonClub.id } } });
    assert.equal(awayTeamStat.points, 11);
    assert.equal(awayTeamStat.ultraTimePointsFor, 4);
    assert.equal(awayTeamStat.ultraTimePointsAgainst, 0);

    const homeTeamStat = await ctx.prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: homeSeasonClub.id } } });
    assert.equal(homeTeamStat.points, 10, "the opponent's TeamStat.points is the opponent's OWN score - not the shooter's old (7) or new (11) score");
    assert.equal(homeTeamStat.ultraTimePointsAgainst, 4);
    assert.equal(homeTeamStat.ultraTimePointsFor, 0);
  } finally {
    await ctx.teardown();
  }
});

// ---- Error paths -------------------------------------------------------------------------------

test("recordScoreInternal: a playerId that is not on the shooting team is rejected as INVALID_PLAYER, with no writes", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, awayPlayer, actor } = await seedLiveGame(ctx);

    // awayPlayer is a real player, but on the AWAY roster - not the home team being credited.
    await assert.rejects(
      () => recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, awayPlayer.id, 2), actor, ctx.prisma),
      /INVALID_PLAYER/,
    );

    assert.equal((await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).homeScore, 0);
    assert.equal(await ctx.prisma.gameEvent.count({ where: { gameId: game.id } }), 0);
    assert.equal(await ctx.prisma.playerStat.count({ where: { gameId: game.id } }), 0);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: a 4PT shot under a rule snapshot with the 4-point rule disabled is rejected as FOUR_POINT_DISABLED and rolls back; a 3PT under the same snapshot still scores", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);
    await seedRuleSnapshot(ctx, org.id, game.id, { fourPointEnabled: false, fourPointDefinitionType: "DISABLED" });

    await assert.rejects(
      () => recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 4, "illegal 4PT"), actor, ctx.prisma),
      /FOUR_POINT_DISABLED/,
    );

    // Everything is rolled back: scoreShot's rejection throws inside withGameWrite's transaction.
    assert.equal((await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).homeScore, 0);
    assert.equal(await ctx.prisma.gameEvent.count({ where: { gameId: game.id } }), 0);
    assert.equal(await ctx.prisma.playerStat.count({ where: { gameId: game.id } }), 0);
    assert.equal(await ctx.prisma.teamStat.count({ where: { gameId: game.id } }), 0);
    assert.equal(await ctx.prisma.auditLog.count({ where: { entityId: game.id } }), 0);
    assert.equal((await ctx.prisma.game.findUniqueOrThrow({ where: { id: game.id } })).nextEventSequence, 1, "the rejected attempt must not have consumed a sequence number");

    // The snapshot is a real (non-legacy) rule source and does not break legal shots.
    await recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, 3, "legal 3PT"), actor, ctx.prisma);
    assert.equal((await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).homeScore, 3);
  } finally {
    await ctx.teardown();
  }
});

test("recordScoreInternal: out-of-range or non-integer points (0, 5, -5, 2.5) are rejected by the input schema as a ZodError - INVALID_SHOT_VALUE is unreachable here - with no writes", async () => {
  const ctx = await createTestDbContext();
  try {
    const { fixture, game, homeSeasonClub, rosterPlayer, actor } = await seedLiveGame(ctx);

    for (const points of [0, 5, -5, 2.5]) {
      await assert.rejects(
        () => recordScoreInternal(game.id, fixture.id, scoreForm(homeSeasonClub.id, rosterPlayer.id, points), actor, ctx.prisma),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
        `points=${points} should be rejected by the input schema`,
      );
    }

    assert.equal(await ctx.prisma.gameEvent.count({ where: { gameId: game.id } }), 0);
    assert.equal((await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).homeScore, 0);
  } finally {
    await ctx.teardown();
  }
});
