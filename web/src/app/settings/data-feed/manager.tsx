"use client";

import { useActionState, useState } from "react";
import type { FeedSubscriptionRow } from "@/server/data-feed/subscriptions";
import { createSubscriptionAction, retryDeliveryAction, rollSecretAction, toggleSubscriptionAction, type FeedActionState } from "./actions";

// The B2B console (streak v8, Prompt 4). Three rules the UI has to get right:
//   1. a secret is shown ONCE, immediately after it is created or rolled, and never read back;
//   2. the delivery log is the truth - Success / Pending / Failed straight from the rows, not a guess;
//   3. Retry is explicit and audited, and it drains immediately so the operator sees what happened.

const EVENTS = ["GAME_STARTED", "SCORE_CHANGED", "GAME_FINAL"] as const;

function SecretReveal({ label, secret }: { label: string; secret: string }) {
  return (
    <div role="status" className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-xs">Copy it now — this is the only time it is shown. The next page load shows a masked tail only.</p>
      <code className="mt-2 block break-all rounded bg-ink-900 p-2 font-mono text-xs text-text-1">{secret}</code>
    </div>
  );
}

function statusBadge(status: string) {
  const tone =
    status === "DELIVERED"
      ? "text-brand-300 border-brand-400/30"
      : status === "PENDING" || status === "DELIVERING"
        ? "text-info border-info/30"
        : "text-danger border-danger/30";
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{status}</span>;
}

export function DataFeedManager({ subscriptions }: { subscriptions: FeedSubscriptionRow[] }) {
  const [createState, createAction, creating] = useActionState(createSubscriptionAction, {} as FeedActionState);
  const [rollState, rollAction, rolling] = useActionState(rollSecretAction, {} as FeedActionState);
  const [toggleState, toggleAction] = useActionState(toggleSubscriptionAction, {} as FeedActionState);
  const [retryState, retryAction, retrying] = useActionState(retryDeliveryAction, {} as FeedActionState);
  const [showCreate, setShowCreate] = useState(subscriptions.length === 0);
  const error = createState.error ?? rollState.error ?? toggleState.error ?? retryState.error;

  return (
    <div className="mt-6 space-y-6">
      {error ? (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {createState.createdSecret ? <SecretReveal label={`Secret for “${createState.createdSecret.name}”`} secret={createState.createdSecret.secret} /> : null}
      {rollState.rolledSecret ? <SecretReveal label="New secret — the previous one no longer verifies" secret={rollState.rolledSecret.secret} /> : null}
      {retryState.retried ? (
        <p role="status" className={`rounded-md p-3 text-sm ${retryState.retried.ok ? "bg-brand-400/10 text-brand-300" : "bg-danger/10 text-danger"}`}>
          {retryState.retried.ok ? "Delivery re-queued and sent." : `Retry refused: ${retryState.retried.error}`}
        </p>
      ) : null}

      <section className="rounded-lg border border-line bg-ink-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Subscriptions ({subscriptions.length})</h2>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-md border border-line px-3 py-1.5 text-xs">
            {showCreate ? "Hide form" : "New subscription"}
          </button>
        </div>

        {showCreate ? (
          <form action={createAction} className="mt-3 grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
            <label className="text-xs text-text-2">
              Name
              <input name="name" required maxLength={120} placeholder="Sportsbook pricing feed" className="mt-1 min-h-[40px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
            </label>
            <label className="text-xs text-text-2">
              Webhook URL
              <input name="webhookUrl" required type="url" placeholder="https://partner.example/hooks/ultra" className="mt-1 min-h-[40px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
            </label>
            <fieldset className="text-xs text-text-2 sm:col-span-2">
              <legend>Events</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-1.5">
                    <input type="checkbox" name="events" value={event} defaultChecked={event === "SCORE_CHANGED"} />
                    {event}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <button type="submit" disabled={creating} className="min-h-[40px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900 disabled:opacity-40">
                {creating ? "Creating…" : "Create subscription"}
              </button>
            </div>
          </form>
        ) : null}

        {subscriptions.length === 0 ? (
          <p className="mt-3 text-sm text-text-3">No subscriptions yet. Create one to start pushing signed webhooks.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {subscriptions.map((subscription) => (
              <li key={subscription.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-semibold text-text-1">{subscription.name}</p>
                    <p className="break-all text-xs text-text-3">{subscription.webhookUrl}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={subscription.isActive ? "text-brand-300" : "text-text-3"}>{subscription.isActive ? "ACTIVE" : "PAUSED"}</span>
                    <span className="text-text-3">secret {subscription.secretHint}</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-text-3">Events: {subscription.events.join(", ")}</p>
                <p className="mt-1 text-xs text-text-2">
                  <span className="text-brand-300">{subscription.counts.delivered} delivered</span> ·{" "}
                  <span className="text-info">{subscription.counts.pending} pending</span> ·{" "}
                  <span className="text-danger">{subscription.counts.failed} failed</span>
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={rollAction}>
                    <input type="hidden" name="subscriptionId" value={subscription.id} />
                    <button type="submit" disabled={rolling} className="rounded border border-warn/40 px-2 py-1 text-xs text-warn disabled:opacity-40">
                      {rolling ? "Rolling…" : "Roll secret"}
                    </button>
                  </form>
                  <form action={toggleAction}>
                    <input type="hidden" name="subscriptionId" value={subscription.id} />
                    <input type="hidden" name="isActive" value={subscription.isActive ? "false" : "true"} />
                    <button type="submit" disabled={rolling} className="rounded border border-line px-2 py-1 text-xs text-text-2 disabled:opacity-40">
                      {subscription.isActive ? "Pause" : "Resume"}
                    </button>
                  </form>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-text-3">Recent deliveries ({subscription.deliveries.length})</summary>
                  <table className="mt-2 min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-text-3">
                        <th className="p-1">Event</th>
                        <th className="p-1">Status</th>
                        <th className="p-1">Attempts</th>
                        <th className="p-1">HTTP</th>
                        <th className="p-1">When</th>
                        <th className="p-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {subscription.deliveries.map((delivery) => (
                        <tr key={delivery.id} className="border-t border-line-subtle">
                          <td className="p-1">{delivery.eventType}</td>
                          <td className="p-1">{statusBadge(delivery.status)}</td>
                          <td className="p-1 tabular-nums">{delivery.attempts}</td>
                          <td className="p-1 tabular-nums">{delivery.lastStatusCode ?? "–"}</td>
                          <td className="p-1 text-text-3">{delivery.createdAt.toISOString().slice(11, 19)}</td>
                          <td className="p-1">
                            {delivery.status !== "DELIVERED" ? (
                              <form action={retryAction}>
                                <input type="hidden" name="deliveryId" value={delivery.id} />
                                <button type="submit" disabled={retrying} className="rounded border border-line px-2 py-0.5 text-[11px] text-text-2 disabled:opacity-40">
                                  Retry
                                </button>
                              </form>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {subscription.deliveries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-2 text-text-3">
                            Nothing sent yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                  {subscription.deliveries.some((delivery) => delivery.lastError) ? (
                    <p className="mt-2 break-all text-[11px] text-danger">
                      Last error: {subscription.deliveries.find((delivery) => delivery.lastError)?.lastError}
                    </p>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-text-3">
        Deliveries are signed with HMAC-SHA256 over <code>t=timestamp.body</code> and sent with{" "}
        <code>x-ultra-signature</code>. Retries use exponential backoff in the database; the 30-second timer picks
        up anything still pending. A paused subscription keeps its rows but sends nothing.
      </p>
    </div>
  );
}
