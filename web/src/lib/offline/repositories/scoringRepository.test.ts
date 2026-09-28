import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { OfflineScoringDatabase } from "../db";
import { LocalScoringRepository } from "./scoringRepository";
import { pendingCount } from "../outbox";
import type { CreateGameEventInput } from "./scoringRepository";

let counter = 0;
const setup = () => {
  const db = new OfflineScoringDatabase(`ultra-offline-repo-test-${counter++}`);
  const repo = new LocalScoringRepository(db, "tablet-1");
  return { db, repo };
};

const eventInput = (gameId: string, id: string): CreateGameEventInput => ({
  id,
  gameId,
  sequenceNumber: null,
  seasonClubId: "sc-1",
  entrantId: null,
  playerId: "p-1",
  fouledPlayerId: null,
  foulType: null,
  causedByEventId: null,
  eventType: "SHOT_MADE",
  typeKey: null,
  data: null,
  points: 2,
  basePointValue: 2,
  multiplier: 1,
  made: true,
  isFourPointAttempt: false,
  isUltraTime: false,
  assistedByPlayerId: null,
  substitutedOutPlayerId: null,
  x: null,
  y: null,
  courtZone: null,
  homeScoreBefore: null,
  awayScoreBefore: null,
  homeScoreAfter: null,
  awayScoreAfter: null,
  source: null,
  createdById: "user-1",
  status: "ACTIVE",
  period: 1,
  clockSeconds: 540,
  description: "made 2",
});

test("createGame writes the game locally and enqueues a CREATE outbox record", async () => {
  const { db, repo } = setup();
  const game = await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });

  assert.equal(game.status, "NOT_STARTED");
  assert.equal(game.nextEventSequence, 1);
  assert.deepEqual(await repo.getGame("g1"), game);

  const records = await db.outbox.toArray();
  assert.equal(records.length, 1);
  assert.equal(records[0].entityType, "Game");
  assert.equal(records[0].operation, "CREATE");
  assert.equal(records[0].entityId, "g1");
});

test("logEvent assigns a monotonic sequence, persists the event, and enqueues it", async () => {
  const { db, repo } = setup();
  await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });

  const first = await repo.logEvent(eventInput("g1", "e1"));
  const second = await repo.logEvent(eventInput("g1", "e2"));

  assert.equal(first.sequenceNumber, 1);
  assert.equal(second.sequenceNumber, 2);

  const events = await repo.listEvents("g1");
  assert.deepEqual(events.map((e) => e.id), ["e1", "e2"]);

  const game = await repo.getGame("g1");
  assert.equal(game?.nextEventSequence, 3);

  assert.equal((await db.outbox.toArray()).length, 3);
});

test("logEvent rejects an event for an unknown game", async () => {
  const { repo } = setup();
  await assert.rejects(() => repo.logEvent(eventInput("missing", "e1")), /GAME_NOT_FOUND/);
});

test("listEvents returns events ordered by sequenceNumber even when inserted out of order", async () => {
  const { db, repo } = setup();
  await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });
  await repo.logEvent(eventInput("g1", "e1"));
  await repo.logEvent(eventInput("g1", "e2"));
  await db.gameEvents.update("e1", { sequenceNumber: 9 });

  const events = await repo.listEvents("g1");
  assert.deepEqual(events.map((e) => e.id), ["e2", "e1"]);
});

test("logEvent clientUpdatedAt is carried into the outbox ordering key", async () => {
  const { db, repo } = setup();
  await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });
  await repo.logEvent({ ...eventInput("g1", "e1"), clientUpdatedAt: "2026-02-01T00:00:00.000Z" });
  const record = await db.outbox.where("entityId").equals("e1").first();
  assert.equal(record?.clientUpdatedAt, "2026-02-01T00:00:00.000Z");
});

// No updatePlayerStat tests here - the method was removed (see docs/canonical-write-audit.md
// "Outbox entity vocabulary"). It enqueued PlayerStat snapshots to the outbox, contradicting the
// derived-stats decision; deleting the method deletes the test surface that codified the drift,
// rather than asserting a workaround. listStats/the local playerStats table are untouched - only
// the write path that produced this repository's own drift is gone. The local stat projection
// (materialized write vs. computed-on-read) is a sub-task of the A3b stat-model decision, not
// decided here.

test("every local write lands in the outbox with pending status", async () => {
  const { db, repo } = setup();
  await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });
  await repo.logEvent(eventInput("g1", "e1"));
  assert.equal(await pendingCount(db), 2);
});
