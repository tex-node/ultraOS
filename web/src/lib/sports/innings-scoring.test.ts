import assert from "node:assert/strict";
import test from "node:test";
import { CRICKET } from "@/lib/sports/cricket";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import {
  applyDelivery,
  battingSide,
  chaseTarget,
  inningsConfig,
  isInningsComplete,
  isLegalDelivery,
  oversDisplay,
} from "@/lib/sports/innings-scoring";

test("only innings sports get an innings config", () => {
  const config = inningsConfig(CRICKET)!;
  assert.equal(config.oversPerInnings, 20);
  assert.equal(config.wicketsPerInnings, 10);
  assert.equal(config.inningsCount, 2);
  assert.equal(inningsConfig(VOLLEYBALL), null);
});

test("the home side bats first and wides/no-balls are not legal deliveries", () => {
  const config = inningsConfig(CRICKET)!;
  assert.equal(battingSide(config, 1), "HOME");
  assert.equal(battingSide(config, 2), "AWAY");
  assert.equal(isLegalDelivery("RUN"), true);
  assert.equal(isLegalDelivery("EXTRAS_WIDE"), false);
  assert.equal(isLegalDelivery("EXTRAS_NO_BALL"), false);
  assert.equal(oversDisplay(14 * 6 + 2), "14.2");
});

test("a delivery adds runs, a wicket, or a legal ball as appropriate", () => {
  const config = inningsConfig(CRICKET)!;
  const base = { period: 1, batting: "HOME" as const, runs: 10, wickets: 2, balls: 12 };

  const four = applyDelivery(config, base, { typeKey: "FOUR", runs: 4 });
  assert.equal(four.runsAdded, 4);
  assert.equal(four.resultingBalls, 13);
  assert.equal(four.inningsComplete, false);

  const wicket = applyDelivery(config, base, { typeKey: "WICKET", wicket: true });
  assert.equal(wicket.runsAdded, 0);
  assert.equal(wicket.resultingWickets, 3);
  assert.equal(wicket.resultingBalls, 13);

  const wide = applyDelivery(config, base, { typeKey: "EXTRAS_WIDE", runs: 1 });
  assert.equal(wide.legalBall, false);
  assert.equal(wide.resultingBalls, 12); // no legal ball counted
});

test("innings end at the overs limit or all out", () => {
  const config = inningsConfig(CRICKET)!;
  assert.equal(isInningsComplete(config, { period: 1, batting: "HOME", runs: 100, wickets: 3, balls: 120 }), true);
  assert.equal(isInningsComplete(config, { period: 1, batting: "HOME", runs: 100, wickets: 10, balls: 80 }), true);
  assert.equal(isInningsComplete(config, { period: 1, batting: "HOME", runs: 100, wickets: 3, balls: 119 }), false);
  assert.equal(chaseTarget(150), 151);
});
