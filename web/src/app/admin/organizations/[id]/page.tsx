import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadPlanUsage, PLAN_LIMITS, type PlanName } from "@/lib/plans";
import { bachsBillingConfigured } from "@/lib/bachs-billing";
import { generateCheckoutLinkAction, setBachsCustomerIdAction } from "./actions";

export const dynamic = "force-dynamic";

// One organization's billing (streak v18, Prompt 3).
//
// The list page answers "who is on what plan"; this answers "how is this one paid for", including the two things an
// operator actually needs when a league asks: their Bachs customer id, and a checkout link they can forward.
export default async function AdminOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; checkout?: string; cancelled?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.roles.includes("SUPER_ADMIN")) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const organization = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, slug: true, plan: true, bachsCustomerId: true, createdAt: true } });
  if (!organization) notFound();

  const usage = await withOrganizationContext(organization.id, (tx) => loadPlanUsage(tx, organization.id)).catch(() => null);
  const plan = organization.plan as PlanName;
  const auditTrail = await prisma.auditLog.findMany({
    where: { organizationId: organization.id, action: { contains: "BACHS" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { action: true, userId: true, createdAt: true, details: true },
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/admin/organizations" className="text-xs text-text-3 underline">
          ← All organizations
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[.2em] text-brand-400">Billing</p>
        <h1 className="mt-2 text-2xl font-bold">{organization.name}</h1>
        <p className="mt-1 text-sm text-text-2">
          <code>/{organization.slug}</code> · plan <b className="text-text-1">{plan}</b> · created{" "}
          {organization.createdAt.toISOString().slice(0, 10)}
        </p>

        {query.error ? <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{query.error}</p> : null}
        {query.checkout ? <p className="mt-4 rounded-lg border border-brand-400/40 bg-brand-400/10 px-3 py-2 text-xs text-brand-300">Checkout completed. The plan changes when the Bachs webhook confirms payment.</p> : null}
        {query.cancelled ? <p className="mt-4 rounded-lg border border-line px-3 py-2 text-xs text-text-2">Checkout was cancelled; nothing changed.</p> : null}

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Bachs customer</h2>
          <p className="mt-1 text-xs text-text-3">
            {organization.bachsCustomerId ? (
              <>Currently linked to <code className="text-text-1">{organization.bachsCustomerId}</code>.</>
            ) : (
              "Not linked. A checkout creates one; or paste an existing id from the Bachs dashboard."
            )}
          </p>
          <form action={setBachsCustomerIdAction} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="organizationId" value={organization.id} />
            <input
              name="bachsCustomerId"
              defaultValue={organization.bachsCustomerId ?? ""}
              placeholder="cust_..."
              className="min-w-[240px] flex-1 rounded border border-line bg-ink-900 px-3 py-2 font-mono text-sm text-text-1"
            />
            <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm text-text-2 hover:border-brand-400/40 hover:text-white">
              Save
            </button>
          </form>
          <p className="mt-2 text-[11px] text-text-3">Leave it empty to unlink. The id is audited with the admin who set it.</p>
        </section>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Plan and usage</h2>
          <ul className="mt-2 space-y-1 text-xs text-text-2">
            <li>Competitions: {usage ? `${usage.usage.competitions.used}/${PLAN_LIMITS[plan].competitions ?? "∞"}` : "—"}</li>
            <li>API keys: {usage ? `${usage.usage.apiKeys.used}/${PLAN_LIMITS[plan].apiKeys ?? "∞"}` : "—"}</li>
            <li>Webhooks: {usage ? `${usage.usage.webhooks.used}/${PLAN_LIMITS[plan].webhooks ?? "∞"}` : "—"}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["PRO", "ENTERPRISE"] as const).map((target) => (
              <form key={target} action={generateCheckoutLinkAction}>
                <input type="hidden" name="organizationId" value={organization.id} />
                <input type="hidden" name="plan" value={target} />
                <button
                  type="submit"
                  disabled={!bachsBillingConfigured()}
                  title={bachsBillingConfigured() ? "Create a Bachs checkout and open it" : "BACHS_KEY is not configured"}
                  className="rounded-lg bg-brand-400 px-3 py-2 text-xs font-bold text-ink-900 disabled:opacity-40"
                >
                  Generate {target} checkout link
                </button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-text-3">
            The link opens Bachs and is single-use. The plan changes only when Bachs confirms payment.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Billing history</h2>
          {auditTrail.length === 0 ? (
            <p className="mt-2 text-xs text-text-3">No billing events recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-text-2">
              {auditTrail.map((row, index) => (
                <li key={index} className="font-mono">
                  {row.createdAt.toISOString().slice(0, 19).replace("T", " ")} · {row.action} · {row.userId}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
