"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicBaseUrl } from "@/lib/app-url";
import { mockCheckoutEventBody, mockSigningSecret, signBachsBody, verifyMockCheckoutToken } from "@/lib/bachs-mock";

// "Simulate Payment" on the mock checkout page (streak v19, Prompt 1).
//
// It does NOT call applyBachsBillingEvent() directly. It POSTs a properly signed event to the real webhook route, so
// what gets tested is the same thing a live Bachs delivery tests: signature verification, the event handler, the tenant
// context, the audit row. A shortcut here would have made the one path that matters the one path not covered.
function appBaseUrl(): string {
  // The mock checkout redirects within this app, so loopback is legitimate here (local development, staging over a tunnel).
  return publicBaseUrl({ allowLoopback: true });
}

export async function simulatePaymentAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const verified = verifyMockCheckoutToken(token);
  if (!verified.ok) redirect(`/mock-checkout/${encodeURIComponent(token)}?error=${encodeURIComponent(verified.reason)}`);

  const secret = mockSigningSecret();
  if (!secret) {
    redirect(`/mock-checkout/${encodeURIComponent(token)}?error=${encodeURIComponent("No Bachs webhook secret is configured, so no signed event can be produced.")}`);
  }

  const organization = await prisma.organization.findUnique({ where: { id: verified.checkout.organizationId }, select: { id: true, name: true } });
  if (!organization) redirect(`/mock-checkout/${encodeURIComponent(token)}?error=${encodeURIComponent("That organization no longer exists.")}`);

  const eventId = `evt_mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const body = mockCheckoutEventBody(verified.checkout, eventId);
  const { header } = signBachsBody(body, secret);

  const response = await fetch(`${appBaseUrl()}/api/webhooks/bachs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bachs-signature-v2": header },
    body,
    cache: "no-store",
  }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) }) as Response);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    redirect(`/mock-checkout/${encodeURIComponent(token)}?error=${encodeURIComponent(`The webhook rejected the event (${response.status}): ${detail.slice(0, 160)}`)}`);
  }

  redirect(`/settings/billing?upgraded=1&mock=1`);
}
