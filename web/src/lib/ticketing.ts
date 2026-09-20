// F4 ticketing depth: shared promo-code and pass-window rules. Pure functions so both the
// reservation path and the wallet-order path apply identical rules, unit-tested here.

export type PromoCandidate = {
  id: string;
  code: string;
  discountBps: number;
  isActive: boolean;
  eventId: string | null;
  organizationId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
};

export type PromoCheck =
  | { ok: true; promo: PromoCandidate }
  | { ok: false; reason: "INVALID_PROMO" | "PROMO_EXHAUSTED" };

export function checkPromoForEvent(
  promo: PromoCandidate | null,
  input: { eventId: string; organizationId: string; now?: Date },
): PromoCheck {
  if (!promo || !promo.isActive) return { ok: false, reason: "INVALID_PROMO" };
  // PromoCode.code is globally unique, so the organization must be asserted at the
  // application layer — a code from another organization never applies here.
  if (promo.organizationId !== input.organizationId) return { ok: false, reason: "INVALID_PROMO" };
  if (promo.eventId !== null && promo.eventId !== input.eventId) return { ok: false, reason: "INVALID_PROMO" };
  const now = input.now ?? new Date();
  if (promo.startsAt && now < promo.startsAt) return { ok: false, reason: "INVALID_PROMO" };
  if (promo.endsAt && now > promo.endsAt) return { ok: false, reason: "INVALID_PROMO" };
  if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) {
    return { ok: false, reason: "PROMO_EXHAUSTED" };
  }
  return { ok: true, promo };
}

// Kobo discount for a gross amount at the given basis points, rounded down (never negative).
export function promoDiscountKobo(grossKobo: number, discountBps: number): number {
  if (grossKobo <= 0 || discountBps <= 0) return 0;
  return Math.floor((grossKobo * Math.min(discountBps, 10000)) / 10000);
}

export type PassWindow = {
  passTier: "DAY_PASS" | "TOURNAMENT_PASS" | null;
  passValidFrom: Date | null;
  passValidTo: Date | null;
};

export type PassWindowCheck = { ok: true } | { ok: false; reason: "PASS_NOT_YET_VALID" | "PASS_EXPIRED" };

// Regular (non-pass) zones always pass. Pass zones admit only inside their validity window;
// an unset bound means open on that side.
export function checkPassWindow(zone: PassWindow, now?: Date): PassWindowCheck {
  if (zone.passTier === null) return { ok: true };
  const at = now ?? new Date();
  if (zone.passValidFrom && at < zone.passValidFrom) return { ok: false, reason: "PASS_NOT_YET_VALID" };
  if (zone.passValidTo && at > zone.passValidTo) return { ok: false, reason: "PASS_EXPIRED" };
  return { ok: true };
}

export function passTierLabel(tier: PassWindow["passTier"]): string | null {
  if (tier === "DAY_PASS") return "Day pass";
  if (tier === "TOURNAMENT_PASS") return "Full-tournament pass";
  return null;
}

export type OrderTransition = "PAID" | "PREPARING" | "READY" | "CANCELLED";

export type OrderTransitionError = "ORDER_NOT_PAID" | "ORDER_CLOSED" | "INVALID_ORDER_STATUS";

// F5 order pipeline rules: forward progress needs a paid order, closed orders (collected
// or cancelled) never move, cancellation is allowed from any open state.
export function orderTransitionError(
  from: { status: string; paymentStatus: string },
  to: string,
): OrderTransitionError | null {
  if (to !== "PAID" && to !== "PREPARING" && to !== "READY" && to !== "CANCELLED") {
    return "INVALID_ORDER_STATUS";
  }
  if (from.status === "COLLECTED" || from.status === "CANCELLED") return "ORDER_CLOSED";
  if (to !== "CANCELLED" && from.paymentStatus !== "PAID") return "ORDER_NOT_PAID";
  return null;
}
