import assert from "node:assert/strict";
import test from "node:test";
import { createTestDbContext, type TestDbContext } from "@/test-support/db-test-context";
import { canViewCoaching, coachedSeasonClubIds } from "@/lib/coaching/access";
import { loadCoachingViewer } from "./viewer";

async function seed(ctx: TestDbContext) {
  const p = ctx.prisma;
  const org = await p.organization.create({ data: { name: "Test Org", slug: "test-org" } });
  const other = await p.organization.create({ data: { name: "Other Org", slug: "other-org", idPrefixAthlete: "OTA", idPrefixStaff: "OTS" } });
  const sport = await p.sport.create({ data: { name: "Test Sport", slug: "test-sport" } });
  const competition = await p.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: "C", slug: "c" } });
  const division = await p.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: "D", slug: "d" } });
  const season = await p.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: "S", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
  const clubA = await p.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "A", shortName: "A" } });
  const clubB = await p.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "B", shortName: "B" } });
  const clubC = await p.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "C", shortName: "C" } });
  const head = await p.user.create({ data: { name: "Head", email: "head@example.test" } });
  const assistant = await p.user.create({ data: { name: "Assistant", email: "assistant@example.test" } });
  const revoked = await p.user.create({ data: { name: "Revoked", email: "revoked@example.test" } });
  const headStaff = await p.staff.create({ data: { organizationId: org.id, name: "Head", role: "HEAD_COACH", userId: head.id } });
  const assistantStaff = await p.staff.create({ data: { organizationId: org.id, name: "Assistant", role: "ASSISTANT_COACH", userId: assistant.id } });
  const scA = await p.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: clubA.id, divisionId: division.id, headCoachId: headStaff.id } });
  const scB = await p.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: clubB.id, divisionId: division.id, assistantCoachId: assistantStaff.id } });
  const scC = await p.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: clubC.id, divisionId: division.id } });
  await p.userRoleAssignment.create({ data: { userId: head.id, role: "COACH", organizationId: org.id } });
  await p.userRoleAssignment.create({ data: { userId: revoked.id, role: "LEAGUE_OPERATOR", organizationId: org.id, revokedAt: new Date("2026-02-01") } });
  await p.userRoleAssignment.create({ data: { userId: assistant.id, role: "TOURNAMENT_DIRECTOR", organizationId: other.id } });
  return { org, other, scA, scB, scC };
}

test("head coach, assistant coach, revoked role and anonymous session", async () => {
  const ctx = await createTestDbContext();
  try {
    const { org, other, scA, scB, scC } = await seed(ctx);
    const scope = (seasonClubId: string) => ({ organizationId: org.id, seasonClubId });

    assert.equal(await loadCoachingViewer(null, ctx.prisma), null, "anonymous has no viewer");
    assert.equal(await loadCoachingViewer({ user: { email: null } }, ctx.prisma), null);

    const head = await loadCoachingViewer({ user: { email: "head@example.test" } }, ctx.prisma);
    assert.deepEqual(head?.coachedSeasonClubs, [{ seasonClubId: scA.id, organizationId: org.id }]);
    assert.ok(canViewCoaching(head, scope(scA.id)));
    assert.ok(!canViewCoaching(head, scope(scB.id)), "a head coach does not see other clubs");
    assert.deepEqual(coachedSeasonClubIds(head, org.id), [scA.id]);

    const assistant = await loadCoachingViewer({ user: { email: "assistant@example.test" } }, ctx.prisma);
    assert.deepEqual(assistant?.coachedSeasonClubs, [{ seasonClubId: scB.id, organizationId: org.id }]);
    assert.ok(canViewCoaching(assistant, scope(scB.id)));
    // Their TOURNAMENT_DIRECTOR grant is for a different organization, so it opens nothing here.
    assert.ok(!canViewCoaching(assistant, scope(scC.id)));
    assert.ok(assistant?.roleAssignments.some((r) => r.organizationId === other.id));

    const revoked = await loadCoachingViewer({ user: { email: "revoked@example.test" } }, ctx.prisma);
    assert.deepEqual(revoked?.roleAssignments, [], "revoked grants are not loaded");
    assert.ok(!canViewCoaching(revoked, scope(scA.id)));
  } finally {
    await ctx.teardown();
  }
});
