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

test("updatePlayerStat merges the patch and stamps clientUpdatedAt, but never enqueues to the outbox", async () => {
  const { db, repo } = setup();
  await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });
  await db.playerStats.put({
    id: "ps1",
    organizationId: "org",
    gameId: "g1",
    playerId: "p-1",
    seasonClubId: "sc-1",
    points: 2,
    rebounds: 1,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    minutesPlayed: 5,
    statSource: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    clientUpdatedAt: "2026-01-01T00:00:00.000Z",
  });

  await repo.updatePlayerStat("ps1", { points: 4, rebounds: 2 });

  const stats = await repo.listStats("g1");
  assert.equal(stats[0].points, 4);
  assert.equal(stats[0].rebounds, 2);
  assert.notEqual(stats[0].clientUpdatedAt, "2026-01-01T00:00:00.000Z");

  // PlayerStat is a local-only projection, never a wire entity (OutboxEntityType) - this write
  // must not leave a trace in the outbox for any sync endpoint to ever pick up.
  const record = await db.outbox.where("entityId").equals("ps1").first();
  assert.equal(record, undefined);
});

test("updatePlayerStat rejects an unknown stat row", async () => {
  const { repo } = setup();
  await assert.rejects(() => repo.updatePlayerStat("missing", { points: 1 }), /PLAYER_STAT_NOT_FOUND/);
});

test("every local write lands in the outbox with pending status", async () => {
  const { db, repo } = setup();
  await repo.createGame({ id: "g1", organizationId: "org", fixtureId: "f1" });
  await repo.logEvent(eventInput("g1", "e1"));
  assert.equal(await pendingCount(db), 2);
});
