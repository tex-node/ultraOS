import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPassWindow,
  checkPromoForEvent,
  passTierLabel,
  promoDiscountKobo,
  type PromoCandidate,
} from "@/lib/ticketing";

const base: PromoCandidate = {
  id: "promo-1",
  code: "SAVE20",
  discountBps: 2000,
  isActive: true,
  eventId: "event-1",
  organizationId: "org-1",
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  redemptionCount: 0,
};

test("a matching active promo applies", () => {
  const result = checkPromoForEvent(base, { eventId: "event-1", organizationId: "org-1" });
  assert.equal(result.ok, true);
});

test("inactive, foreign-org, or wrong-event promos are invalid", () => {
  assert.deepEqual(checkPromoForEvent(null, { eventId: "event-1", organizationId: "org-1" }), {
    ok: false,
    reason: "INVALID_PROMO",
  });
  assert.equal(checkPromoForEvent({ ...base, isActive: false }, { eventId: "event-1", organizationId: "org-1" }).ok, false);
  assert.equal(checkPromoForEvent(base, { eventId: "event-1", organizationId: "org-2" }).ok, false);
  assert.equal(checkPromoForEvent(base, { eventId: "event-9", organizationId: "org-1" }).ok, false);
  // Global (event-agnostic) codes apply to any event in the same organization.
  assert.equal(checkPromoForEvent({ ...base, eventId: null }, { eventId: "event-9", organizationId: "org-1" }).ok, true);
});

test("window and redemption caps are enforced", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  assert.equal(
    checkPromoForEvent({ ...base, startsAt: new Date("2026-09-21T00:00:00.000Z") }, { eventId: "event-1", organizationId: "org-1", now }).ok,
    false,
  );
  assert.equal(
    checkPromoForEvent({ ...base, endsAt: new Date("2026-09-19T00:00:00.000Z") }, { eventId: "event-1", organizationId: "org-1", now }).ok,
    false,
  );
  assert.deepEqual(
    checkPromoForEvent({ ...base, maxRedemptions: 2, redemptionCount: 2 }, { eventId: "event-1", organizationId: "org-1", now }),
    { ok: false, reason: "PROMO_EXHAUSTED" },
  );
});

test("promo discounts round down and clamp", () => {
  assert.equal(promoDiscountKobo(1000, 2000), 200);
  assert.equal(promoDiscountKobo(999, 2000), 199);
  assert.equal(promoDiscountKobo(1000, 0), 0);
  assert.equal(promoDiscountKobo(1000, 99999), 1000);
  assert.equal(promoDiscountKobo(0, 2000), 0);
});

test("regular zones always pass; pass windows bind only on set bounds", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  assert.deepEqual(checkPassWindow({ passTier: null, passValidFrom: null, passValidTo: null }, now), { ok: true });
  assert.deepEqual(
    checkPassWindow({ passTier: "DAY_PASS", passValidFrom: new Date("2026-09-20T00:00:00.000Z"), passValidTo: new Date("2026-09-20T23:59:59.000Z") }, now),
    { ok: true },
  );
  assert.deepEqual(
    checkPassWindow({ passTier: "DAY_PASS", passValidFrom: new Date("2026-09-21T00:00:00.000Z"), passValidTo: null }, now),
    { ok: false, reason: "PASS_NOT_YET_VALID" },
  );
  assert.deepEqual(
    checkPassWindow({ passTier: "TOURNAMENT_PASS", passValidFrom: null, passValidTo: new Date("2026-09-19T00:00:00.000Z") }, now),
    { ok: false, reason: "PASS_EXPIRED" },
  );
});

test("pass tier labels", () => {
  assert.equal(passTierLabel("DAY_PASS"), "Day pass");
  assert.equal(passTierLabel("TOURNAMENT_PASS"), "Full-tournament pass");
  assert.equal(passTierLabel(null), null);
});
