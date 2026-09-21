import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { bachsConfig, createTransfer, koboToAmountString } from "@/lib/bachs";
import { commissionSplitKobo } from "@/lib/money";

// Shared payment fulfilment (Bachs F5.3). The exact same state transitions run whether the
// payment was confirmed by an operator typing a reference or by the gateway's
// collection.succeeded webhook, so both paths can never disagree. `actorUserId` is null
// for the webhook (no session); that path skips the audit write.
export async function fulfilPaidOrder(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; orderId: string; reference: string; actorUserId: string | null },
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: input.orderId },
    include: { items: true, reservation: true, promoCode: true },
  });
  if (order.paymentStatus === "PAID") return order;

  for (const item of order.items) {
    const inventory = await tx.vendorInventory.findUniqueOrThrow({
      where: { eventId_productId: { eventId: order.eventId, productId: item.productId } },
    });
    if (inventory.reserved < item.quantity) throw new Error("RESERVED_STOCK_MISSING");
    await tx.vendorInventory.update({
      where: { id: inventory.id },
      data: { reserved: { decrement: item.quantity }, sold: { increment: item.quantity } },
    });
    await tx.sponsorCampaign.updateMany({
      where: { isActive: true, productId: item.productId, OR: [{ eventId: null }, { eventId: order.eventId }] },
      data: { unitsSold: { increment: item.quantity }, revenueKobo: { increment: item.totalKobo } },
    });
  }
  if (order.promoCodeId) {
    await tx.promoCode.update({ where: { id: order.promoCodeId }, data: { redemptionCount: { increment: 1 } } });
    if (order.promoCode?.sponsorCampaignId) {
      await tx.sponsorCampaign.update({
        where: { id: order.promoCode.sponsorCampaignId },
        data: { redemptions: { increment: 1 } },
      });
    }
  }
  const now = new Date();
  await tx.order.update({
    where: { id: input.orderId },
    data: { status: "PAID", paymentStatus: "PAID", paymentReference: input.reference, paidAt: now },
  });
  if (order.reservationId && order.reservation?.paymentStatus !== "PAID") {
    await tx.seatReservation.update({
      where: { id: order.reservationId },
      data: { paymentStatus: "PAID", paymentReference: input.reference, paidAt: now },
    });
  }
  if (input.actorUserId) {
    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      action: "ORDER_PAYMENT_CONFIRMED",
      entityType: "Order",
      entityId: input.orderId,
      details: { eventId: order.eventId, totalKobo: order.totalKobo, reference: input.reference, source: "gateway-or-operator" },
    });
  }
  return order;
}

// A ticket-only reservation (no wallet order) is paid directly via its own checkout.
export async function fulfilPaidReservation(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; reservationId: string; reference: string; actorUserId: string | null },
) {
  const reservation = await tx.seatReservation.findUniqueOrThrow({ where: { id: input.reservationId } });
  if (reservation.paymentStatus === "PAID") return reservation;
  await tx.seatReservation.update({
    where: { id: input.reservationId },
    data: { paymentStatus: "PAID", paymentReference: input.reference, paidAt: new Date() },
  });
  if (input.actorUserId) {
    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      action: "RESERVATION_PAYMENT_CONFIRMED",
      entityType: "SeatReservation",
      entityId: input.reservationId,
      details: { reference: input.reference, source: "gateway-or-operator" },
    });
  }
  return reservation;
}

// After an order is paid, move each vendor's net share (gross minus league commission) to
// its Bachs Connect sub-account. Best-effort and never fatal: a vendor without a connected
// account (or an un-settled balance, or a missing capability) is skipped and its share
// reconciles in the dashboard instead. Grouped by the charge so the order's transfers are
// traceable. Call after the payment is confirmed, outside any DB transaction.
export async function issueVendorTransfers(orderId: string, transferGroup: string) {
  const config = bachsConfig();
  if (!config) return;

  const { prisma } = await import("@/lib/prisma");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { include: { vendor: true } } } } },
  });
  if (!order) return;

  const byVendor = new Map<string, { vendorId: string; name: string; accountId: string | null; netKobo: number }>();
  for (const item of order.items) {
    const vendor = item.product.vendor;
    if (!vendor) continue;
    const split = commissionSplitKobo(item.totalKobo, vendor.commissionBps);
    const key = vendor.id;
    const entry = byVendor.get(key) ?? { vendorId: vendor.id, name: vendor.name, accountId: vendor.bachsAccountId, netKobo: 0 };
    entry.netKobo += split.netKobo;
    byVendor.set(key, entry);
  }

  for (const entry of byVendor.values()) {
    if (!entry.accountId || entry.netKobo <= 0) continue;
    try {
      await createTransfer({
        amountKobo: entry.netKobo,
        destinationAccountId: entry.accountId,
        reference: `ord-${orderId}`,
        transferGroup,
      });
      console.log(`VENDOR_TRANSFER_OK order=${orderId} vendor=${entry.vendorId} net=${koboToAmountString(entry.netKobo)}`);
    } catch (error) {
      // Balance/capability issues (e.g. funds not settled, account not onboarded) are
      // expected early on; they must never fail the payment acknowledgment.
      console.warn(`VENDOR_TRANSFER_SKIPPED order=${orderId} vendor=${entry.vendorId}: ${error instanceof Error ? error.message : error}`);
    }
  }
}