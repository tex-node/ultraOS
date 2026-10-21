import { redirect } from "next/navigation";
import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Partner dashboard (streak v13, Prompt 4).
//
// Who may see it: a signed-in member of the organization who either holds a management permission or owns an API key.
// The partner login IS the existing session - a partner is a user scoped to the partner's organization, and this page
// shows only that organization's numbers. There is no cross-tenant view, by construction: every query runs inside
// withOrganizationContext.
//
// What it reports, and what it refuses to invent:
//   * API requests today and this month: counted in ApiKeyUsageDaily as they happen (a key's lastUsedAt cannot answer
//     "how many").
//   * Webhook success rate: deliveries DELIVERED vs (DELIVERED + FAILED + EXHAUSTED) over the last 30 days, with the
//     raw counts shown next to the percentage so a small sample cannot look like a reliable rate.
//   * Active subscriptions, and the five most recent delivery attempts.
export default async function PartnerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/partner/dashboard");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;
  const canManage = hasPermission(session.user.roles, "operations:manage");

  const data = await withOrganizationContext(organizationId, async (tx) => {
    const keys = await tx.apiKey.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, tier: true, isActive: true, lastUsedAt: true, revokedAt: true, createdById: true },
    });
    const mine = keys.filter((key) => key.createdById === session.user.id || canManage);
    const keyIds = mine.map((key) => key.id);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfToday(startOfDay).getUTCMonth(), 1));

    const usage = keyIds.length === 0 ? [] : await tx.apiKeyUsageDaily.findMany({
      where: { organizationId, apiKeyId: { in: keyIds } },
      select: { apiKeyId: true, day: true, requests: true },
      orderBy: { day: "asc" },
    });
    const subscriptions = await tx.dataFeedSubscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, webhookUrl: true, events: true, isActive: true, createdAt: true, secret: true },
    });
    const deliveryWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deliveries = await tx.dataFeedDelivery.findMany({
      where: { organizationId, createdAt: { gte: deliveryWindowStart } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, eventType: true, attempts: true, lastStatusCode: true, deliveredAt: true, createdAt: true, subscriptionId: true },
      take: 500,
    });
    return { keys: mine, usage, subscriptions, deliveries, startOfDay, startOfMonth };
  });

  const todayIso = data.startOfDay.toISOString().slice(0, 10);
  const monthPrefix = data.startOfMonth.toISOString().slice(0, 7);
  const requestsToday = data.usage.filter((row) => row.day.toISOString().slice(0, 10) === todayIso).reduce((sum, row) => sum + row.requests, 0);
  const requestsMonth = data.usage.filter((row) => row.day.toISOString().slice(0, 7) === monthPrefix).reduce((sum, row) => sum + row.requests, 0);

  const delivered = data.deliveries.filter((row) => row.status === "DELIVERED").length;
  const failed = data.deliveries.filter((row) => row.status === "FAILED" || row.status === "GAVE_UP").length;
  const completed = delivered + failed;
  const successRate = completed === 0 ? null : delivered / completed;
  const recent = data.deliveries.slice(0, 5);

  // A 14-day sparkline of requests, so a partner can see a trend rather than a single number.
  const days: { day: string; requests: number }[] = [];
  for (let index = 13; index >= 0; index -= 1) {
    const day = new Date(data.startOfDay.getTime() - index * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    days.push({ day: key, requests: data.usage.filter((row) => row.day.toISOString().slice(0, 10) === key).reduce((sum, row) => sum + row.requests, 0) });
  }
  const peak = Math.max(1, ...days.map((entry) => entry.requests));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Partner integration</p>
        <h1 className="mt-2 text-2xl font-bold">API dashboard</h1>
        <p className="mt-1 text-sm text-text-2">
          Everything here is this organization&apos;s own traffic. Keys are managed in{" "}
          <Link href="/settings/api-keys" className="text-info underline">Settings · API keys</Link>.
        </p>

        <section aria-labelledby="requests" className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <p className="text-[10px] uppercase tracking-wider text-text-3">Requests today</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{requestsToday}</p>
          </div>
          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <p className="text-[10px] uppercase tracking-wider text-text-3">Requests this month</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{requestsMonth}</p>
          </div>
          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <p className="text-[10px] uppercase tracking-wider text-text-3">Active subscriptions</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{data.subscriptions.filter((entry) => entry.isActive).length}</p>
          </div>
        </section>

        <section aria-labelledby="usage-chart" className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 id="usage-chart" className="text-sm font-semibold">Last 14 days</h2>
          {requestsMonth === 0 && requestsToday === 0 ? (
            <p className="mt-2 text-xs text-text-3">No requests recorded yet. Counts start from the first authenticated call.</p>
          ) : (
            <div className="mt-3 flex h-20 items-end gap-1">
              {days.map((entry) => (
                <div key={entry.day} className="flex-1" title={`${entry.day}: ${entry.requests}`}>
                  <div className="w-full rounded-t bg-brand-400/70" style={{ height: `${Math.max(2, Math.round((entry.requests / peak) * 72))}px` }} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="webhooks" className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 id="webhooks" className="text-sm font-semibold">Webhook delivery, last 30 days</h2>
          {successRate === null ? (
            <p className="mt-2 text-xs text-text-3">No deliveries yet, so there is no success rate to report.</p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-brand-400" style={{ width: `${Math.round(successRate * 100)}%` }} />
                </div>
                <span className="text-sm font-bold tabular-nums">{(successRate * 100).toFixed(1)}%</span>
              </div>
              <p className="mt-2 text-xs text-text-3">
                {delivered} delivered · {failed} failed · {data.deliveries.length} attempts recorded. A percentage over a
                handful of deliveries is not a reliability claim.
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="subscriptions" className="mt-6">
          <h2 id="subscriptions" className="text-sm font-semibold uppercase tracking-wider text-text-3">Subscriptions</h2>
          {data.subscriptions.length === 0 ? (
            <p className="mt-2 rounded-lg border border-line bg-ink-800 p-4 text-sm text-text-2">No webhook subscriptions yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.subscriptions.map((subscription) => (
                <li key={subscription.id} className="rounded-lg border border-line bg-ink-800 p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-text-1">{subscription.name}</span>
                    <span className={`text-[10px] font-bold uppercase ${subscription.isActive ? "text-brand-300" : "text-text-3"}`}>
                      {subscription.isActive ? "active" : "paused"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-3">{subscription.webhookUrl}</p>
                  <p className="mt-1 text-xs text-text-3">
                    {subscription.events.join(", ")} · secret …{subscription.secret.slice(-4)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent" className="mt-6">
          <h2 id="recent" className="text-sm font-semibold uppercase tracking-wider text-text-3">Last 5 deliveries</h2>
          {recent.length === 0 ? (
            <p className="mt-2 rounded-lg border border-line bg-ink-800 p-4 text-sm text-text-2">Nothing delivered yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {recent.map((delivery) => (
                <li key={delivery.id} className="flex flex-wrap justify-between gap-2 rounded border border-line-subtle px-3 py-2">
                  <span className="text-text-1">{delivery.eventType}</span>
                  <span className="text-xs text-text-3">
                    {delivery.status} · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}
                    {delivery.lastStatusCode ? ` · HTTP ${delivery.lastStatusCode}` : ""} · {delivery.createdAt.toISOString().slice(11, 19)}Z
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="keys" className="mt-6">
          <h2 id="keys" className="text-sm font-semibold uppercase tracking-wider text-text-3">Keys on this account</h2>
          {data.keys.length === 0 ? (
            <p className="mt-2 rounded-lg border border-line bg-ink-800 p-4 text-sm text-text-2">
              No API keys yet. Create one in Settings · API keys to start making requests.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {data.keys.map((key) => (
                <li key={key.id} className="flex flex-wrap justify-between gap-2 rounded border border-line-subtle px-3 py-2">
                  <span className="text-text-1">
                    {key.name} <span className="text-xs text-text-3">{key.prefix}… · {key.tier}</span>
                  </span>
                  <span className="text-xs text-text-3">
                    {key.revokedAt ? "revoked" : key.isActive ? "active" : "inactive"} · last used{" "}
                    {key.lastUsedAt ? key.lastUsedAt.toISOString().slice(0, 16).replace("T", " ") : "never"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}

function startOfToday(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
