import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import {
  buildFeedPayload,
  classifyResponse,
  FEED_HEADERS,
  nextAttemptAt,
  signWebhook,
  type DataFeedEventTypeName,
  type FeedEventFacts,
  type FeedGameState,
} from "./signature";

// Streak v5, Prompt 2: the webhook dispatcher.
//
// THE SPLIT THAT MATTERS: `queueXxx` runs INSIDE the canonical scoring transaction and only INSERTs outbox
// rows (no network, no timers). `drain` runs afterwards, outside any transaction, and is the only thing that
// does I/O to a partner. A slow or dead subscriber therefore costs one insert on the scoring path, never a
// blocked live game.
//
// Retries live in the DATABASE (`attempts`, `nextAttemptAt`), not in a timer: a process restart must not
// lose a score change, and a `setTimeout` cannot promise that.

const MAX_ATTEMPTS = 8;
const DELIVERY_TIMEOUT_MS = 10_000;

export type QueueResult = { queued: number };

function subscribeFilter(eventType: DataFeedEventTypeName): Prisma.DataFeedSubscriptionWhereInput {
  return { isActive: true, events: { has: eventType } };
}

/** Queue one SCORE_CHANGED delivery per interested subscriber. Call inside the GameEvent transaction. */
export async function queueScoreChangedFeed(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; gameId: string; event: FeedEventFacts },
): Promise<QueueResult> {
  const subscriptions = await tx.dataFeedSubscription.findMany({
    where: { organizationId: args.organizationId, ...subscribeFilter("SCORE_CHANGED") },
    select: { id: true },
  });
  if (subscriptions.length === 0) return { queued: 0 };
  await tx.dataFeedDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      organizationId: args.organizationId,
      subscriptionId: subscription.id,
      gameId: args.gameId,
      eventType: "SCORE_CHANGED" as const,
      eventData: args.event as unknown as Prisma.InputJsonValue,
    })),
  });
  markFeedQueued(args.organizationId);
  return { queued: subscriptions.length };
}

/**
 * Queue a CARD_ISSUED delivery (streak v10, Prompt 4). Called by the catalog write path for YELLOW_CARD /
 * RED_CARD, so a partner hears about a sending-off as it happens rather than inferring it from a metrics dump.
 */
export async function queueCardIssuedFeed(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; gameId: string; event: FeedEventFacts },
): Promise<QueueResult> {
  const subscriptions = await tx.dataFeedSubscription.findMany({
    where: { organizationId: args.organizationId, ...subscribeFilter("CARD_ISSUED") },
    select: { id: true },
  });
  if (subscriptions.length === 0) return { queued: 0 };
  await tx.dataFeedDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      organizationId: args.organizationId,
      subscriptionId: subscription.id,
      gameId: args.gameId,
      eventType: "CARD_ISSUED" as const,
      eventData: args.event as unknown as Prisma.InputJsonValue,
    })),
  });
  markFeedQueued(args.organizationId);
  return { queued: subscriptions.length };
}
export async function hasFeedSubscriber(tx: Prisma.TransactionClient, organizationId: string, eventType: DataFeedEventTypeName): Promise<boolean> {
  const count = await tx.dataFeedSubscription.count({ where: { organizationId, ...subscribeFilter(eventType) } });
  return count > 0;
}

// The win probability is not an event of the game, it is the engine's belief about it (streak v12, Prompt 2). It is
// queued after a scoring change, carries the model that produced it, and is never signed as fact - the payload says
// `winProbHome`, `method` and `confidence` so a partner can weight it.
export type WinProbabilityFeedEvent = {
  eventId: string;
  sequenceNumber: number;
  period: number;
  clockSeconds: number;
  points: null;
  eventType: "WIN_PROBABILITY_UPDATED";
  winProbHome: number;
  winProbAway: number;
  method: string;
  confidence: number;
  homeScore: number;
  awayScore: number;
};

