import { redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadPlanUsage, PLAN_LIMITS, type PlanName } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { startCheckoutAction } from "./actions";

export const dynamic = "force-dynamic";

// Billing (streak v16, Prompt 3).
//
// Shows the plan, what each limit currently is, and how much of it is used. The "upgrade" control is deliberately a
// placeholder: there is no payment provider wired, and a button that pretended to charge someone would be worse than a
// button that explains itself. The page states which plan each limit belongs to, so an operator can see what an
// upgrade would actually buy.
const PLAN_LABEL: Record<PlanName, string> = { FREE: "Free", PRO: "Pro", ENTERPRISE: "Enterprise" };
const RESOURCE_LABELS = { apiKeys: "API keys", competitions: "Competitions", webhooks: "Webhook subscriptions" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; upgraded?: string }> }) {
  const query = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/settings/billing");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  if (!hasPermission(session.user.roles, "operations:manage")) redirect("/dashboard");

  const usage = await withOrganizationContext(session.user.organizationId, (tx) => loadPlanUsage(tx, session.user.organizationId!));
  // Billing is "configured" only when a Stripe key exists. A button that throws on click is worse than a sentence that
  // says why it cannot work yet (streak v17, Prompt 2).
  const billingConfigured = stripeConfigured();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Billing</p>
        <h1 className="mt-2 text-2xl font-bold">Plan and usage</h1>
        <p className="mt-1 text-sm text-text-2">
          On the <b className="text-text-1">{PLAN_LABEL[usage.plan]}</b> plan
          {usage.stripeCustomerId ? ` · Stripe customer ${usage.stripeCustomerId}` : " · no payment method on file"}.
        </p>

        {query.error ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{query.error}</p>
        ) : null}
        {query.upgraded ? (
          <p className="mt-4 rounded-lg border border-brand-400/40 bg-brand-400/10 px-3 py-2 text-xs text-brand-300">
            {'Payment received. The plan changes when the Stripe webhook confirms it - refresh in a moment if it still shows the old one.'}
          </p>
        ) : null}

        <section aria-labelledby="usage" className="mt-6 space-y-3">
          <h2 id="usage" className="text-sm font-semibold uppercase tracking-wider text-text-3">This month</h2>
          {(Object.keys(RESOURCE_LABELS) as (keyof typeof RESOURCE_LABELS)[]).map((resource) => {
            const entry = usage.usage[resource];
            const limitText = entry.limit === null ? "unlimited" : String(entry.limit);
            const pct = entry.limit === null || entry.limit === 0 ? (entry.used > 0 ? 100 : 0) : Math.min(100, Math.round((entry.used / entry.limit) * 100));
            return (
              <div key={resource} className="rounded-lg border border-line bg-ink-800 p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-text-1">{RESOURCE_LABELS[resource]}</p>
                  <p className="font-mono text-xs text-text-2">
                    {entry.used} / {limitText}
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full ${pct >= 100 ? "bg-warn" : "bg-brand-400"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </section>

        <section aria-labelledby="plans" className="mt-6">
          <h2 id="plans" className="text-sm font-semibold uppercase tracking-wider text-text-3">Plans</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {(Object.keys(PLAN_LIMITS) as PlanName[]).map((plan) => (
              <div key={plan} className={`rounded-lg border p-4 ${plan === usage.plan ? "border-brand-400/60" : "border-line"} bg-ink-800`}>
                <p className="text-sm font-bold text-text-1">{PLAN_LABEL[plan]}</p>
                <ul className="mt-2 space-y-1 text-xs text-text-2">
                  <li>{PLAN_LIMITS[plan].apiKeys === null ? "Unlimited" : PLAN_LIMITS[plan].apiKeys} API keys</li>
                  <li>{PLAN_LIMITS[plan].competitions === null ? "Unlimited" : PLAN_LIMITS[plan].competitions} competitions</li>
                  <li>{PLAN_LIMITS[plan].webhooks === null ? "Unlimited" : PLAN_LIMITS[plan].webhooks} webhooks</li>
                </ul>
                {plan === usage.plan ? (
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-brand-300">Current plan</p>
                ) : billingConfigured ? (
                  <form action={startCheckoutAction}>
                    <input type="hidden" name="plan" value={plan} />
                    <button type="submit" className="mt-3 w-full rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-bold text-ink-900">
                      Upgrade to {PLAN_LABEL[plan]}
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[11px] text-text-3">
                    Billing not configured: no Stripe key in this environment.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-3">
            {billingConfigured
              ? "Checkout is handled by Stripe; the plan changes when its webhook confirms payment, not when the button is clicked."
              : "This deployment has no Stripe key, so upgrades are shown as a message rather than a button that would fail. Plan limits are enforced where the resource is created, so they apply to the API, the wizard and the webhook console alike."}
          </p>
        </section>
      </main>
    </OperationsShell>
  );
}
