import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOrderPricing,
  remainingInventory,
} from "./event-operations";

test("combines admission, line discounts, and promo discounts in kobo", () => {
  assert.deepEqual(
    calculateOrderPricing(
      2_000_000,
      [
        { subtotalKobo: 160_000, discountKobo: 0 },
        { subtotalKobo: 120_000, discountKobo: 0 },
      ],
      1000,
    ),
    {
      subtotalKobo: 2_280_000,
      discountKobo: 228_000,
      totalKobo: 2_052_000,
    },
  );
});

test("inventory availability excludes reserved and sold units", () => {
  assert.equal(remainingInventory(100, 12, 30), 58);
  assert.equal(remainingInventory(10, 8, 5), 0);
});
