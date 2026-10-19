import { createHmac, timingSafeEqual } from "node:crypto";

// Streak v5, Prompt 2: the wire format and the signature for the partner data feed.
//
// PURE on purpose (no Prisma, no Next): the same functions are used by the dispatcher, by the verification
// script that pretends to be a sportsbook, and by the API docs' example - so a partner copying the docs
// verifies exactly what the server signs.

export type DataFeedEventTypeName = "GAME_STARTED" | "SCORE_CHANGED" | "GAME_FINAL" | "CARD_ISSUED";

export type FeedEventFacts = {
  eventId: string;
  sequenceNumber: number;
  period: number;
  clockSeconds: number;
  points: number | null;
  eventType: string;
  /** The player involved (scorer, or the player shown a card). Null when the event has no player attribution. */
  playerName?: string | null;
  /** Resolved to `playerName` by the drain when only the id is known at enqueue time (no join on the hot path). */
  playerId?: string | null;
  /** CARD_ISSUED only: YELLOW or RED. */
  cardColour?: "YELLOW" | "RED" | null;
  /** Which side the event belongs to, derived by the producer (the feed does not guess from ids). */
  side?: "HOME" | "AWAY" | null;
};

export type FeedGameState = {
  gameId: string;
  fixtureId: string;
  status: string;
  homeScore: number;
  awayScore: number;
  period: number;
  periodLabel: string | null;
  clockSeconds: number | null;
};

export type FeedPayload = {
  /** Stable id of this delivery - a partner can dedupe on it across retries. */
  id: string;
  type: DataFeedEventTypeName;
  /** Server time the body was produced (ISO 8601, UTC). */
  sentAt: string;
  game: FeedGameState;
  event: FeedEventFacts;
};

/**
 * `v1=<hex>` over `<timestamp>.<body>`, the Stripe-shaped scheme: the timestamp is signed too, so a
 * captured body cannot be replayed with a fresh header.
 */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Verify a received request. `toleranceSeconds` rejects an old signature (the default 5 minutes), which is
 * what stops a replay of a body an attacker captured yesterday.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  options: { now?: number; toleranceSeconds?: number } = {},
): { ok: true } | { ok: false; reason: string } {
  const parts = new Map<string, string>();
  for (const chunk of header.split(",")) {
    const index = chunk.indexOf("=");
    if (index > 0) parts.set(chunk.slice(0, index).trim(), chunk.slice(index + 1).trim());
  }
  const timestamp = parts.get("t");
  const provided = parts.get("v1");
  if (!timestamp || !provided) return { ok: false, reason: "signature header must contain t= and v1=" };
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return { ok: false, reason: "timestamp is not a number" };
  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.now ?? Date.now();
  if (Math.abs(now / 1000 - seconds) > tolerance) return { ok: false, reason: "timestamp outside tolerance" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "signature mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

/** Exponential backoff with a cap: 30s, 60s, 2m, 4m, 8m, 16m, 32m, then 1h. */
export function backoffDelayMs(attempts: number): number {
  const base = 30_000;
  const cap = 60 * 60 * 1000;
  return Math.min(base * 2 ** Math.max(0, attempts), cap);
}

export function nextAttemptAt(attempts: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + backoffDelayMs(attempts));
}

/**
 * How to treat a response. 2xx = delivered. 408/429/5xx and network errors are worth retrying. Any other
 * 4xx means the request is wrong (bad URL, rejected secret, unsupported event) and retrying only spams the
 * partner, so the delivery is given up immediately and the reason is recorded.
 */
export function classifyResponse(status: number): "delivered" | "retry" | "give_up" {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  if (status >= 400) return "give_up";
  return "retry";
}

export function buildFeedPayload(input: { deliveryId: string; type: DataFeedEventTypeName; sentAt: Date; game: FeedGameState; event: FeedEventFacts }): FeedPayload {
  return { id: input.deliveryId, type: input.type, sentAt: input.sentAt.toISOString(), game: input.game, event: input.event };
}

/** The headers a subscriber should expect. Exported so the docs and the tests agree with the dispatcher. */
export const FEED_HEADERS = {
  signature: "x-ultra-signature",
  event: "x-ultra-event",
  delivery: "x-ultra-delivery-id",
  attempt: "x-ultra-attempt",
  contentType: "application/json",
} as const;
