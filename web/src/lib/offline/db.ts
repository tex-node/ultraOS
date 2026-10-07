import Dexie, { type Table } from "dexie";
import type { LocalGame, LocalGameEvent, LocalPlayerStat } from "./entities";
import type { OutboxOperation, OutboxEntityType } from "./types";

interface OutboxRow {
  localId?: number;
  entityType: OutboxEntityType;
  entityId: string;
  operation: OutboxOperation;
  payload: unknown;
  clientUpdatedAt: string;
  idempotencyKey: string;
  deviceId: string;
  syncedAt?: string | null;
  failureReason?: string | null;
  attemptCount: number;
  deadLetteredAt?: string | null;
  lastManualRetryAt?: string | null;
  ledgerSourceHint?: "SCORER" | "STATISTICIAN";
}

interface MetaRow {
  key: string;
  value: unknown;
}

export class OfflineScoringDatabase extends Dexie {
  games!: Table<LocalGame, string>;
  gameEvents!: Table<LocalGameEvent, string>;
  playerStats!: Table<LocalPlayerStat, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = "ultra-offline-scoring") {
    super(name);
    this.version(1).stores({
      games: "id, fixtureId, updatedAt, clientUpdatedAt",
      gameEvents: "id, gameId, [gameId+sequenceNumber], clientUpdatedAt",
      playerStats: "id, gameId, [gameId+playerId], clientUpdatedAt",
      outbox: "++localId, entityType, entityId, idempotencyKey, syncedAt, clientUpdatedAt",
      meta: "key",
    });
  }
}

export const offlineDb = new OfflineScoringDatabase();
