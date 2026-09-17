import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_CONTROL_ROLE_LIST,
  gameControlRoleGrants,
  gameControlRolesGrant,
  grantApplies,
  hasGameControlPermission,
  normalizeGameControlRole,
  parseGrantScope,
  userHasGameControlPermission,
  type GameControlGrantLike,
  type GameControlGrantReader,
} from "@/lib/game-access";

function grant(partial: Partial<GameControlGrantLike> & { role: string }): GameControlGrantLike {
  return { competitionId: null, seasonId: null, eventId: null, revokedAt: null, ...partial };
}

test("known roles normalize; unknown labels are inert", () => {
  assert.equal(normalizeGameControlRole("game_controller"), "GAME_CONTROLLER");
  assert.equal(normalizeGameControlRole("  Scorekeeper "), "SCOREKEEPER");
  assert.equal(normalizeGameControlRole("MC"), null);
  assert.equal(normalizeGameControlRole(""), null);
});

test("the role ladder grants a decreasing set of game-day permissions", () => {
  assert.equal(gameControlRoleGrants("EVENT_ADMIN", "fixture:manage"), true);
  assert.equal(gameControlRoleGrants("GAME_CONTROLLER", "fixture:manage"), false);
  assert.equal(gameControlRoleGrants("GAME_CONTROLLER", "result:confirm"), true);
  assert.equal(gameControlRoleGrants("SCOREKEEPER", "result:confirm"), false);
  assert.equal(gameControlRoleGrants("SCOREKEEPER", "game:operate"), true);
  assert.equal(gameControlRoleGrants("STATISTICIAN", "game:record-stats"), true);
  assert.equal(gameControlRoleGrants("STATISTICIAN", "game:operate"), false);

  // No game-control role ever grants organization administration.
  for (const role of GAME_CONTROL_ROLE_LIST) {
    assert.equal(gameControlRoleGrants(role, "event:manage"), false);
    assert.equal(gameControlRoleGrants(role, "staff:manage"), false);
  }
});

test("a competition-scoped grant applies to that competition's fixtures only", () => {
  const g = grant({ role: "GAME_CONTROLLER", competitionId: "comp-1" });
  assert.equal(grantApplies(g, { competitionId: "comp-1", seasonId: "s1" }, "game:operate"), true);
  assert.equal(grantApplies(g, { competitionId: "comp-2", seasonId: "s2" }, "game:operate"), false);
  assert.equal(grantApplies(g, { seasonId: "s1" }, "game:operate"), false); // no competition in scope
});

test("season and event grants match their own scope", () => {
  const seasonGrant = grant({ role: "SCOREKEEPER", seasonId: "s1" });
  assert.equal(grantApplies(seasonGrant, { competitionId: "comp-9", seasonId: "s1" }, "game:operate"), true);
  assert.equal(grantApplies(seasonGrant, { seasonId: "s2" }, "game:operate"), false);

  const eventGrant = grant({ role: "STATISTICIAN", eventId: "ev-1" });
  assert.equal(grantApplies(eventGrant, { eventId: "ev-1" }, "game:record-stats"), true);
  assert.equal(grantApplies(eventGrant, { eventId: "ev-2" }, "game:record-stats"), false);
});

test("an organization-wide grant (no scope) applies everywhere", () => {
  const g = grant({ role: "GAME_CONTROLLER" });
  assert.equal(grantApplies(g, {}, "game:operate"), true);
  assert.equal(grantApplies(g, { competitionId: "any" }, "game:operate"), true);
});

test("a revoked grant never applies, and the role still has to grant the permission", () => {
  const revoked = grant({ role: "GAME_CONTROLLER", competitionId: "comp-1", revokedAt: new Date() });
  assert.equal(grantApplies(revoked, { competitionId: "comp-1" }, "game:operate"), false);

  const statistician = grant({ role: "STATISTICIAN", competitionId: "comp-1" });
  assert.equal(grantApplies(statistician, { competitionId: "comp-1" }, "game:operate"), false);
  assert.equal(grantApplies(statistician, { competitionId: "comp-1" }, "game:record-stats"), true);
});

test("any matching grant is enough", () => {
  const grants = [
    grant({ role: "STATISTICIAN", competitionId: "comp-1" }),
    grant({ role: "SCOREKEEPER", seasonId: "s9" }),
  ];
  assert.equal(hasGameControlPermission(grants, { competitionId: "comp-1" }, "game:operate"), false);
  assert.equal(hasGameControlPermission(grants, { seasonId: "s9" }, "game:operate"), true);
});

test("role lists inherit public:view", () => {
  for (const role of GAME_CONTROL_ROLE_LIST) {
    assert.equal(gameControlRoleGrants(role, "public:view"), true);
  }
  assert.equal(gameControlRolesGrant(["MC", "Scorekeeper"], "game:operate"), true);
  assert.equal(gameControlRolesGrant(["MC", "Photographer"], "game:operate"), false);
});

function reader(rows: GameControlGrantLike[]): GameControlGrantReader {
  return { gameControlGrant: { findMany: async () => rows } };
}

test("dashboard scope values parse to a single scope", () => {
  assert.deepEqual(parseGrantScope("org"), { competitionId: null, seasonId: null, eventId: null });
  assert.deepEqual(parseGrantScope("competition:comp-1"), { competitionId: "comp-1", seasonId: null, eventId: null });
  assert.deepEqual(parseGrantScope("season:s-1"), { competitionId: null, seasonId: "s-1", eventId: null });
  assert.deepEqual(parseGrantScope("event:e-1"), { competitionId: null, seasonId: null, eventId: "e-1" });
  assert.equal(parseGrantScope("competition:"), null);
  assert.equal(parseGrantScope("nonsense"), null);
  assert.equal(parseGrantScope("division:d-1"), null);
});

test("the reader is scoped per permission and per target", async () => {
  const db = reader([grant({ role: "SCOREKEEPER", competitionId: "comp-1" })]);
  assert.equal(
    await userHasGameControlPermission("u1", "org1", { competitionId: "comp-1" }, "game:operate", db),
    true,
  );
  assert.equal(
    await userHasGameControlPermission("u1", "org1", { competitionId: "comp-1" }, "result:confirm", db),
    false,
  );
  assert.equal(
    await userHasGameControlPermission("u1", "org1", { competitionId: "comp-9" }, "game:operate", db),
    false,
  );
});
