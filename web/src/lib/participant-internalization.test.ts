import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationType, StaffRole, UserRole } from "@/generated/prisma/enums";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let mod: typeof import("@/lib/participant-internalization") | null = null;

async function load() {
  mod ??= await import("@/lib/participant-internalization");
  return mod;
}

// Application approval (provisionApprovedApplication in applications/actions.ts) and
// Season Zero internalization (internalizeApprovedApplications, scope
// "season-zero-approved-coaches") are two independent entry points that can each
// provision a coach's permanent Staff identity. Both must agree on what a given
// ApplicationType becomes, or the two paths can silently diverge (e.g. one granting
// UserRole.COACH, the other UserRole.OFFICIAL for the same applicant). Both call sites
// import these shared mapping functions rather than each hardcoding their own ternary.
test("coach/scout/official role mapping is identical for every provisioning entry point", async () => {
  const { roleForApplication, staffRoleForApplication } = await load();
  assert.equal(roleForApplication(ApplicationType.COACH), UserRole.COACH);
  assert.equal(staffRoleForApplication(ApplicationType.COACH), StaffRole.HEAD_COACH);
  assert.equal(roleForApplication(ApplicationType.SCOUT), UserRole.SCOUT);
  assert.equal(staffRoleForApplication(ApplicationType.SCOUT), StaffRole.SCOUT);
  assert.equal(roleForApplication(ApplicationType.OFFICIAL), UserRole.OFFICIAL);
  assert.equal(staffRoleForApplication(ApplicationType.OFFICIAL), StaffRole.OFFICIAL);
});

test("isStaffApplication identifies exactly the roles that provision a Staff identity", async () => {
  const { isStaffApplication } = await load();
  assert.equal(isStaffApplication(ApplicationType.COACH), true);
  assert.equal(isStaffApplication(ApplicationType.SCOUT), true);
  assert.equal(isStaffApplication(ApplicationType.OFFICIAL), true);
  assert.equal(isStaffApplication(ApplicationType.VOLUNTEER), true);
  assert.equal(isStaffApplication(ApplicationType.PLAYER), false);
  assert.equal(isStaffApplication(ApplicationType.VENDOR), false);
  assert.equal(isStaffApplication(ApplicationType.MEDIA), false);
});

// Application approval grants a permanent Staff identity ("this person is a
// registered Ultra Basketball coach") independent of any season. Season Zero
// selection (coachSeasonZeroSelectionStatus + coachSeasonZeroDivision) is a
// separate, season-scoped concept layered on top. Selection must never be a
// prerequisite for the permanent identity to exist — only for DraftCoachPoolEntry
// membership, which is enforced separately in internalizeApprovedApplications and
// the coach-pool creation path.
test("roleForApplication and staffRoleForApplication do not depend on Season Zero selection state", async () => {
  const { roleForApplication, staffRoleForApplication } = await load();
  // These are pure functions of ApplicationType alone — no selection status or
  // division parameter exists on their signature, which is the structural
  // guarantee that permanent identity provisioning cannot be season-gated by
  // accident in either code path that calls them.
  assert.equal(roleForApplication.length, 1);
  assert.equal(staffRoleForApplication.length, 1);
});
