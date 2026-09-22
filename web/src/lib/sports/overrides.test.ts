import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import {
  SportOverrideError,
  applySportOverride,
  parseSportOverride,
  validateSportOverride,
} from "@/lib/sports/overrides";

test("override schema rejects malformed configurations", () => {
  assert.equal(parseSportOverride({ rules: { ULTRA_TIME_MULTIPLIER: 3 } }).rules?.ULTRA_TIME_MULTIPLIER, 3);
  assert.throws(() => parseSportOverride({ rules: { X: {} } }), SportOverrideError);
  assert.throws(() => parseSportOverride({ rules: "nope" }), SportOverrideError);
  assert.throws(() => parseSportOverride({ defaultDivisions: [1] }), SportOverrideError);
});

test("override validation enforces declared rule keys and value types", () => {
  assert.deepEqual(validateSportOverride(BASKETBALL, { rules: { ULTRA_TIME_MULTIPLIER: 3 } }), []);
  assert.ok(
    validateSportOverride(BASKETBALL, { rules: { NOT_A_RULE: 1 } }).some((issue) => issue.includes("Unknown rule")),
  );
  assert.ok(
    validateSportOverride(BASKETBALL, { rules: { ULTRA_TIME_MULTIPLIER: "three" } }).some((issue) =>
      issue.includes("must be a number"),
    ),
  );
});

test("applySportOverride merges declared values and replaces default divisions without mutating the base", () => {
  const applied = applySportOverride(BASKETBALL, {
    rules: { ULTRA_TIME_MULTIPLIER: 3 },
    defaultDivisions: ["Open"],
  });

  assert.equal(applied.rules?.find((rule) => rule.key === "ULTRA_TIME_MULTIPLIER")?.value, 3);
  assert.equal(applied.rules?.find((rule) => rule.key === "ULTRA_TIME_THRESHOLD_SECONDS")?.value, 60);
  assert.deepEqual(applied.defaultDivisions, ["Open"]);

  assert.equal(BASKETBALL.rules?.find((rule) => rule.key === "ULTRA_TIME_MULTIPLIER")?.value, 2);
  assert.deepEqual(BASKETBALL.defaultDivisions, ["Men's", "Women's"]);
});

test("applySportOverride ignores undeclared keys", () => {
  const applied = applySportOverride(BASKETBALL, { rules: { NOT_A_RULE: 1 } });
  assert.equal(applied.rules?.some((rule) => rule.key === "NOT_A_RULE"), false);
  assert.equal(applied.rules?.length, BASKETBALL.rules?.length);
});

test("standingsPoints override replaces a WIN_DRAW_LOSS model's win/loss points without mutating the base (LBCL: 2 win / 1 loss, not the 3/0 basketball default)", () => {
  assert.deepEqual(validateSportOverride(BASKETBALL, { standingsPoints: { win: 2, loss: 1 } }), []);

  const applied = applySportOverride(BASKETBALL, { standingsPoints: { win: 2, loss: 1 } });
  assert.deepEqual(applied.standings.primaryPoints, { model: "WIN_DRAW_LOSS", win: 2, draw: 0, loss: 1 });
  assert.deepEqual(BASKETBALL.standings.primaryPoints, { model: "WIN_DRAW_LOSS", win: 3, draw: 0, loss: 0 });
});

test("standingsPoints override is rejected for a non-WIN_DRAW_LOSS standings model", () => {
  const cricketLikeStandings = { model: "CRICKET" as const, win: 2, tie: 1, draw: 1, noResult: 0 };
  const definition = { ...BASKETBALL, standings: { ...BASKETBALL.standings, primaryPoints: cricketLikeStandings } };
  const issues = validateSportOverride(definition, { standingsPoints: { win: 2, loss: 1 } });
  assert.ok(issues.some((issue) => issue.includes("WIN_DRAW_LOSS")));
});
