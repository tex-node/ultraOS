import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { BASKETBALL_PRESETS, getBasketballPreset, matchBasketballPreset } from "@/lib/sports/basketball-formats";
import {
  LEGACY_STRUCTURE,
  clockModeLabel,
  isFinalPeriod,
  normalizeClockMode,
  periodLabelFor,
  structureFromRules,
} from "@/lib/sports/game-structure";

test("with no rules the structure falls back to the definition (Ultra shape)", () => {
  const structure = structureFromRules({ structure: BASKETBALL.structure });
  assert.deepEqual(structure, LEGACY_STRUCTURE);
});

test("period count, minutes, shot clock and clock mode come from the rules", () => {
  const structure = structureFromRules({
    structure: BASKETBALL.structure,
    rules: {
      PERIOD_COUNT: 4,
      PERIOD_MINUTES: 12,
      OVERTIME_MINUTES: 5,
      SHOT_CLOCK_SECONDS: 24,
      CLOCK_MODE: "STOPPAGE",
    },
  });
  assert.deepEqual(structure, {
    periodCount: 4,
    periodSeconds: 720,
    overtimeSeconds: 300,
    shotClockSeconds: 24,
    clockMode: "STOPPAGE",
  });
});

test("junk rule values are ignored rather than producing a broken clock", () => {
  const structure = structureFromRules({
    structure: BASKETBALL.structure,
    rules: { PERIOD_MINUTES: 0, SHOT_CLOCK_SECONDS: "abc", CLOCK_MODE: "SOMETIMES" },
  });
  assert.equal(structure.periodSeconds, 600);
  assert.equal(structure.shotClockSeconds, 20);
  assert.equal(structure.clockMode, "RUNNING");
  assert.equal(normalizeClockMode("STOPPAGE"), "STOPPAGE");
  assert.equal(normalizeClockMode(undefined), "RUNNING");
});

test("periods are labelled for the format in play", () => {
  const quarters = { periodCount: 4 };
  assert.equal(periodLabelFor(1, "LIVE", quarters), "Q1");
  assert.equal(periodLabelFor(4, "LIVE", quarters), "Q4");
  assert.equal(periodLabelFor(5, "LIVE", quarters), "OT1");
  assert.equal(periodLabelFor(4, "FINAL", quarters), "FINAL");

  const halves = { periodCount: 2 };
  assert.equal(periodLabelFor(1, "LIVE", halves), "HALF 1");
  assert.equal(periodLabelFor(2, "LIVE", halves), "HALF 2");
  assert.equal(periodLabelFor(3, "LIVE", halves), "OT1");

  assert.equal(isFinalPeriod(4, quarters), true);
  assert.equal(isFinalPeriod(3, quarters), false);
});

test("clock mode labels are human readable", () => {
  assert.equal(clockModeLabel("STOPPAGE"), "Stopped clock");
  assert.equal(clockModeLabel("RUNNING"), "Running clock");
});

test("every preset is complete and resolvable", () => {
  for (const preset of BASKETBALL_PRESETS) {
    const structure = structureFromRules({
      structure: BASKETBALL.structure,
      rules: preset.ruleValues,
    });
    assert.equal(structure.periodCount, preset.ruleValues.PERIOD_COUNT);
    assert.equal(structure.periodSeconds, Number(preset.ruleValues.PERIOD_MINUTES) * 60);
    assert.equal(getBasketballPreset(preset.key)?.key, preset.key);
    assert.equal(matchBasketballPreset(preset.ruleValues)?.key, preset.key);
  }
  assert.equal(getBasketballPreset("NOPE"), null);
});

test("standard presets stop the clock and drop the four-point shot", () => {
  const fiba = getBasketballPreset("FIBA_4X10")!;
  assert.equal(fiba.ruleValues.CLOCK_MODE, "STOPPAGE");
  assert.equal(fiba.ruleValues.FOUR_POINT_ENABLED, false);
  assert.equal(fiba.ruleValues.ULTRA_TIME_ENABLED, false);

  const ultra = getBasketballPreset("ULTRA")!;
  assert.equal(ultra.ruleValues.CLOCK_MODE, "RUNNING");
  assert.equal(ultra.ruleValues.FOUR_POINT_ENABLED, true);
});