export async function queueWinProbabilityFeed(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; gameId: string; event: WinProbabilityFeedEvent },
): Promise<QueueResult> {
  const subscriptions = await tx.dataFeedSubscription.findMany({
    where: { organizationId: args.organizationId, ...subscribeFilter("WIN_PROBABILITY_UPDATED") },
    select: { id: true },
  });
  if (subscriptions.length === 0) return { queued: 0 };
  await tx.dataFeedDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      organizationId: args.organizationId,
      subscriptionId: subscription.id,
      gameId: args.gameId,
      eventType: "WIN_PROBABILITY_UPDATED" as const,
      eventData: args.event as unknown as Prisma.InputJsonValue,
    })),
  });
  markFeedQueued(args.organizationId);
  return { queued: subscriptions.length };
}
// A human-confirmed vision observation (streak v14, Prompt 3). The AI's own output is never published on its own -
// a partner gets this only after a reviewer marked the observation CONFIRMED, and the payload keeps the AI provenance
// (box, confidence, model) next to the human decision so the two cannot be confused.
export type VisionEventConfirmedFeed = {
  eventId: string;
  sequenceNumber: number;
  period: number;
  clockSeconds: number;
  points: null;
  eventType: "VISION_EVENT_CONFIRMED";
  observationId: string;
  observationType: string;
  confirmedEventType: string | null;
  playerId: string | null;
  jerseyNumber: number | null;
  boundingBox: unknown;
  videoTimeMs: number;
  confidence: number;
  reviewedById: string;
  reviewedAt: string;
};

export async function queueVisionEventConfirmedFeed(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; gameId: string; event: VisionEventConfirmedFeed },
): Promise<QueueResult> {
  const subscriptions = await tx.dataFeedSubscription.findMany({
    where: { organizationId: args.organizationId, ...subscribeFilter("VISION_EVENT_CONFIRMED") },
    select: { id: true },
  });
  if (subscriptions.length === 0) return { queued: 0 };
  await tx.dataFeedDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      organizationId: args.organizationId,
      subscriptionId: subscription.id,
      gameId: args.gameId,
      eventType: "VISION_EVENT_CONFIRMED" as const,
      eventData: args.event as unknown as Prisma.InputJsonValue,
    })),
  });
  markFeedQueued(args.organizationId);
  return { queued: subscriptions.length };
}
/** Queue a lifecycle event (GAME_STARTED / GAME_FINAL). Call from the status transition, in its transaction. */
export async function queueGameLifecycleFeed(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; gameId: string; eventType: "GAME_STARTED" | "GAME_FINAL"; event: FeedEventFacts },
): Promise<QueueResult> {
  const subscriptions = await tx.dataFeedSubscription.findMany({
    where: { organizationId: args.organizationId, ...subscribeFilter(args.eventType) },
    select: { id: true },
  });
  if (subscriptions.length === 0) return { queued: 0 };
  await tx.dataFeedDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      organizationId: args.organizationId,
      subscriptionId: subscription.id,
      gameId: args.gameId,
      eventType: args.eventType,
      eventData: args.event as unknown as Prisma.InputJsonValue,
    })),
  });
  markFeedQueued(args.organizationId);
  return { queued: subscriptions.length };
}

export type DrainResult = { attempted: number; delivered: number; retried: number; gaveUp: number; skipped: number };

type DeliveryRow = {
  id: string;
  attempts: number;
  eventType: DataFeedEventTypeName;
  eventData: Prisma.JsonValue;
  gameId: string;
  subscription: { id: string; webhookUrl: string; secret: string; isActive: boolean; name: string };
};

/**
 * Send due deliveries for one organization. Sequential on purpose: a subscriber that is timing out must not
 * have its backlog fired at it in parallel, and the volume per live game is a handful of deliveries.
 */
