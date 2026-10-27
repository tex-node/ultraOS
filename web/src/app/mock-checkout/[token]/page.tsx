import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { mockBachsEnabled, verifyMockCheckoutToken } from "@/lib/bachs-mock";
import { simulatePaymentAction } from "./actions";

export const dynamic = "force-dynamic";

// Mock Bachs hosted checkout (streak v19, Prompt 1).
//
// Stands in for the Bachs-hosted page when no key exists, and looks nothing like the real one on purpose: a mock that
// looks real is a mock somebody screenshots into a pitch deck. It is reachable only with a signed token, only when no
// real key is configured, and its one button sends a genuinely signed event to the real webhook.
export default async function MockCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (!mockBachsEnabled()) notFound();

  const verified = verifyMockCheckoutToken(decodeURIComponent(token));
  if (!verified.ok) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-danger">Mock checkout</p>
        <h1 className="mt-2 text-2xl font-bold">This checkout link is not usable</h1>
        <p className="mt-2 text-sm text-text-2">{verified.reason}. Start again from the billing page.</p>
        <Link href="/settings/billing" className="mt-4 inline-block text-sm text-brand-300 underline">Back to billing</Link>
      </main>
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: verified.checkout.organizationId },
    select: { name: true, plan: true },
  });
  if (!organization) notFound();

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-warn">Test mode · mock Bachs checkout</p>
      <h1 className="mt-2 text-2xl font-bold">Upgrade {organization.name} to {verified.checkout.plan}</h1>
      <p className="mt-2 text-sm text-text-2">
        This page exists because no Bachs API key is configured. It does not charge anything. The button below sends a
        real, correctly signed <code>checkout.completed</code> event to the platform&apos;s webhook - the same route a
        live payment uses - so the effect on the plan is genuine, which is the point of testing it.
      </p>
      <dl className="mt-6 space-y-1 text-sm">
        <div className="flex justify-between border-b border-line py-1"><dt className="text-text-3">Organization</dt><dd className="text-text-1">{organization.name}</dd></div>
        <div className="flex justify-between border-b border-line py-1"><dt className="text-text-3">Current plan</dt><dd className="text-text-1">{organization.plan}</dd></div>
        <div className="flex justify-between border-b border-line py-1"><dt className="text-text-3">Purchasing</dt><dd className="text-text-1">{verified.checkout.plan}</dd></div>
        <div className="flex justify-between py-1"><dt className="text-text-3">Settlement</dt><dd className="text-text-1">none (mock)</dd></div>
      </dl>

      {query.error ? (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{query.error}</p>
      ) : null}

      <form action={simulatePaymentAction} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="w-full rounded-lg bg-brand-400 px-4 py-2.5 text-sm font-bold text-ink-900">
          Simulate payment
        </button>
      </form>
      <p className="mt-3 text-[11px] text-text-3">
        The event is signed with the configured webhook secret and verified by the route, so an unsigned or tampered
        event fails exactly as it would in production.
      </p>
    </main>
  );
}
