import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_STAFF_PERMISSIONS,
  EVENT_STAFF_ROLE_LIST,
  eventStaffRoleGrants,
  eventStaffRolesGrant,
  isEventStaffRole,
  normalizeEventStaffRole,
  userHasEventPermission,
  type EventStaffGrantReader,
} from "@/lib/event-staff";

test("known roles normalize; unknown labels are inert", () => {
  assert.equal(normalizeEventStaffRole("game_controller"), "GAME_CONTROLLER");
  assert.equal(normalizeEventStaffRole("  Scorekeeper "), "SCOREKEEPER");
  assert.equal(normalizeEventStaffRole("Scorekeeper"), "SCOREKEEPER");
  assert.equal(normalizeEventStaffRole("MC"), null); // staff-planner display label, grants nothing
  assert.equal(normalizeEventStaffRole(""), null);
  assert.equal(isEventStaffRole("GAME_CONTROLLER"), true);
  assert.equal(isEventStaffRole("Referee"), false);
});

test("the role ladder grants a decreasing set of game-day permissions", () => {
  // Only the event admin may touch the schedule.
  assert.equal(eventStaffRoleGrants("EVENT_ADMIN", "fixture:manage"), true);
  assert.equal(eventStaffRoleGrants("GAME_CONTROLLER", "fixture:manage"), false);

  // The game controller confirms the result; a scorekeeper scores but does not confirm.
  assert.equal(eventStaffRoleGrants("GAME_CONTROLLER", "result:confirm"), true);
  assert.equal(eventStaffRoleGrants("SCOREKEEPER", "result:confirm"), false);
  assert.equal(eventStaffRoleGrants("SCOREKEEPER", "game:operate"), true);

  // A statistician records stats and nothing else.
  assert.equal(eventStaffRoleGrants("STATISTICIAN", "game:record-stats"), true);
  assert.equal(eventStaffRoleGrants("STATISTICIAN", "game:operate"), false);

  // No event role ever grants organization-level administration.
  for (const role of EVENT_STAFF_ROLE_LIST) {
    assert.equal(eventStaffRoleGrants(role, "event:manage"), false);
    assert.equal(eventStaffRoleGrants(role, "staff:manage"), false);
  }
});

test("role lists inherit nothing unexpected", () => {
  for (const role of EVENT_STAFF_ROLE_LIST) {
    const permissions = EVENT_STAFF_PERMISSIONS[role] as readonly string[];
    assert.ok(permissions.includes("public:view"), `${role} should keep public:view`);
  }
  assert.equal(eventStaffRolesGrant(["MC", "Scorekeeper"], "game:operate"), true);
  assert.equal(eventStaffRolesGrant(["MC", "Photographer"], "game:operate"), false);
});

function reader(rows: { role: string }[]): EventStaffGrantReader {
  return {
    eventStaffAssignment: {
      findMany: async () => rows,
    },
  };
}

test("a user's event grant is evaluated per permission", async () => {
  const db = reader([{ role: "SCOREKEEPER" }]);
  assert.equal(await userHasEventPermission("u1", "org1", "event1", "game:operate", db), true);
  assert.equal(await userHasEventPermission("u1", "org1", "event1", "result:confirm", db), false);
});

test("with no assignment the user has nothing", async () => {
  const db = reader([]);
  assert.equal(await userHasEventPermission("u1", "org1", "event1", "game:operate", db), false);
});