export async function drainFeedDeliveries(args: { organizationId: string; limit?: number; now?: Date }): Promise<DrainResult> {
  const now = args.now ?? new Date();
  const limit = args.limit ?? 25;
  const result: DrainResult = { attempted: 0, delivered: 0, retried: 0, gaveUp: 0, skipped: 0 };

  const due = await withOrganizationContext(args.organizationId, (tx) =>
    tx.dataFeedDelivery.findMany({
      where: { organizationId: args.organizationId, status: "PENDING", nextAttemptAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        attempts: true,
        eventType: true,
        eventData: true,
        gameId: true,
        subscription: { select: { id: true, webhookUrl: true, secret: true, isActive: true, name: true } },
      },
    }),
  );
  if (due.length === 0) return result;

  for (const delivery of due as DeliveryRow[]) {
    // CLAIM FIRST. Two drains can read the same PENDING row (the harness proved it: one delivery was
    // posted twice). `updateMany` with `status: "PENDING"` in the WHERE is atomic in Postgres, so exactly
    // one drain gets count 1 and the loser moves on without sending.
    const claimed = await withOrganizationContext(args.organizationId, (tx) =>
      tx.dataFeedDelivery.updateMany({ where: { id: delivery.id, status: "PENDING" }, data: { status: "DELIVERING" } }),
    );
    if (claimed.count === 0) {
      result.skipped += 1;
      continue;
    }

    if (!delivery.subscription.isActive) {
      // The subscription was disabled after this delivery was queued: give up without pretending to send.
      await withOrganizationContext(args.organizationId, (tx) =>
        tx.dataFeedDelivery.update({ where: { id: delivery.id }, data: { status: "GAVE_UP", lastError: "subscription disabled" } }),
      );
      result.skipped += 1;
      continue;
    }

    const state = await loadFeedGameState(args.organizationId, delivery.gameId);
    if (!state) {
      await withOrganizationContext(args.organizationId, (tx) =>
        tx.dataFeedDelivery.update({ where: { id: delivery.id }, data: { status: "GAVE_UP", lastError: "game not found" } }),
      );
      result.skipped += 1;
      continue;
    }

    const sentAt = new Date();
    const rawEvent = delivery.eventData as unknown as FeedEventFacts;
    // A scorer is named for the partner (streak v10): the enqueue only carried the player id, so the name is
    // resolved here, once per delivery, rather than joining players on every scoring write.
    const event = rawEvent.playerId && !rawEvent.playerName ? { ...rawEvent, playerName: await playerNameFor(args.organizationId, rawEvent.playerId) } : rawEvent;
    const payload = buildFeedPayload({
      deliveryId: delivery.id,
      type: delivery.eventType,
      sentAt,
      game: state,
      event,
    });
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(sentAt.getTime() / 1000));
    const signature = signWebhook(delivery.subscription.secret, timestamp, body);
    const attempt = delivery.attempts + 1;
    result.attempted += 1;

    let status: number | null = null;
    let error: string | null = null;
    let verdict: "delivered" | "retry" | "give_up" = "retry";
    try {
      const response = await fetch(delivery.subscription.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": FEED_HEADERS.contentType,
          [FEED_HEADERS.signature]: signature,
          [FEED_HEADERS.event]: delivery.eventType,
          [FEED_HEADERS.delivery]: delivery.id,
          [FEED_HEADERS.attempt]: String(attempt),
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      status = response.status;
      verdict = classifyResponse(response.status);
      if (verdict !== "delivered") error = `HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`;
    } catch (caught) {
      // Network error / timeout -> retry.
      error = caught instanceof Error ? caught.message : String(caught);
      verdict = "retry";
    }

    const exhausted = attempt >= MAX_ATTEMPTS;
    const nextStatus = verdict === "delivered" ? "DELIVERED" : verdict === "give_up" ? "GAVE_UP" : exhausted ? "FAILED" : "PENDING";
    if (nextStatus === "DELIVERED") result.delivered += 1;
    else if (nextStatus === "GAVE_UP") result.gaveUp += 1;
    else if (nextStatus === "FAILED") result.gaveUp += 1;
    else result.retried += 1;

    await withOrganizationContext(args.organizationId, (tx) =>
      tx.dataFeedDelivery.update({
        where: { id: delivery.id },
        data: {
          status: nextStatus,
          attempts: attempt,
          lastStatusCode: status,
          lastError: error,
          deliveredAt: nextStatus === "DELIVERED" ? sentAt : null,
          sentPayload: payload as unknown as Prisma.InputJsonValue,
          // A non-retryable outcome keeps the old instant; the row is terminal, so the value is never read again.
          nextAttemptAt: nextStatus === "PENDING" ? nextAttemptAt(attempt, sentAt) : new Date(),
        },
      }),
    );
  }

  return result;
}

async function playerNameFor(organizationId: string, playerId: string): Promise<string | null> {
  const player = await withOrganizationContext(organizationId, (tx) =>
    tx.player.findFirst({ where: { id: playerId, organizationId }, select: { athlete: { select: { firstName: true, lastName: true } } } }),
  );
  return player ? `${player.athlete.firstName} ${player.athlete.lastName}`.trim() : null;
}

async function loadFeedGameState(organizationId: string, gameId: string): Promise<FeedGameState | null> {
  const game = await withOrganizationContext(organizationId, (tx) =>
    tx.game.findFirst({
      where: { id: gameId, organizationId },
      select: {
        id: true,
        fixtureId: true,
        status: true,
        currentPeriod: true,
        clockSecondsRemaining: true,
        fixture: { select: { homeScore: true, awayScore: true } },
      },
    }),
  );
  if (!game) return null;
  return {
    gameId: game.id,
    fixtureId: game.fixtureId,
    status: game.status,
    homeScore: game.fixture.homeScore,
    awayScore: game.fixture.awayScore,
    period: game.currentPeriod,
    periodLabel: null,
    clockSeconds: game.clockSecondsRemaining,
  };
}

