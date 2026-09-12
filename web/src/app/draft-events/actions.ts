"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AllocationStatus, AllocationSubjectType, DraftEventOperatingMode, DraftEventStage, DraftEventStatus } from "@/generated/prisma/enums";
import {
  assertReadyToStart,
  confirmAllocation,
  correctAllocation,
  markAllocationRevealing,
  reserveNextAllocation,
  resetRehearsalAllocations,
  revealAllocation,
} from "@/lib/draft-events";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function intValue(formData: FormData, key: string, fallback = 1) {
  const parsed = Number(value(formData, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createDraftEvent(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:configure");
  const name = value(formData, "name");
  const publicTitle = value(formData, "publicTitle") || name;
  const seasonId = value(formData, "seasonId");
  if (!name || !seasonId) throw new Error("Draft event name and season are required.");
  const draftEvent = await withOrganizationContext(organizationId, async (tx) => {
    const created = await tx.draftEvent.create({
      data: {
        organizationId,
        createdById: session.user.id,
        displayToken: randomBytes(24).toString("hex"),
        eventId: value(formData, "eventId") || null,
        name,
        publicTitle,
        seasonId,
        sponsorLogoUrl: value(formData, "sponsorLogoUrl") || null,
        sponsorName: value(formData, "sponsorName") || null,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "DRAFT_EVENT_CREATED",
      details: { draftEventId: created.id, seasonId },
      entityId: created.id,
      entityType: "DraftEvent",
      userId: session.user.id,
    });
    return created;
  });
  revalidatePath("/draft-events");
  redirect(`/draft-events/${draftEvent.id}`);
}

export async function createDraftSquad(draftEventId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-squad:manage");
  const squad = await withOrganizationContext(organizationId, async (tx) => {
    const event = await tx.draftEvent.findUniqueOrThrow({ where: { id: draftEventId }, select: { seasonId: true, status: true } });
    if (event.status === DraftEventStatus.LIVE) throw new Error("Cannot edit squads while event is live.");
    const created = await tx.draftSquad.create({
      data: {
        organizationId,
        color: value(formData, "color") || null,
        divisionId: value(formData, "divisionId"),
        draftEventId,
        iconUrl: value(formData, "iconUrl") || null,
        name: value(formData, "name"),
        publicLabel: value(formData, "publicLabel") || null,
        seasonId: event.seasonId,
        sequence: intValue(formData, "sequence"),
        shortName: value(formData, "shortName") || null,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_SQUAD_CREATED", entityId: created.id, entityType: "DraftSquad", userId: session.user.id, details: { draftEventId } });
    return created;
  });
  revalidatePath(`/draft-events/${draftEventId}/squads`);
  redirect(`/draft-events/${draftEventId}/squads/${squad.id}`);
}

export async function addSquadMember(draftEventId: string, squadId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-squad:manage");
  const playerId = value(formData, "playerId");
  await withOrganizationContext(organizationId, async (tx) => {
    const squad = await tx.draftSquad.findUniqueOrThrow({ where: { id: squadId }, include: { draftEvent: true } });
    if (squad.draftEvent.status === DraftEventStatus.LIVE) throw new Error("Cannot edit squads while event is live.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { seasonId: true, seasonClubId: true } });
    if (player.seasonId !== squad.seasonId || player.seasonClubId) throw new Error("Player is not eligible for this squad.");
    const duplicate = await tx.draftSquadMember.findFirst({ where: { playerId, draftSquad: { draftEventId } }, select: { id: true } });
    if (duplicate) throw new Error("Player already belongs to a squad in this DraftEvent.");
    const member = await tx.draftSquadMember.create({
      data: { organizationId, captain: value(formData, "captain") === "on", draftSquadId: squadId, playerId, sequence: intValue(formData, "sequence", 1) },
    });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_SQUAD_MEMBER_ADDED", entityId: member.id, entityType: "DraftSquadMember", userId: session.user.id, details: { draftEventId, playerId, squadId } });
  });
  revalidatePath(`/draft-events/${draftEventId}/squads/${squadId}`);
}

export async function removeSquadMember(draftEventId: string, squadId: string, memberId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-squad:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.draftSquadMember.delete({ where: { id: memberId } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_SQUAD_MEMBER_REMOVED", entityId: memberId, entityType: "DraftSquadMember", userId: session.user.id, details: { draftEventId, squadId } });
  });
  revalidatePath(`/draft-events/${draftEventId}/squads/${squadId}`);
}

export async function addCoachPoolEntry(draftEventId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-coach-pool:manage");
  const divisionId = value(formData, "divisionId");
  const staffId = value(formData, "staffId");
  await withOrganizationContext(organizationId, async (tx) => {
    // Phase 1 Stage 5.2B-3: draftEventId/divisionId/staffId all arrive as client-supplied
    // values (a route param and two form fields) and none of DraftCoachPoolEntry's three FKs
    // got a composite tenant-aware constraint this stage (see
    // PHASE1_STAGE5_2B3_DRAFT_TRYOUT_COACH_TENANCY.md), so this action is the only thing
    // standing between an Org B admin and silently pooling an Org A DraftEvent/Division/Staff
    // row - each must be resolved through this same scoped tx first. A foreign-org id is
    // invisible to RLS here and throws (not-found), never reaching the create below.
    await tx.draftEvent.findUniqueOrThrow({ where: { id: draftEventId }, select: { id: true } });
    await tx.division.findUniqueOrThrow({ where: { id: divisionId }, select: { id: true } });
    await tx.staff.findUniqueOrThrow({ where: { id: staffId }, select: { id: true } });
    const entry = await tx.draftCoachPoolEntry.create({
      data: {
        organizationId,
        divisionId,
        draftEventId,
        eligibleAssistantCoach: value(formData, "eligibleAssistantCoach") === "on",
        eligibleHeadCoach: value(formData, "eligibleHeadCoach") !== "off",
        photoUrl: value(formData, "photoUrl") || null,
        publicBio: value(formData, "publicBio") || null,
        sequence: intValue(formData, "sequence", 1),
        staffId,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_COACH_POOL_ENTRY_ADDED", entityId: entry.id, entityType: "DraftCoachPoolEntry", userId: session.user.id, details: { draftEventId } });
  });
  revalidatePath(`/draft-events/${draftEventId}/coaches`);
}

export async function startDraftEvent(draftEventId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    await assertReadyToStart(tx, draftEventId);
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { operatingMode: DraftEventOperatingMode.LIVE, startedAt: new Date(), status: DraftEventStatus.LIVE, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_STARTED_LIVE", entityId: draftEventId, entityType: "DraftEvent", userId: session.user.id });
  });
  revalidatePath(`/draft-events/${draftEventId}`);
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function startRehearsalDraftEvent(draftEventId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    const confirmedLive = await tx.draftAllocation.count({ where: { draftEventId, operatingMode: DraftEventOperatingMode.LIVE, status: AllocationStatus.CONFIRMED } });
    if (confirmedLive > 0) throw new Error("Cannot start rehearsal after official LIVE completion.");
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { operatingMode: DraftEventOperatingMode.REHEARSAL, startedAt: new Date(), status: DraftEventStatus.LIVE, displaySequence: { increment: 1 }, publicMessage: "Rehearsal mode started" } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_STARTED_REHEARSAL", entityId: draftEventId, entityType: "DraftEvent", userId: session.user.id });
  });
  revalidatePath(`/draft-events/${draftEventId}`);
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function setDraftEventStage(draftEventId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  const stage = value(formData, "stage") as DraftEventStage;
  if (!Object.values(DraftEventStage).includes(stage)) throw new Error("Invalid stage.");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { currentStage: stage, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_STAGE_CHANGED", entityId: draftEventId, entityType: "DraftEvent", userId: session.user.id, details: { stage } });
  });
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function reserveAllocationAction(draftEventId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  await reserveNextAllocation({
    organizationId,
    divisionId: value(formData, "divisionId"),
    draftEventId,
    subjectType: value(formData, "subjectType") as AllocationSubjectType,
    userId: session.user.id,
  });
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function startSuspenseAction(draftEventId: string, allocationId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:reveal");
  await markAllocationRevealing(organizationId, allocationId, session.user.id);
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function revealAllocationAction(draftEventId: string, allocationId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:reveal");
  await revealAllocation(organizationId, allocationId, session.user.id);
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function confirmAllocationAction(draftEventId: string, allocationId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:confirm");
  await confirmAllocation(organizationId, allocationId, session.user.id);
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function pauseDraftEvent(draftEventId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { pausedAt: new Date(), status: DraftEventStatus.PAUSED, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_PAUSED", entityId: draftEventId, entityType: "DraftEvent", userId: session.user.id });
  });
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function completeDraftEvent(draftEventId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:complete");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.draftEvent.update({ where: { id: draftEventId }, data: { completedAt: new Date(), currentStage: DraftEventStage.COMPLETED, status: DraftEventStatus.COMPLETED, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_COMPLETED", entityId: draftEventId, entityType: "DraftEvent", userId: session.user.id });
  });
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function resetRehearsalAction(draftEventId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:correct");
  await resetRehearsalAllocations(organizationId, draftEventId, session.user.id, value(formData, "reason"));
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}

export async function correctAllocationAction(draftEventId: string, allocationId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:correct");
  await correctAllocation(organizationId, allocationId, session.user.id, value(formData, "reason"));
  revalidatePath(`/draft-events/${draftEventId}/control`);
  revalidatePath(`/draft-events/${draftEventId}/display`);
}
