import { NextResponse } from "next/server";
import { bachsConfig, verifyBachsSignature } from "@/lib/bachs";
import { fulfilPaidOrder, fulfilPaidReservation } from "@/lib/payment-fulfilment";
import { withOrganizationContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bachs webhook (F5.3). The gateway is the source of truth for fulfilment — never trust a
// client redirect. Every delivery is HMAC-signed; we verify before touching any state.
// Idempotent: fulfil* helpers no-op when the entity is already PAID, and the gateway
// delivers at-least-once.
export async function POST(request: Request) {
  const config = bachsConfig();
  if (!config || !config.webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const valid = verifyBachsSignature({
    rawBody,
    secret: config.webhookSecret,
    timestampHeader: request.headers.get("x-bachs-timestamp"),
    signatureHeader: request.headers.get("x-bachs-signature"),
    signatureV2Header: request.headers.get("x-bachs-signature-v2"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { id?: string; type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = (event.data ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, string>;
  const checkoutId = typeof data.checkout_id === "string" ? data.checkout_id : null;
  const chargeId = (typeof data.charge_id === "string" ? data.charge_id : null) ?? (typeof data.payment_id === "string" ? data.payment_id : null);
  const reference = chargeId ?? checkoutId ?? "bachs";

  try {
    if (event.type === "collection.succeeded") {
      // Metadata wins (fast path), then fall back to the stored checkout reference.
      let orderId: string | null = metadata.orderId ?? null;
      let reservationId: string | null = metadata.reservationId ?? null;
      if (!orderId && !reservationId && checkoutId) {
        const order = await prisma.order.findFirst({ where: { checkoutId }, select: { id: true, organizationId: true } });
        if (order) {
          orderId = order.id;
        } else {
          const reservation = await prisma.seatReservation.findFirst({ where: { checkoutId }, select: { id: true, organizationId: true } });
          reservationId = reservation?.id ?? null;
        }
      }

      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { organizationId: true } });
        if (!order) return NextResponse.json({ received: true, skipped: "order not found" });
        await withOrganizationContext(order.organizationId, (tx) =>
          fulfilPaidOrder(tx, { organizationId: order.organizationId, orderId, reference, actorUserId: null }),
        );
        return NextResponse.json({ received: true });
      }
      if (reservationId) {
        const reservation = await prisma.seatReservation.findUnique({ where: { id: reservationId }, select: { organizationId: true } });
        if (!reservation) return NextResponse.json({ received: true, skipped: "reservation not found" });
        await withOrganizationContext(reservation.organizationId, (tx) =>
          fulfilPaidReservation(tx, { organizationId: reservation.organizationId, reservationId, reference, actorUserId: null }),
        );
        return NextResponse.json({ received: true });
      }
      return NextResponse.json({ received: true, skipped: "no matching entity" });
    }

    if (event.type === "refund.paid" && chargeId) {
      const order = await prisma.order.findFirst({ where: { paymentReference: chargeId }, select: { id: true, organizationId: true } });
      if (order) {
        await withOrganizationContext(order.organizationId, (tx) =>
          tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } }),
        );
        return NextResponse.json({ received: true });
      }
      const reservation = await prisma.seatReservation.findFirst({ where: { paymentReference: chargeId }, select: { id: true, organizationId: true } });
      if (reservation) {
        await withOrganizationContext(reservation.organizationId, (tx) =>
          tx.seatReservation.update({ where: { id: reservation.id }, data: { paymentStatus: "REFUNDED" } }),
        );
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Bachs webhook handling failed", error);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }
}