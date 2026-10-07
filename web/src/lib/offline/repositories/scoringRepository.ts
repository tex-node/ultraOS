import { offlineDb, type OfflineScoringDatabase } from "../db";
import { drain, enqueue } from "../outbox";
import type { LocalGame, LocalGameEvent, LocalPlayerStat } from "../entities";

export interface CreateGameInput {
  id: string;
  organizationId: string;
  fixtureId: string;
  status?: LocalGame["status"];
  currentPeriod?: number;
  clockSecondsRemaining?: number;
  shotClockSecondsRemaining?: number;
}

export type CreateGameEventInput = Omit<
  LocalGameEvent,
  "createdAt" | "clientUpdatedAt" | "organizationId"
> & {
  organizationId?: string;
  clientUpdatedAt?: string;
  // Required, not optional: outbox-schema.ts's wire contract requires this for every GameEvent
  // record (Point 2, docs/canonical-write-audit.md) - a console that doesn't know which ledger
  // it's writing to is a bug at the call site, not something to default away here.
  ledgerSourceHint: "SCORER" | "STATISTICIAN";
  // A4 (offline scoring tap): present only when the caller already resolved this shot's
  // multiplier/isUltraTime itself (via resolveClientShot, src/lib/ultra-scoring-engine.ts) rather
  // than relying on the live server action to do it - see docs/canonical-write-audit.md's
  // "wall-clock-derived event fields" note. Carried on the outbox payload only, not on
  // LocalGameEvent itself - nothing local reads it back today.
  clientObservedAt?: string;
};

// No updatePlayerStat here (removed - see docs/canonical-write-audit.md "Outbox entity
// vocabulary"). PlayerStat is a projection, not something this repository mutates directly; the
// local playerStats table stays in the Dexie schema for whichever shape (materialized write or
// computed-on-read projection) the A3b stat-model decision calls for, but no method should exist
// that can enqueue a PlayerStat write until that decision is made - that's exactly the drift this
// removal closes.
export interface ScoringRepository {
  createGame(input: CreateGameInput): Promise<LocalGame>;
  getGame(id: string): Promise<LocalGame | undefined>;
  logEvent(input: CreateGameEventInput): Promise<LocalGameEvent>;
  listEvents(gameId: string): Promise<LocalGameEvent[]>;
  listStats(gameId: string): Promise<LocalPlayerStat[]>;
}

const now = () => new Date().toISOString();

export class LocalScoringRepository implements ScoringRepository {
  constructor(
    private readonly db: OfflineScoringDatabase = offlineDb,
    private readonly deviceId: string = "local-device",
  ) {}

  async createGame(input: CreateGameInput): Promise<LocalGame> {
    const timestamp = now();
    const game: LocalGame = {
      id: input.id,
      organizationId: input.organizationId,
      fixtureId: input.fixtureId,
      status: input.status ?? "NOT_STARTED",
      currentPeriod: input.currentPeriod ?? 1,
      clockSecondsRemaining: input.clockSecondsRemaining ?? 600,
      clockStartedAt: null,
      shotClockSecondsRemaining: input.shotClockSecondsRemaining ?? 20,
      shotClockStartedAt: null,
      isUltraTimeActive: false,
      nextEventSequence: 1,
      startedAt: null,
      endedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      clientUpdatedAt: timestamp,
    };
    await this.db.games.put(game);
    await enqueue(
      {
        entityType: "Game",
        entityId: game.id,
        operation: "CREATE",
        payload: game,
        clientUpdatedAt: timestamp,
        deviceId: this.deviceId,
      },
      this.db,
    );
    return game;
  }

  async getGame(id: string): Promise<LocalGame | undefined> {
    return this.db.games.get(id);
  }

  async logEvent(input: CreateGameEventInput): Promise<LocalGameEvent> {
    const game = await this.db.games.get(input.gameId);
    if (!game) throw new Error("GAME_NOT_FOUND");
    const timestamp = input.clientUpdatedAt ?? now();
    const sequenceNumber = game.nextEventSequence;
    // ledgerSourceHint/clientObservedAt aren't LocalGameEvent fields (outbox routing/replay
    // metadata, not something this console needs to read back locally) - destructured out here so
    // they land only on the enqueued wire record's payload, not duplicated into the stored event.
    const { ledgerSourceHint, clientObservedAt, ...eventInput } = input;
    const event: LocalGameEvent = {
      ...eventInput,
      organizationId: input.organizationId ?? game.organizationId,
      sequenceNumber,
      createdAt: timestamp,
      clientUpdatedAt: timestamp,
    };
    await this.db.transaction("rw", this.db.gameEvents, this.db.games, this.db.outbox, async () => {
      await this.db.gameEvents.put(event);
      await this.db.games.update(input.gameId, {
        nextEventSequence: sequenceNumber + 1,
        updatedAt: timestamp,
        clientUpdatedAt: timestamp,
      });
      await enqueue(
        {
          entityType: "GameEvent",
          entityId: event.id,
          operation: "CREATE",
          // clientObservedAt travels on the payload itself (gameEventCreatePayloadSchema's own
          // field), not as a sibling outbox record property the way ledgerSourceHint is - it's
          // part of what the server validates against this specific event, not generic routing.
          payload: clientObservedAt ? { ...event, clientObservedAt } : event,
          clientUpdatedAt: timestamp,
          deviceId: this.deviceId,
          ledgerSourceHint,
        },
        this.db,
      );
    });
    // Enqueue-triggered drain when online: without this, the common case (wifi is up, the tap
    // just needed to queue briefly for some other reason) would only sync on the next
    // online/visibilitychange trigger, which could be tens of seconds away - not the "sync within
    // ~1s" the offline-tap UX design calls for. Fire-and-forget: drain()'s own in-flight guard
    // makes an overlapping call from a rapid second tap a no-op, not a problem.
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void drain(this.deviceId);
    }
    return event;
  }

  async listEvents(gameId: string): Promise<LocalGameEvent[]> {
    return this.db.gameEvents.where("gameId").equals(gameId).sortBy("sequenceNumber");
  }

  async listStats(gameId: string): Promise<LocalPlayerStat[]> {
    return this.db.playerStats.where("gameId").equals(gameId).toArray();
  }
}

// No RemoteScoringRepository here (removed - see docs/canonical-write-audit.md, A3b sketch
// Point 4). It targeted /games, /games/{id}/events, /games/{id}/player-stats - endpoints that
// never existed and never matched Batch 0's single-batch-endpoint sync design (POST
// /api/sync/outbox, see src/app/api/sync/outbox/route.ts). Zero callers referenced it; dead,
// mismatched scaffolding, not a stub of the real plan.
