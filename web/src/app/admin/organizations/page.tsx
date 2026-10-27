import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { PLAN_LIMITS, type PlanName } from "@/lib/plans";
import { loadOrganizationsWithUsage, setOrganizationPlanAction } from "./actions";

export const dynamic = "force-dynamic";

// Platform admin: organizations and their plans (streak v17, Prompt 3).
//
// The billing page is for a tenant to see what they pay for; this is for the operator to fix it - a customer who pays
// by wire transfer, a trial that needs to extend, a downgrade after a cancellation that Stripe never sent. Gated to
// SUPER_ADMIN and listed with the same usage numbers the customer sees, so the two pages cannot disagree.
const PLAN_BADGE: Record<PlanName, string> = {
  FREE: "border-line text-text-2",
  PRO: "border-brand-400/50 text-brand-300",
  ENTERPRISE: "border-warn/50 text-warn",
};

export default async function AdminOrganizationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/organizations");
  if (!session.user.roles.includes("SUPER_ADMIN")) redirect("/dashboard");

  const organizations = await loadOrganizationsWithUsage();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Platform administration</p>
        <h1 className="mt-2 text-2xl font-bold">Organizations and plans</h1>
        <p className="mt-1 text-sm text-text-2">
          {organizations.length} organization{organizations.length === 1 ? "" : "s"}. A plan change takes effect
          immediately - plan limits are read from this column on every write.
        </p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ink-800 text-[11px] uppercase tracking-wider text-text-3">
              <tr>
                <th className="px-4 py-2 font-semibold">Organization</th>
                <th className="px-4 py-2 font-semibold">Plan</th>
                <th className="px-4 py-2 font-semibold">Competitions</th>
                <th className="px-4 py-2 font-semibold">API keys</th>
                <th className="px-4 py-2 font-semibold">Webhooks</th>
                <th className="px-4 py-2 font-semibold">Change plan</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => {
                const plan = organization.plan as PlanName;
                const usage = organization.usage;
                const cell = (used: number | undefined, limit: number | null | undefined) =>
                  used === undefined ? "—" : `${used}/${limit === null || limit === undefined ? "∞" : limit}`;
                return (
                  <tr key={organization.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <Link href={`/admin/organizations/${organization.id}`} className="text-text-1 underline">{organization.name}</Link>
                      <p className="font-mono text-[10px] text-text-3">/{organization.slug}</p>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${PLAN_BADGE[plan]}`}>{plan}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-2">{cell(usage?.usage.competitions.used, PLAN_LIMITS[plan].competitions)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-text-2">{cell(usage?.usage.apiKeys.used, PLAN_LIMITS[plan].apiKeys)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-text-2">{cell(usage?.usage.webhooks.used, PLAN_LIMITS[plan].webhooks)}</td>
                    <td className="px-4 py-2">
                      <form action={setOrganizationPlanAction} className="flex items-center gap-2">
                        <input type="hidden" name="organizationId" value={organization.id} />
                        <select name="plan" defaultValue={plan} className="rounded border border-line bg-ink-900 px-2 py-1 text-xs text-text-1">
                          {(["FREE", "PRO", "ENTERPRISE"] as PlanName[]).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-text-2 hover:border-brand-400/40 hover:text-white">
                          Apply
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-text-3">
          Each change is audited with the administrator who made it. Grandfathered organizations are on ENTERPRISE from
          the plan migration; a new organization starts on FREE.
        </p>
      </main>
    </OperationsShell>
  );
}
