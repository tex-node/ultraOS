import assert from "node:assert/strict";
import test from "node:test";
import { attackingBasketForPeriod } from "./attacking-direction";

test("attackingBasketForPeriod returns UNAVAILABLE when the first-half value is unknown", () => {
  assert.deepEqual(attackingBasketForPeriod(null, 1, 2), { status: "UNAVAILABLE" });
});

test("attackingBasketForPeriod: period 1 matches the recorded first-half value", () => {
  const result = attackingBasketForPeriod("A", 1, 2);
  assert.deepEqual(result, { status: "KNOWN", homeAttacks: "A", awayAttacks: "B" });
});

test("attackingBasketForPeriod: period 2 (final period for a 2-half format) switches sides", () => {
  const result = attackingBasketForPeriod("A", 2, 2);
  assert.deepEqual(result, { status: "KNOWN", homeAttacks: "B", awayAttacks: "A" });
});

test("attackingBasketForPeriod: overtime continues the final period's sides, not a further switch", () => {
  const result = attackingBasketForPeriod("A", 3, 2);
  assert.deepEqual(result, { status: "KNOWN", homeAttacks: "B", awayAttacks: "A" });
});

test("attackingBasketForPeriod: starting from B works symmetrically", () => {
  assert.deepEqual(attackingBasketForPeriod("B", 1, 2), { status: "KNOWN", homeAttacks: "B", awayAttacks: "A" });
  assert.deepEqual(attackingBasketForPeriod("B", 2, 2), { status: "KNOWN", homeAttacks: "A", awayAttacks: "B" });
});
