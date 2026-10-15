import { test } from "node:test";
import assert from "node:assert/strict";
import { canViewCoaching, coachingAccessReason, coachedSeasonClubIds, type CoachingViewer } from "./access";

const scope = { organizationId: "org-a", seasonClubId: "club-1" };
const base: CoachingViewer = { email: "someone@example.com", roleAssignments: [], coachedSeasonClubs: [] };

test("anonymous and plain users have no access", () => {
  assert.equal(canViewCoaching(null, scope), false);
  assert.equal(canViewCoaching(base, scope), false);
  assert.equal(canViewCoaching({ ...base, roleAssignments: [{ role: "FAN", organizationId: "org-a" }] }, scope), false);
});

test("COACH role without a club assignment has no access", () => {
  assert.equal(canViewCoaching({ ...base, roleAssignments: [{ role: "COACH", organizationId: "org-a" }] }, scope), false);
});

test("head/assistant coach sees only their own club in their own org", () => {
  const coach = { ...base, coachedSeasonClubs: [{ seasonClubId: "club-1", organizationId: "org-a" }] };
  assert.equal(coachingAccessReason(coach, scope), "CLUB_COACH");
  assert.equal(canViewCoaching(coach, { organizationId: "org-a", seasonClubId: "club-2" }), false);
  assert.equal(canViewCoaching(coach, { organizationId: "org-b", seasonClubId: "club-1" }), false);
});

test("org admins see any club in their org only", () => {
  const op = { ...base, roleAssignments: [{ role: "LEAGUE_OPERATOR", organizationId: "org-a" }] };
  assert.equal(coachingAccessReason(op, scope), "ORG_ADMIN");
  assert.equal(canViewCoaching(op, { organizationId: "org-b", seasonClubId: "x" }), false);
  const td = { ...base, roleAssignments: [{ role: "TOURNAMENT_DIRECTOR", organizationId: "org-a" }] };
  assert.equal(canViewCoaching(td, scope), true);
});

test("super admin sees everything", () => {
  const sa = { ...base, roleAssignments: [{ role: "SUPER_ADMIN", organizationId: null }] };
  assert.equal(coachingAccessReason(sa, { organizationId: "org-z", seasonClubId: "q" }), "SUPER_ADMIN");
});

test("legacy insights override email keeps access", () => {
  assert.equal(coachingAccessReason({ ...base, email: "texdevices@gmail.com" }, scope), "INSIGHTS_OVERRIDE");
});

test("coachedSeasonClubIds filters by organization", () => {
  const coach = {
    ...base,
    coachedSeasonClubs: [
      { seasonClubId: "club-1", organizationId: "org-a" },
      { seasonClubId: "club-9", organizationId: "org-b" },
    ],
  };
  assert.deepEqual(coachedSeasonClubIds(coach, "org-a"), ["club-1"]);
  assert.deepEqual(coachedSeasonClubIds(null, "org-a"), []);
});
