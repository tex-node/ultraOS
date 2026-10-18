// P15 C1 remainder (I2 first slice): the adopt action's contract, against a real Postgres schema.
//
// What only a database can prove here: the supersede-then-insert ordering (the partial unique index
// forbids two ACTIVE rows for one player, so adopting twice MUST close the first one first), the
// frozen snapshot surviving as JSONB, and the tenant guard on the player lookup.
//
// Caveat worth knowing: createTestDbContext provisions the schema with `prisma db push`, which
// cannot express a PARTIAL unique index, so the test installs
// CoachingPlan_one_active_per_player itself (schema-qualified - raw SQL through this client resolves
// against the connection's search_path, i.e. `public`, not the test schema; see db-test-context's
// own note). The migration is the real source of that index; this test mirrors it deliberately and
// proves the adopt logic holds under it.
import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import {
  adoptCoachingPlan,
  COACHING_PLAN_ADOPTED_AUDIT_ACTION,
  COACHING_PLAN_SUPERSEDED_AUDIT_ACTION,
  loadActiveCoachingPlan,
} from "./plans";
import { buildCoachingPlanSnapshot } from "@/lib/coaching/plan-snapshot";
import type { FocusArea, PlayerDevelopmentPlan } from "@/lib/coaching/player-development";

function focusArea(overrides: Partial<FocusArea> = {}): FocusArea {
  return {
    dimension: "FREE_THROWS",
    label: "Free-throw shooting",
    priority: 1,
    evidence: {
      metric: "Free-throw %",
      playerValue: 0.61,
      playerValueLabel: "61%",
      baseline: { kind: "LEAGUE", label: "League", peerCount: 40, median: 0.7, medianLabel: "70%" },
      percentile: 22,
      sample: { games: 8, attempts: 44, label: "44 attempts in 8 games" },
      gate: "at least 20 attempts",
      confidence: "MEDIUM",
      source: "BOX_SCORE",
    },
    trend: { direction: "IMPROVING", recentValueLabel: "64%", recentGames: 3 },
    whyItMatters: "Cheapest points on the board.",
    target: { metricKey: "game.ft_pct", metric: "Free-throw %", current: 0.61, target: 0.72, currentLabel: "61%", targetLabel: "72%", reviewWindowGames: 6, statement: "Make 72% over 6 games." },
    drills: [{ id: "ft_routine", name: "Free-throw routine", durationMinutes: 10 } as FocusArea["drills"][number]],
    ...overrides,
  };
}

function planFor(playerId: string, seasonClubId: string, overrides: Partial<PlayerDevelopmentPlan> = {}): PlayerDevelopmentPlan {
  return {
    playerId,
    name: "P One",
    jerseyNumber: 7,
    seasonClubId,
    position: "Point guard",
    positionGroup: "GUARD",
    gamesPlayed: 8,
    status: "OK",
    focusAreas: [focusArea()],
    strengths: [],
    readings: [],
    ...overrides,
  };
}

async function seed(ctx: TestDbContext) {
  const org = await ctx.prisma.organization.create({ data: { name: "Coaching Org", slug: `coaching-org-${Date.now()}` } });
  const user = await ctx.prisma.user.create({ data: { name: "Coach Example", email: `coach-${Date.now()}-${Math.random()}@example.com` } });
  const sport = await ctx.prisma.sport.create({ data: { name: "C Sport", slug: `c-sport-${Date.now()}` } });
  const competition = await ctx.prisma.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: "C", slug: "c" } });
  const division = await ctx.prisma.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: "D", slug: "d" } });
  const season = await ctx.prisma.season.create({
    data: { organizationId: org.id, competitionId: competition.id, name: "S", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
  });
  const club = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Home", shortName: "H" } });
  const otherClub = await ctx.prisma.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Other", shortName: "O" } });
  const seasonClub = await ctx.prisma.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: club.id, divisionId: division.id } });
  const otherSeasonClub = await ctx.prisma.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: otherClub.id, divisionId: division.id } });
  const athlete = await ctx.prisma.athlete.create({
    data: { organizationId: org.id, firstName: "P", lastName: "One", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" },
  });
  const player = await ctx.prisma.player.create({
    data: { organizationId: org.id, athleteId: athlete.id, seasonId: season.id, seasonClubId: seasonClub.id, position: "Point guard", heightCm: 185, weightKg: 80 },
  });
  return { org, user, seasonClub, otherSeasonClub, player };
}

