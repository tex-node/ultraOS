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
