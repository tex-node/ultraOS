"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { orderTransitionError } from "@/lib/ticketing";
import { vendorScopeFrom } from "@/lib/vendor-scope";
import { fulfilPaidOrder } from "@/lib/payment-fulfilment";
import type { Prisma } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";

// F5 least privilege: vendor-linked accounts act only on orders made up entirely of
// their own vendor's items; platform staff (event:manage) are unscoped. Throws when
// the actor holds no order scope at all.
async function scopedOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  roles: UserRole[] | undefined,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: { select: { vendorId: true } } } }, promoCode: true, reservation: true },
  });
  const vendor = await tx.vendor.findFirst({ where: { userId }, select: { id: true } });
  const scope = vendorScopeFrom(roles, vendor?.id ?? null);
  if (scope.kind === "none") throw new Error("ORDER_ACCESS_DENIED");
  if (scope.kind === "vendor" && !order.items.every((item) => item.product.vendorId === scope.vendorId)) {
    throw new Error("ORDER_ACCESS_DENIED");
  }
  return order;
}

export async function confirmOrderPayment(
  orderId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  const reference = z.string().trim().min(2).max(100).parse(formData.get("reference"));
  await withOrganizationContext(organizationId, async (tx) => {
    await scopedOrder(tx, orderId, session.user.id, session.user.roles);
    await fulfilPaidOrder(tx, { organizationId, orderId, reference, actorUserId: session.user.id });
  });
  revalidatePath("/orders");
}

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const order = await scopedOrder(tx, orderId, session.user.id, session.user.roles);
    const blocked = orderTransitionError(order, status);
    if (blocked) throw new Error(blocked);
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "ORDER_STATUS_CHANGED",
      entityType: "Order",
      entityId: orderId,
      details: { status, eventId: order.eventId },
    });
  });
  revalidatePath("/orders");
}

// Cancelling an unpaid order releases its reserved stock; cancelling a paid order leaves
// sold stock in place and records that the refund is manual (no payment provider yet).
export async function cancelOrder(orderId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  const reason = z.string().trim().min(5, "Give a reason for cancellation.").parse(formData.get("reason"));
  await withOrganizationContext(organizationId, async (tx) => {
    const order = await scopedOrder(tx, orderId, session.user.id, session.user.roles);
    const blocked = orderTransitionError(order, "CANCELLED");
    if (blocked) throw new Error(blocked);
    if (order.paymentStatus !== "PAID") {
      for (const item of order.items) {
        await tx.vendorInventory.updateMany({
          where: { eventId: order.eventId, productId: item.productId },
          data: { reserved: { decrement: item.quantity } },
        });
      }
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "ORDER_CANCELLED",
      entityType: "Order",
      entityId: orderId,
      details: { eventId: order.eventId, reason, paid: order.paymentStatus === "PAID", manualRefund: order.paymentStatus === "PAID" },
    });
  });
  revalidatePath("/orders");
}
