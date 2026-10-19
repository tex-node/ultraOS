import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { randomBytes } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";

// Partner data-feed subscriptions, managed from the app (streak v8, Prompt 4).
//
// Until now a subscription was a row someone inserted by hand. That meant the secret was chosen by whoever
// ran the SQL, there was no way to rotate it, and a failed delivery could only be retried by touching the
// database. These are the operations an integration actually needs, kept in one service so the UI and any
// future CLI share them.
//
// The secret is returned by create/roll and NEVER by a read: the page shows it once, at the moment it is
// generated, and the list only ever shows a masked tail. A secret that can be read back is a secret that leaks
// the day someone screenshots the page.

export type FeedSubscriptionRow = {
  id: string;
  name: string;
  webhookUrl: string;
  events: string[];
  isActive: boolean;
  secretHint: string;
  createdAt: Date;
  deliveries: { id: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; eventType: string; createdAt: Date }[];
  counts: { delivered: number; pending: number; failed: number };
};

export const FEED_EVENT_TYPES = ["GAME_STARTED", "SCORE_CHANGED", "GAME_FINAL"] as const;
export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/** Only the last four characters are ever shown, so an operator can tell two secrets apart without seeing one. */
export function secretHint(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

export async function listFeedSubscriptions(tx: Prisma.TransactionClient, organizationId: string): Promise<FeedSubscriptionRow[]> {
  const subscriptions = await tx.dataFeedSubscription.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      webhookUrl: true,
      events: true,
      isActive: true,
      secret: true,
      createdAt: true,
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, status: true, attempts: true, lastStatusCode: true, lastError: true, eventType: true, createdAt: true },
      },
    },
  });
  const counts = await tx.dataFeedDelivery.groupBy({
    by: ["subscriptionId", "status"],
    where: { organizationId, subscriptionId: { in: subscriptions.map((row) => row.id) } },
    _count: { _all: true },
  });
  return subscriptions.map((row) => {
    const forRow = counts.filter((count) => count.subscriptionId === row.id);
    const countOf = (...statuses: string[]) => forRow.filter((count) => statuses.includes(count.status)).reduce((sum, count) => sum + count._count._all, 0);
    return {
      id: row.id,
      name: row.name,
      webhookUrl: row.webhookUrl,
      events: row.events,
      isActive: row.isActive,
      secretHint: secretHint(row.secret),
      createdAt: row.createdAt,
      deliveries: row.deliveries,
      counts: { delivered: countOf("DELIVERED"), pending: countOf("PENDING", "DELIVERING"), failed: countOf("FAILED", "GAVE_UP") },
    };
  });
}

export async function createFeedSubscription(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; userId: string; name: string; webhookUrl: string; events: FeedEventType[] },
): Promise<{ id: string; secret: string }> {
  if (args.events.length === 0) throw new Error("Pick at least one event.");
  if (!/^https?:\/\//i.test(args.webhookUrl)) throw new Error("The webhook URL must start with http:// or https://.");
  const secret = generateSecret();
  const created = await tx.dataFeedSubscription.create({
    data: { organizationId: args.organizationId, name: args.name.trim().slice(0, 120), webhookUrl: args.webhookUrl.trim(), secret, events: args.events, createdById: args.userId },
    select: { id: true },
  });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "DATA_FEED_SUBSCRIPTION_CREATED",
    entityType: "DataFeedSubscription",
    entityId: created.id,
    details: { name: args.name, events: args.events, urlHost: new URL(args.webhookUrl).host },
  });
  return { id: created.id, secret };
}

/** Rotate the signing secret. The old one stops verifying immediately - there is no overlap window. */
export async function rollFeedSecret(tx: Prisma.TransactionClient, args: { organizationId: string; userId: string; subscriptionId: string }): Promise<{ secret: string }> {
  const secret = generateSecret();
  const existing = await tx.dataFeedSubscription.findFirst({ where: { id: args.subscriptionId, organizationId: args.organizationId }, select: { id: true } });
  if (!existing) throw new Error("That subscription no longer exists.");
  await tx.dataFeedSubscription.update({ where: { id: args.subscriptionId }, data: { secret } });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "DATA_FEED_SECRET_ROLLED",
    entityType: "DataFeedSubscription",
    entityId: args.subscriptionId,
    details: {},
  });
  return { secret };
}

export async function setFeedSubscriptionActive(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; userId: string; subscriptionId: string; isActive: boolean },
): Promise<void> {
  await tx.dataFeedSubscription.updateMany({ where: { id: args.subscriptionId, organizationId: args.organizationId }, data: { isActive: args.isActive } });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: args.isActive ? "DATA_FEED_SUBSCRIPTION_ENABLED" : "DATA_FEED_SUBSCRIPTION_DISABLED",
    entityType: "DataFeedSubscription",
    entityId: args.subscriptionId,
    details: {},
  });
}

/**
 * Put a failed delivery back in the queue. Resetting `attempts` to 0 is deliberate: an operator retrying by
 * hand has usually fixed the reason (the URL, a firewall, an outage), and the backoff counter is about the
 * AUTOMATIC retries, not about how many times a human may try.
 */
export async function retryFeedDelivery(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; userId: string; deliveryId: string },
): Promise<{ ok: boolean; error?: string }> {
  const delivery = await tx.dataFeedDelivery.findFirst({
    where: { id: args.deliveryId, organizationId: args.organizationId },
    select: { id: true, status: true },
  });
  if (!delivery) return { ok: false, error: "That delivery no longer exists." };
  if (delivery.status === "DELIVERED") return { ok: false, error: "That delivery already succeeded." };
  await tx.dataFeedDelivery.update({
    where: { id: delivery.id },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null, lastStatusCode: null },
  });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "DATA_FEED_DELIVERY_RETRIED",
    entityType: "DataFeedDelivery",
    entityId: args.deliveryId,
    details: { previousStatus: delivery.status },
  });
  return { ok: true };
}
