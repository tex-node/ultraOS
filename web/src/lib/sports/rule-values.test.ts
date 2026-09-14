import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import {
  freezeRuleValues,
  parseRuleConfig,
  resolveRuleValues,
  ruleConfigFromLegacy,
  validateRuleConfig,
} from "@/lib/sports/rule-values";

test("parseRuleConfig accepts a flat map and rejects malformed input", () => {
  assert.deepEqual(parseRuleConfig({ ULTRA_TIME_MULTIPLIER: 3 }), { ULTRA_TIME_MULTIPLIER: 3 });
  assert.deepEqual(parseRuleConfig(null), {});
  assert.throws(() => parseRuleConfig({ A: { nested: true } }));
});

test("validateRuleConfig enforces declared keys and value types", () => {
  assert.deepEqual(validateRuleConfig(BASKETBALL, { ULTRA_TIME_MULTIPLIER: 3 }), []);
  assert.ok(validateRuleConfig(BASKETBALL, { NOT_A_RULE: 1 }).some((issue) => issue.includes("Unknown rule")));
  assert.ok(
    validateRuleConfig(BASKETBALL, { ULTRA_TIME_MULTIPLIER: "three" }).some((issue) =>
      issue.includes("must be a number"),
    ),
  );
});

test("resolveRuleValues applies valid overrides over definition defaults", () => {
  const values = resolveRuleValues(BASKETBALL, {
    ULTRA_TIME_MULTIPLIER: 3,
    NOT_A_RULE: 9,
    FOUR_POINT_BASE_VALUE: "four" as unknown as number,
  });
  assert.equal(values.ULTRA_TIME_MULTIPLIER, 3);
  assert.equal(values.ULTRA_TIME_THRESHOLD_SECONDS, 60);
  assert.equal(values.MANDATORY_SUBSTITUTION_POLICY, "AT_LEAST_ONE_PER_HALF");
  assert.equal(values.NOT_A_RULE, undefined);
  // type mismatch ignored, falls back to default
  assert.equal(values.FOUR_POINT_BASE_VALUE, 4);
});

test("ruleConfigFromLegacy maps legacy columns and keeps defaults for the rest", () => {
  const config = ruleConfigFromLegacy(BASKETBALL, {
    ultraTimeMultiplier: 3,
    fourPointBaseValue: 5,
    ultraTimeStartRemainingSeconds: null,
  });
  assert.equal(config.ULTRA_TIME_MULTIPLIER, 3);
  assert.equal(config.FOUR_POINT_BASE_VALUE, 5);
  assert.equal(config.ULTRA_TIME_THRESHOLD_SECONDS, 60);
  assert.equal(config.MANDATORY_SUBSTITUTION_POLICY, "AT_LEAST_ONE_PER_HALF");
});

test("freezeRuleValues captures sport key, definition version, and resolved values", () => {
  const frozen = freezeRuleValues(BASKETBALL, { ULTRA_TIME_MULTIPLIER: 3 });
  assert.equal(frozen.sportKey, "BASKETBALL");
  assert.equal(frozen.definitionVersion, BASKETBALL.version);
  assert.equal(frozen.values.ULTRA_TIME_MULTIPLIER, 3);
});