// ---- after-commit draining -------------------------------------------------------------------------
//
// The drain must not run inside the scoring transaction. `scheduleFeedDrain` is fire-and-forget with a
// per-organization in-flight guard, so a burst of events in one request collapses into a single drain and a
// failure can never bubble into the scoring path.
//
// It also only runs for an organization that actually QUEUED something in this process. Without that guard
// every scoring write in an installation with no subscribers still started an async database round-trip
// after commit - which, in the DB test suite, ran on the global client while the tests were creating and
// dropping isolated schemas and produced ten spurious failures in unrelated suites (they all pass when run
// file by file). Precision here is worth it: no subscribers, no timer, no query.

const inFlight = new Set<string>();
/** Organizations whose queue functions inserted at least one delivery in this process. */
const queuedOrganizations = new Set<string>();

export function markFeedQueued(organizationId: string): void {
  queuedOrganizations.add(organizationId);
}

export function scheduleFeedDrain(organizationId: string, options: { delayMs?: number } = {}): void {
  if (!queuedOrganizations.has(organizationId)) return;
  if (inFlight.has(organizationId)) return;
  inFlight.add(organizationId);
  queuedOrganizations.delete(organizationId);
  const run = () => {
    void drainFeedDeliveries({ organizationId })
      .catch((error) => {
        // Never throw into a request: the outbox row is still there for the next drain.
        console.error(`[data-feed] drain failed for ${organizationId}: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        inFlight.delete(organizationId);
        // NOTE: never call prisma.$disconnect() here. It is a process-wide singleton; disconnecting it
        // from a fire-and-forget task tears down the client under concurrent requests and in-flight
        // transactions (measured: "Transaction not found" in the verification script's second event).
      });
  };
  const timer = setTimeout(run, options.delayMs ?? 0);
  // Don't hold the process open for a webhook.
  timer.unref?.();
}

/** For a cron worker: reclaim crashed claims, then drain every organization that has due deliveries. */
/**
 * Retry a drain step through a transient database problem (streak v15, Prompt 1).
 *
 * The two errors worth retrying are the ones a busy pool produces: P2024 ("timed out fetching a new connection from
 * the pool") and P2028 ("transaction API error", which is what an aborted interactive transaction raises). Both are
 * load, not logic - retrying with backoff is the correct response; anything else is rethrown so a real bug is not
 * hidden behind a retry loop. The waits are 250/500/1000/2000 ms, so four attempts add at most ~3.8 s to a drain that
 * would otherwise have thrown.
 */
async function withTransientRetry<T>(label: string, operation: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string }).code;
      const retryable = code === "P2024" || code === "P2028";
      if (!retryable || attempt === attempts) break;
      const backoff = 250 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
}

export async function drainAllOrganizations(options: { limitPerOrganization?: number; stuckAfterMs?: number } = {}): Promise<Record<string, DrainResult>> {
  // Organization is a global table (not RLS-scoped), so this read is legitimate.
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  const results: Record<string, DrainResult> = {};
  const stuckBefore = new Date(Date.now() - (options.stuckAfterMs ?? 10 * 60 * 1000));
  for (const organization of organizations) {
    // Crash recovery: a process that died mid-send leaves a row in DELIVERING, which no drain would ever
    // pick up again. Anything claimed longer ago than the timeout goes back to PENDING (it will be retried,
    // and the subscriber may see the same delivery id twice - which is why the id is stable and documented
    // as a dedupe key).
    await withTransientRetry(`reclaim:${organization.id}`, () =>
      withOrganizationContext(organization.id, (tx) =>
        tx.dataFeedDelivery.updateMany({
          where: { organizationId: organization.id, status: "DELIVERING", nextAttemptAt: { lt: stuckBefore } },
          data: { status: "PENDING" },
        }),
      ),
    );
    const pending = await withTransientRetry(`count:${organization.id}`, () =>
      withOrganizationContext(organization.id, (tx) =>
        tx.dataFeedDelivery.count({ where: { organizationId: organization.id, status: "PENDING", nextAttemptAt: { lte: new Date() } } }),
      ),
    );
    if (pending === 0) continue;
    results[organization.id] = await withTransientRetry(`drain:${organization.id}`, () =>
      drainFeedDeliveries({ organizationId: organization.id, limit: options.limitPerOrganization ?? 25 }),
    );
  }
  return results;
}
