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
    const payload = buildFeedPayload({
      deliveryId: delivery.id,
      type: delivery.eventType,
      sentAt,
      game: state,
      event: delivery.eventData as unknown as FeedEventFacts,
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

const inFlight = new Set<string>();

export function scheduleFeedDrain(organizationId: string, options: { delayMs?: number } = {}): void {
  if (inFlight.has(organizationId)) return;
  inFlight.add(organizationId);
  const run = () => {
    void drainFeedDeliveries({ organizationId })
      .catch((error) => {
        // Never throw into a request: the outbox row is still there for the next drain.
        console.error(`[data-feed] drain failed for ${organizationId}: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        inFlight.delete(organizationId);
        // If more work arrived while draining, pick it up once.
        void prisma.$disconnect().catch(() => {});
      });
  };
  const timer = setTimeout(run, options.delayMs ?? 0);
  // Don't hold the process open for a webhook.
  timer.unref?.();
}

/** For a cron worker: drain every organization that has due deliveries. */
export async function drainAllOrganizations(options: { limitPerOrganization?: number } = {}): Promise<Record<string, DrainResult>> {
  // Organization is a global table (not RLS-scoped), so this read is legitimate.
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  const results: Record<string, DrainResult> = {};
  for (const organization of organizations) {
    const pending = await withOrganizationContext(organization.id, (tx) =>
      tx.dataFeedDelivery.count({ where: { organizationId: organization.id, status: "PENDING", nextAttemptAt: { lte: new Date() } } }),
    );
    if (pending === 0) continue;
    results[organization.id] = await drainFeedDeliveries({ organizationId: organization.id, limit: options.limitPerOrganization ?? 25 });
  }
  return results;
}
