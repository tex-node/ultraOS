import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import { heightField, positionField } from "@/lib/coaching/squad-setup";
import { applySquadSetup, SQUAD_SETUP_AUDIT_ACTION } from "./squad-setup";

async function seed(ctx: TestDbContext) {
  const p = ctx.prisma;
  const org = await p.organization.create({ data: { name: "Test Org", slug: "test-org" } });
  const sport = await p.sport.create({ data: { name: "Test Sport", slug: "test-sport" } });
  const competition = await p.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: "C", slug: "c" } });
  const division = await p.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: "D", slug: "d" } });
  const season = await p.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: "S", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
  const ours = await p.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Ours", shortName: "OUR" } });
  const theirs = await p.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Theirs", shortName: "THR" } });
  const ourSc = await p.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: ours.id, divisionId: division.id } });
  const theirSc = await p.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: theirs.id, divisionId: division.id } });
  const user = await p.user.create({ data: { name: "Coach", email: "coach@example.test" } });
  const mk = async (first: string, seasonClubId: string) => {
    const athlete = await p.athlete.create({ data: { organizationId: org.id, firstName: first, lastName: "X", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" } });
    return p.player.create({ data: { organizationId: org.id, athleteId: athlete.id, seasonId: season.id, seasonClubId, position: "Unknown", heightCm: 0, weightKg: 80 } });
  };
  const a = await mk("A", ourSc.id);
  const b = await mk("B", ourSc.id);
  const other = await mk("Other", theirSc.id);
  return { org, ourSc, user, a, b, other };
}

test("applies position/height to this club's roster only, one audit entry per changed player", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, ourSc, user, a, b, other } = await seed(ctx);
    const values = {
      [positionField(a.id)]: "PG", [heightField(a.id)]: "182",
      [positionField(b.id)]: "", [heightField(b.id)]: "",
      [positionField(other.id)]: "C", [heightField(other.id)]: "205", // another club's player: must be ignored
    };
    const result = await ctx.prisma.$transaction((tx) => applySquadSetup(tx, { organizationId: org.id, seasonClubId: ourSc.id, userId: user.id, values }));
    assert.deepEqual(result, { ok: true, changed: 1 });

    const after = await ctx.prisma.player.findMany({ where: { id: { in: [a.id, b.id, other.id] } }, select: { id: true, position: true, heightCm: true } });
    const byId = new Map(after.map((p) => [p.id, p]));
    assert.deepEqual([byId.get(a.id)?.position, byId.get(a.id)?.heightCm], ["PG", 182]);
    assert.deepEqual([byId.get(b.id)?.position, byId.get(b.id)?.heightCm], ["Unknown", 0], "blank means unchanged");
    assert.deepEqual([byId.get(other.id)?.position, byId.get(other.id)?.heightCm], ["Unknown", 0], "other club untouched");

    const audits = await ctx.prisma.auditLog.findMany({ where: { action: SQUAD_SETUP_AUDIT_ACTION } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].entityId, a.id);
    assert.equal(audits[0].userId, user.id);
    assert.equal(audits[0].organizationId, org.id);

    // Re-submitting identical values changes nothing and writes no further audit entries.
    const again = await ctx.prisma.$transaction((tx) => applySquadSetup(tx, { organizationId: org.id, seasonClubId: ourSc.id, userId: user.id, values }));
    assert.deepEqual(again, { ok: true, changed: 0 });
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: SQUAD_SETUP_AUDIT_ACTION } }), 1);
  } finally {
    await ctx.teardown();
  }
});

test("invalid values write nothing at all", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, ourSc, user, a, b } = await seed(ctx);
    const values = { [positionField(a.id)]: "PG", [heightField(a.id)]: "182", [positionField(b.id)]: "Striker" };
    const result = await ctx.prisma.$transaction((tx) => applySquadSetup(tx, { organizationId: org.id, seasonClubId: ourSc.id, userId: user.id, values }));
    assert.equal(result.ok, false);
    const unchanged = await ctx.prisma.player.findUniqueOrThrow({ where: { id: a.id }, select: { position: true, heightCm: true } });
    assert.deepEqual([unchanged.position, unchanged.heightCm], ["Unknown", 0], "a valid row is not saved when another row is invalid");
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: SQUAD_SETUP_AUDIT_ACTION } }), 0);
  } finally {
    await ctx.teardown();
  }
});