// Mirror of the migration's hand-authored partial index (see the file header). Schema-qualified on
// purpose: raw SQL through the scoped client would otherwise target `public`.
async function installPartialUniqueIndex(ctx: TestDbContext) {
  await ctx.prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "CoachingPlan_one_active_per_player" ON "${ctx.schemaName}"."CoachingPlan"("organizationId", "playerId") WHERE "status" = 'ACTIVE'`,
  );
}

test("adopting once stores the frozen snapshot as ACTIVE with an audit entry", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, user, seasonClub, player } = await seed(ctx);
    const plan = planFor(player.id, seasonClub.id);

    const result = await adoptCoachingPlan(ctx.prisma, {
      organizationId: org.id,
      userId: user.id,
      seasonClubId: seasonClub.id,
      playerId: player.id,
      plan,
      note: "  Agreed with the player  ",
    });

    assert.equal(result.ok, true);
    const rows = await ctx.prisma.coachingPlan.findMany({ where: { playerId: player.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "ACTIVE");
    assert.equal(rows[0].planVersion, buildCoachingPlanSnapshot(plan).version);
    assert.equal(rows[0].reviewWindowGames, 6);
    assert.equal(rows[0].note, "Agreed with the player", "the note is trimmed");
    assert.equal(rows[0].supersedesId, null);

    // The snapshot is the frozen engine output, not a live reference.
    const stored = rows[0].focusAreas as unknown as ReturnType<typeof buildCoachingPlanSnapshot>;
    assert.equal(stored.focusAreas[0].metricKey, "game.ft_pct");
    assert.equal(stored.focusAreas[0].target.value, 0.72);
    assert.equal(stored.focusAreas[0].drills[0].id, "ft_routine");

    const adoptedAudit = await ctx.prisma.auditLog.findMany({ where: { entityId: rows[0].id, action: COACHING_PLAN_ADOPTED_AUDIT_ACTION } });
    assert.equal(adoptedAudit.length, 1);
    assert.equal(adoptedAudit[0].userId, user.id);
  } finally {
    await ctx.teardown();
  }
});

test("adopting again supersedes the previous plan and leaves exactly one ACTIVE row (the partial unique index holds)", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, user, seasonClub, player } = await seed(ctx);
    await installPartialUniqueIndex(ctx);

    const first = await adoptCoachingPlan(ctx.prisma, {
      organizationId: org.id, userId: user.id, seasonClubId: seasonClub.id, playerId: player.id, plan: planFor(player.id, seasonClub.id),
    });
    assert.equal(first.ok, true);
    const second = await adoptCoachingPlan(ctx.prisma, {
      organizationId: org.id,
      userId: user.id,
      seasonClubId: seasonClub.id,
      playerId: player.id,
      plan: planFor(player.id, seasonClub.id, {
        focusAreas: [focusArea({ dimension: "BALL_SECURITY", label: "Ball security", target: { ...focusArea().target, metricKey: "game.tov_pg" } })],
      }),
    });
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;

    assert.equal(second.supersededPlanId, first.planId);
    const rows = await ctx.prisma.coachingPlan.findMany({ where: { playerId: player.id }, orderBy: { adoptedAt: "asc" } });
    assert.equal(rows.length, 2, "history is kept, not overwritten");
    assert.equal(rows[0].status, "SUPERSEDED");
    assert.ok(rows[0].closedAt, "the superseded plan records when it was closed");
    assert.equal(rows[1].status, "ACTIVE");
    assert.equal(rows[1].supersedesId, first.planId);
    assert.equal(await ctx.prisma.coachingPlan.count({ where: { playerId: player.id, status: "ACTIVE" } }), 1);

    const supersededAudit = await ctx.prisma.auditLog.findMany({ where: { entityId: first.planId, action: COACHING_PLAN_SUPERSEDED_AUDIT_ACTION } });
    assert.equal(supersededAudit.length, 1);

    const active = await loadActiveCoachingPlan(org.id, player.id, ctx.prisma);
    assert.equal(active?.id, second.planId);
    assert.equal(active?.snapshot?.focusAreas[0].metricKey, "game.tov_pg");
  } finally {
    await ctx.teardown();
  }
});

test("the partial unique index itself rejects a second ACTIVE plan for the same player", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, user, seasonClub, player } = await seed(ctx);
    await installPartialUniqueIndex(ctx);

    const base = { organizationId: org.id, playerId: player.id, seasonClubId: seasonClub.id, planVersion: "c1-1", focusAreas: {}, reviewWindowGames: 6, adoptedById: user.id };
    await ctx.prisma.coachingPlan.create({ data: { ...base, status: "ACTIVE" } });

    await assert.rejects(
      () => ctx.prisma.coachingPlan.create({ data: { ...base, status: "ACTIVE" } }),
      (error: unknown) => {
        // A P2002 from the partial index is the proof the constraint exists and is doing the work -
        // without it, "one current plan" would rest on the reading code alone.
        assert.equal((error as { code?: string }).code, "P2002");
        return true;
      },
    );

    // A CLOSED status is allowed alongside the ACTIVE one: only ACTIVE is constrained.
    await ctx.prisma.coachingPlan.create({ data: { ...base, status: "SUPERSEDED", closedAt: new Date() } });
    assert.equal(await ctx.prisma.coachingPlan.count({ where: { playerId: player.id } }), 2);
  } finally {
    await ctx.teardown();
  }
});

test("a plan with no focus areas is refused without writing anything", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, user, seasonClub, player } = await seed(ctx);

    const result = await adoptCoachingPlan(ctx.prisma, {
      organizationId: org.id,
      userId: user.id,
      seasonClubId: seasonClub.id,
      playerId: player.id,
      plan: planFor(player.id, seasonClub.id, { status: "INSUFFICIENT_DATA", focusAreas: [] }),
    });

    assert.deepEqual(result, { ok: false, error: "PLAN_NOT_ADOPTABLE" });
    assert.equal(await ctx.prisma.coachingPlan.count({ where: { playerId: player.id } }), 0);
    assert.equal(await ctx.prisma.auditLog.count({ where: { entityType: "CoachingPlan" } }), 0);
  } finally {
    await ctx.teardown();
  }
});

test("a player who is not on the named club's roster is refused", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, user, otherSeasonClub, player } = await seed(ctx);

    const result = await adoptCoachingPlan(ctx.prisma, {
      organizationId: org.id,
      userId: user.id,
      seasonClubId: otherSeasonClub.id, // the player belongs to the OTHER season club
      playerId: player.id,
      plan: planFor(player.id, otherSeasonClub.id),
    });

    assert.deepEqual(result, { ok: false, error: "PLAYER_NOT_ON_ROSTER" });
    assert.equal(await ctx.prisma.coachingPlan.count(), 0);
  } finally {
    await ctx.teardown();
  }
});

test("a plan built for a different player is refused even when the roster check passes", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, user, seasonClub, player } = await seed(ctx);

    const result = await adoptCoachingPlan(ctx.prisma, {
      organizationId: org.id,
      userId: user.id,
      seasonClubId: seasonClub.id,
      playerId: player.id,
      plan: planFor("someone-else", seasonClub.id),
    });

    assert.deepEqual(result, { ok: false, error: "PLAN_NOT_ADOPTABLE" });
    assert.equal(await ctx.prisma.coachingPlan.count(), 0);
  } finally {
    await ctx.teardown();
  }
});
