import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backoffDelayMs,
  buildFeedPayload,
  classifyResponse,
  FEED_HEADERS,
  nextAttemptAt,
  signWebhook,
  verifyWebhookSignature,
  type FeedEventFacts,
  type FeedGameState,
} from "./signature";

// The signature is the only thing standing between a partner and a forged score update, so these tests
// pin the parts a naive implementation gets wrong: what is signed, replay, clock skew, and the retry policy.

const SECRET = "whsec_test_123";
const BODY = JSON.stringify({ id: "d1", type: "SCORE_CHANGED" });

test("a signature verifies against the exact body and timestamp", () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const header = signWebhook(SECRET, timestamp, BODY);
  const result = verifyWebhookSignature(SECRET, BODY, header);
  assert.deepEqual(result, { ok: true });
});

test("a tampered body fails", () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const header = signWebhook(SECRET, timestamp, BODY);
  const result = verifyWebhookSignature(SECRET, BODY.replace("SCORE_CHANGED", "GAME_FINAL"), header);
  assert.equal(result.ok, false);
});

test("the wrong secret fails", () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const header = signWebhook(SECRET, timestamp, BODY);
  assert.equal(verifyWebhookSignature("whsec_other", BODY, header).ok, false);
});

test("an old timestamp is rejected (replay protection)", () => {
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  const header = signWebhook(SECRET, old, BODY);
  const result = verifyWebhookSignature(SECRET, BODY, header);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /tolerance/);
});

test("a header missing t= or v1= is rejected with a reason", () => {
  const malformed = verifyWebhookSignature(SECRET, BODY, "v1=deadbeef");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.match(malformed.reason, /t= and v1=/);
});

test("backoff grows exponentially and is capped at an hour", () => {
  assert.equal(backoffDelayMs(0), 30_000);
  assert.equal(backoffDelayMs(1), 60_000);
  assert.equal(backoffDelayMs(3), 240_000);
  assert.equal(backoffDelayMs(20), 3_600_000);
});

test("nextAttemptAt is now + backoff", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");
  assert.equal(nextAttemptAt(2, now).toISOString(), "2026-10-18T12:02:00.000Z");
});

test("2xx delivers, 408/429/5xx retry, other 4xx gives up", () => {
  assert.equal(classifyResponse(200), "delivered");
  assert.equal(classifyResponse(204), "delivered");
  assert.equal(classifyResponse(408), "retry");
  assert.equal(classifyResponse(429), "retry");
  assert.equal(classifyResponse(500), "retry");
  assert.equal(classifyResponse(503), "retry");
  assert.equal(classifyResponse(400), "give_up");
  assert.equal(classifyResponse(401), "give_up");
  assert.equal(classifyResponse(404), "give_up");
});

const game: FeedGameState = {
  gameId: "g1",
  fixtureId: "f1",
  status: "LIVE",
  homeScore: 38,
  awayScore: 41,
  period: 3,
  periodLabel: "H2",
  clockSeconds: 412,
};
const event: FeedEventFacts = { eventId: "e1", sequenceNumber: 42, period: 3, clockSeconds: 412, points: 2, eventType: "TWO_POINT_MADE" };

test("the payload carries the score AFTER the event and the event facts", () => {
  const payload = buildFeedPayload({ deliveryId: "d1", type: "SCORE_CHANGED", sentAt: new Date("2026-10-18T12:00:00.000Z"), game, event });
  assert.equal(payload.id, "d1");
  assert.equal(payload.type, "SCORE_CHANGED");
  assert.equal(payload.game.homeScore, 38);
  assert.equal(payload.event.sequenceNumber, 42);
  assert.equal(payload.sentAt, "2026-10-18T12:00:00.000Z");
  // The body a partner receives is exactly this JSON, so the signature covers every field above.
  assert.deepEqual(Object.keys(payload).sort(), ["event", "game", "id", "sentAt", "type"]);
});

test("header names are exported so the docs cannot drift", () => {
  assert.equal(FEED_HEADERS.signature, "x-ultra-signature");
  assert.equal(FEED_HEADERS.delivery, "x-ultra-delivery-id");
});
