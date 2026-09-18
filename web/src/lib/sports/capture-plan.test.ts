import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { BASKETBALL_STAT_PANEL_KEYS, captureActionFor, capturePlan, nonScoringCapturePlan, scoringActions } from "@/lib/sports/capture-plan";

test("capture plan groups actions by category in definition order", () => {
  const plan = capturePlan(VOLLEYBALL);
  const categories = plan.map((entry) => entry.category);
  assert.ok(categories.includes("SERVE"));
  assert.ok(categories.includes("ATTACK"));
  // stable: no duplicate category groups
  assert.equal(new Set(categories).size, categories.length);

  const serve = plan.find((entry) => entry.category === "SERVE")!;
  const ace = serve.actions.find((action) => action.key === "ACE")!;
  assert.equal(ace.scores, true);
  assert.deepEqual(ace.pointValues, [1]);
});

test("scoring actions expose the sport's point values", () => {
  assert.deepEqual(
    scoringActions(BASKETBALL).map((action) => action.key).sort(),
    ["FREE_THROW_MADE", "SHOT_MADE"],
  );
  const shot = scoringActions(BASKETBALL).find((action) => action.key === "SHOT_MADE")!;
  assert.deepEqual(shot.pointValues, [1, 2, 3, 4]);

  assert.deepEqual(
    scoringActions(VOLLEYBALL).map((action) => action.key).sort(),
    ["ACE", "BLOCK", "KILL", "RALLY_POINT"],
  );
});

test("captureActionFor resolves a single action or undefined", () => {
  assert.equal(captureActionFor(BASKETBALL, "SHOT_MADE")?.label, "Shot made");
  assert.equal(captureActionFor(BASKETBALL, "NOPE"), undefined);
});

test("the catalog panel drops scoring events when a dedicated scorer owns the scoreline", () => {
  const plan = nonScoringCapturePlan(VOLLEYBALL, { scoringHandledElsewhere: true });
  const keys = plan.flatMap((group) => group.actions.map((action) => action.key));
  assert.equal(keys.includes("ACE"), false); // scores through the SETS module
  assert.equal(keys.includes("KILL"), false);
  assert.equal(keys.includes("SUBSTITUTION"), true); // non-scoring event stays

  // When nothing else owns the scoreline the full plan is kept.
  const full = nonScoringCapturePlan(VOLLEYBALL, { scoringHandledElsewhere: false });
  assert.equal(full.flatMap((group) => group.actions.map((action) => action.key)).includes("ACE"), true);
});

test("no catalog group is left empty after filtering", () => {
  const plan = nonScoringCapturePlan(BASKETBALL, { scoringHandledElsewhere: true });
  assert.ok(plan.every((group) => group.actions.length > 0));
});

test("system categories never become scorer buttons", () => {
  for (const definition of [BASKETBALL, VOLLEYBALL]) {
    const plan = nonScoringCapturePlan(definition, { scoringHandledElsewhere: true });
    const categories = plan.map((group) => group.category);
    assert.equal(categories.includes("LIFECYCLE"), false);
    assert.equal(categories.includes("CORRECTION"), false);
    // and no lifecycle/correction event keys leak through under another category
    const keys = plan.flatMap((group) => group.actions.map((action) => action.key));
    assert.equal(keys.some((key) => key.startsWith("GAME_") || key.startsWith("PERIOD_")), false);
  }
});

test("events owned by another panel are not offered twice", () => {
  const plan = nonScoringCapturePlan(BASKETBALL, {
    scoringHandledElsewhere: true,
    excludeKeys: BASKETBALL_STAT_PANEL_KEYS,
  });
  const keys = plan.flatMap((group) => group.actions.map((action) => action.key));
  for (const owned of BASKETBALL_STAT_PANEL_KEYS) {
    assert.equal(keys.includes(owned), false, `${owned} must not appear in the catalog panel`);
  }
  // Whatever remains is genuinely catalog-only capture (e.g. shot attempts, timeouts).
  assert.ok(keys.includes("TIMEOUT") || keys.includes("SHOT_ATTEMPT"));
});
