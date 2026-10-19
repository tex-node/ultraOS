import { test } from "node:test";
import assert from "node:assert/strict";
import { TENNIS } from "./tennis";
import { applyRuleValues, resolveRuleValues } from "./rule-values";
import { tennisConfig } from "./tennis-scoring";

// Streak v7, Prompt 1: a stored rule set must be able to change what the engine does. The scoring modules read
// their config off the DEFINITION, so an override that is not folded into it is silently ignored - which is
// exactly what was happening to SETS_TO_WIN.

test("the tennis definition defaults to best-of-5", () => {
  assert.equal(tennisConfig(TENNIS)?.setsToWin, 3);
  assert.equal(tennisConfig(TENNIS)?.gamesPerSet, 6);
});

test("applying SETS_TO_WIN=2 makes the engine best-of-3", () => {
  const effective = applyRuleValues(TENNIS, { SETS_TO_WIN: 2 });
  assert.equal(tennisConfig(effective)?.setsToWin, 2);
  // Everything not overridden keeps the definition default.
  assert.equal(tennisConfig(effective)?.gamesPerSet, 6);
  assert.equal(tennisConfig(effective)?.tiebreakEnabled, true);
});

test("the definition is not mutated", () => {
  applyRuleValues(TENNIS, { SETS_TO_WIN: 2, GAMES_PER_SET: 4 });
  assert.equal(tennisConfig(TENNIS)?.setsToWin, 3);
  assert.equal(tennisConfig(TENNIS)?.gamesPerSet, 6);
});

test("an unknown rule key cannot invent a rule", () => {
  const effective = applyRuleValues(TENNIS, { MADE_UP_RULE: 99 });
  assert.deepEqual(effective.rules, TENNIS.rules);
});

test("a value of the wrong type is ignored, not coerced", () => {
  // SETS_TO_WIN is a number; a string "2" must not be accepted as 2.
  const effective = applyRuleValues(TENNIS, { SETS_TO_WIN: "2" });
  assert.equal(tennisConfig(effective)?.setsToWin, 3);
});

test("resolveRuleValues and applyRuleValues agree about the resulting config", () => {
  const config = { SETS_TO_WIN: 2, GAMES_PER_SET: 4, TIEBREAK_ENABLED: false };
  const effective = applyRuleValues(TENNIS, resolveRuleValues(TENNIS, config));
  assert.deepEqual(tennisConfig(effective), { setsToWin: 2, gamesPerSet: 4, tiebreakEnabled: false, setCount: 5 });
});
