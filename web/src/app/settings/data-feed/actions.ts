"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { drainFeedDeliveries } from "@/lib/data-feed/dispatcher";
import {
  createFeedSubscription,
  retryFeedDelivery,
  rollFeedSecret,
  setFeedSubscriptionActive,
  type FeedEventType,
} from "@/server/data-feed/subscriptions";
import { FEED_EVENT_TYPES } from "@/server/data-feed/subscriptions";

// Data-feed management actions (streak v8, Prompt 4). Each one returns the value the UI may show ONCE (the
// secret) and revalidates the list; nothing here can read a secret back afterwards.

export type FeedActionState = {
  error?: string;
  createdSecret?: { name: string; secret: string };
  rolledSecret?: { subscriptionId: string; secret: string };
  retried?: { deliveryId: string; ok: boolean; error?: string };
  toggled?: { subscriptionId: string; isActive: boolean };
};

function parseEvents(formData: FormData): FeedEventType[] {
  const values = formData.getAll("events").map(String);
  return FEED_EVENT_TYPES.filter((event) => values.includes(event));
}

export async function createSubscriptionAction(_state: FeedActionState, formData: FormData): Promise<FeedActionState> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const name = String(formData.get("name") ?? "").trim();
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  const events = parseEvents(formData);
  if (!name) return { error: "Give the subscription a name so it is identifiable later." };
  if (events.length === 0) return { error: "Pick at least one event." };

  try {
    const created = await withOrganizationContext(organizationId, (tx) => createFeedSubscription(tx, { organizationId, userId: session.user.id, name, webhookUrl, events }));
    revalidatePath("/settings/data-feed");
    return { createdSecret: { name, secret: created.secret } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function rollSecretAction(_state: FeedActionState, formData: FormData): Promise<FeedActionState> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) return { error: "Missing subscription." };
  try {
    const rolled = await withOrganizationContext(organizationId, (tx) => rollFeedSecret(tx, { organizationId, userId: session.user.id, subscriptionId }));
    revalidatePath("/settings/data-feed");
    return { rolledSecret: { subscriptionId, secret: rolled.secret } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleSubscriptionAction(_state: FeedActionState, formData: FormData): Promise<FeedActionState> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!subscriptionId) return { error: "Missing subscription." };
  await withOrganizationContext(organizationId, (tx) => setFeedSubscriptionActive(tx, { organizationId, userId: session.user.id, subscriptionId, isActive }));
  revalidatePath("/settings/data-feed");
  return { toggled: { subscriptionId, isActive } };
}

// Retry = reset the row, then drain immediately so the operator sees the outcome instead of waiting for the
// next timer tick. The drain is the same function the cron endpoint calls.
export async function retryDeliveryAction(_state: FeedActionState, formData: FormData): Promise<FeedActionState> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const deliveryId = String(formData.get("deliveryId") ?? "");
  if (!deliveryId) return { error: "Missing delivery." };
  const result = await withOrganizationContext(organizationId, (tx) => retryFeedDelivery(tx, { organizationId, userId: session.user.id, deliveryId }));
  if (result.ok) await drainFeedDeliveries({ organizationId, limit: 10 }).catch(() => undefined);
  revalidatePath("/settings/data-feed");
  return { retried: { deliveryId, ok: result.ok, error: result.error } };
}
