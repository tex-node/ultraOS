"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function findCheckInCode(formData: FormData) {
  await requirePermission("check-in:operate");
  const code = z.string().trim().min(8).max(100).parse(formData.get("code"));
  redirect(`/check-in/${encodeURIComponent(code)}`);
}

export async function checkInTicket(ticketId: string, code: string) {
  const session = await requirePermission("check-in:operate");
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { reservation: true },
    });
    if (ticket.status !== "ACTIVE") throw new Error("TICKET_NOT_ACTIVE");
    if (
      ticket.reservation.totalKobo > 0 &&
      ticket.reservation.paymentStatus !== "PAID"
    ) {
      throw new Error("RESERVATION_NOT_PAID");
    }
    const now = new Date();
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: "USED", usedAt: now },
    });
    await tx.checkIn.create({
      data: {
        type: "VENUE_ENTRY",
        ticketId,
        checkedInById: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "FAN_CHECKED_IN",
      entityType: "Ticket",
      entityId: ticketId,
      details: { reservationId: ticket.reservationId },
    });
  });
  revalidatePath(`/check-in/${code}`);
}

export async function checkInAccreditation(
  accreditationId: string,
  code: string,
) {
  const session = await requirePermission("check-in:operate");
  await prisma.$transaction(async (tx) => {
    const accreditation = await tx.accreditation.findUniqueOrThrow({
      where: { id: accreditationId },
    });
    if (accreditation.status !== "APPROVED") {
      throw new Error("ACCREDITATION_NOT_APPROVED");
    }
    const existing = await tx.checkIn.findFirst({
      where: { accreditationId, type: "ACCREDITATION" },
    });
    if (existing) throw new Error("ALREADY_CHECKED_IN");
    await tx.checkIn.create({
      data: {
        type: "ACCREDITATION",
        accreditationId,
        checkedInById: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ACCREDITATION_CHECKED_IN",
      entityType: "Accreditation",
      entityId: accreditationId,
      details: { eventId: accreditation.eventId },
    });
  });
  revalidatePath(`/check-in/${code}`);
}

export async function collectOrder(orderId: string, code: string) {
  const session = await requirePermission("check-in:operate");
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.paymentStatus !== "PAID" || order.status !== "READY") {
      throw new Error("ORDER_NOT_COLLECTIBLE");
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: "COLLECTED", collectedAt: new Date() },
    });
    await tx.checkIn.create({
      data: {
        type: "ORDER_COLLECTION",
        orderId,
        checkedInById: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ORDER_COLLECTED",
      entityType: "Order",
      entityId: orderId,
      details: { eventId: order.eventId },
    });
  });
  revalidatePath(`/check-in/${code}`);
}
