import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission, primaryRole } from "@/lib/permissions";

test("gate managers validate entry and nothing else", () => {
  assert.equal(hasPermission(["GATE_MANAGER"], "check-in:operate"), true);
  assert.equal(hasPermission(["GATE_MANAGER"], "public:view"), true);
  assert.equal(hasPermission(["GATE_MANAGER"], "event:manage"), false);
  // Fan capabilities ride along implicitly for every role (normalizeRoles adds FAN).
  assert.equal(hasPermission(["GATE_MANAGER"], "mvp:vote"), true);
  assert.equal(hasPermission(["GATE_MANAGER"], "game:operate"), false);
  assert.equal(hasPermission(["GATE_MANAGER"], "order:manage"), false);
});

test("existing gate-adjacent roles are unchanged", () => {
  assert.equal(hasPermission(["VOLUNTEER"], "check-in:operate"), true);
  assert.equal(hasPermission(["FAN"], "check-in:operate"), false);
  assert.equal(primaryRole(["GATE_MANAGER", "FAN"]), "GATE_MANAGER");
});

test("tournament directors run tournaments but not staff or system", () => {
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "competition:manage"), true);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "fixture:manage"), true);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "game:operate"), true);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "result:confirm"), true);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "event:manage"), true);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "content:manage"), true);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "staff:manage"), false);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "audit:view"), false);
  assert.equal(hasPermission(["TOURNAMENT_DIRECTOR"], "vendor:manage"), false);
  assert.equal(primaryRole(["TOURNAMENT_DIRECTOR", "COACH"]), "TOURNAMENT_DIRECTOR");
});

test("scorekeepers score and nothing else", () => {
  assert.equal(hasPermission(["SCOREKEEPER"], "game:operate"), true);
  assert.equal(hasPermission(["SCOREKEEPER"], "game:record-stats"), true);
  assert.equal(hasPermission(["SCOREKEEPER"], "result:confirm"), false);
  assert.equal(hasPermission(["SCOREKEEPER"], "fixture:manage"), false);
  assert.equal(primaryRole(["SCOREKEEPER", "PLAYER"]), "SCOREKEEPER");
});

test("vendor managers run stalls without fan extras", () => {
  assert.equal(hasPermission(["VENDOR_MANAGER"], "vendor:manage"), true);
  assert.equal(hasPermission(["VENDOR_MANAGER"], "order:manage"), true);
  assert.equal(hasPermission(["VENDOR_MANAGER"], "mvp:vote"), true); // implicit FAN, like every role
  assert.equal(hasPermission(["VENDOR_MANAGER"], "event:manage"), false);
  assert.equal(hasPermission(["VENDOR_MANAGER"], "game:operate"), false);
  assert.equal(primaryRole(["VENDOR_MANAGER", "FAN"]), "VENDOR_MANAGER");
});
