import { test } from "node:test";
import assert from "node:assert/strict";
import { TENNIS } from "./tennis";
import { VOLLEYBALL } from "./volleyball";
import { BASKETBALL } from "./basketball";
import { matchFormatLabel } from "./format-label";
import { resolveRuleValues } from "./rule-values";

// The console header must describe the MATCH, not the sport's default. Before streak v8 a best-of-3 tennis
// fixture read "Best of 5 sets" while the engine played best-of-3 - a label that contradicted the scoreboard.

test("tennis with no override describes the definition default", () => {
  assert.equal(matchFormatLabel(TENNIS, resolveRuleValues(TENNIS)), "3 sets to win · 6 games per set · tiebreak at 6-6");
});

test("tennis with a season rule set describes what is actually played", () => {
  const values = resolveRuleValues(TENNIS, { SETS_TO_WIN: 2, GAMES_PER_SET: 4, TIEBREAK_ENABLED: false });
  assert.equal(matchFormatLabel(TENNIS, values), "2 sets to win · 4 games per set");
});

test("volleyball describes sets and rally points", () => {
  const label = matchFormatLabel(VOLLEYBALL, resolveRuleValues(VOLLEYBALL));
  assert.match(label, /sets to win/);
  assert.match(label, /points per set/);
});

test("basketball still describes its periods and length", () => {
  // The definition default is 2 × 10; a season rule set can make it 4 × 10 (the league format).\n  assert.equal(matchFormatLabel(BASKETBALL, resolveRuleValues(BASKETBALL)), "2 × 10 min");\n  assert.equal(matchFormatLabel(BASKETBALL, resolveRuleValues(BASKETBALL, { PERIOD_COUNT: 4 })), "4 × 10 min");
});

test("a wrong-typed override cannot change the label", () => {
  const values = resolveRuleValues(TENNIS, { SETS_TO_WIN: "2" });
  assert.equal(matchFormatLabel(TENNIS, values), "3 sets to win · 6 games per set · tiebreak at 6-6");
});
