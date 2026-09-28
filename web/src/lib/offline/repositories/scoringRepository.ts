import { offlineDb, type OfflineScoringDatabase } from "../db";
import { enqueue } from "../outbox";
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
    const event: LocalGameEvent = {
      ...input,
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
          payload: event,
          clientUpdatedAt: timestamp,
          deviceId: this.deviceId,
        },
        this.db,
      );
    });
    return event;
  }

  async listEvents(gameId: string): Promise<LocalGameEvent[]> {
    return this.db.gameEvents.where("gameId").equals(gameId).sortBy("sequenceNumber");
  }

  async listStats(gameId: string): Promise<LocalPlayerStat[]> {
    return this.db.playerStats.where("gameId").equals(gameId).toArray();
  }
}

export class RemoteScoringRepository implements ScoringRepository {
  constructor(
    private readonly baseUrl: string = "/api",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!response.ok) throw new Error(`REMOTE_${response.status}`);
    return response.json();
  }

  async createGame(input: CreateGameInput): Promise<LocalGame> {
    return (await this.request("/games", {
      method: "POST",
      body: JSON.stringify(input),
    })) as LocalGame;
  }

  async getGame(id: string): Promise<LocalGame | undefined> {
    try {
      return (await this.request(`/games/${id}`)) as LocalGame;
    } catch {
      return undefined;
    }
  }

  async logEvent(input: CreateGameEventInput): Promise<LocalGameEvent> {
    return (await this.request(`/games/${input.gameId}/events`, {
      method: "POST",
      body: JSON.stringify(input),
    })) as LocalGameEvent;
  }

  async listEvents(gameId: string): Promise<LocalGameEvent[]> {
    const result = (await this.request(`/games/${gameId}/events`)) as { events: LocalGameEvent[] };
    return result.events;
  }

  async listStats(gameId: string): Promise<LocalPlayerStat[]> {
    const result = (await this.request(`/games/${gameId}/player-stats`)) as {
      stats: LocalPlayerStat[];
    };
    return result.stats;
  }
}
