"use server";

import { revalidatePath } from "next/cache";
import {
  DisplaySurface,
  EquipmentStatus,
  IncidentType,
  LaunchBlockerPriority,
  OpsHealthStatus,
  OpsItemStatus,
  OpsSeverity,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { assertSameOrganization, requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function optionalDate(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberValue(formData: FormData, key: string) {
  const raw = value(formData, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Phase 1 Stage 5.2A: every action resolves organizationId from the authenticated session,
// wraps its create/update AND its audit write in the SAME withOrganizationContext() transaction
// (this also fixes a pre-existing gap - the old audit() helper opened a second, separate
// transaction, so a create could succeed with no matching audit entry if the process died
// between the two), and every create explicitly stamps organizationId rather than relying on the
// temporary Stage 3a default.

export async function createIncident(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("incident:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const incident = await tx.incident.create({
      data: {
        organizationId,
        description: value(formData, "description") || null,
        eventId: value(formData, "eventId") || null,
        ownerUserId: value(formData, "ownerUserId") || null,
        reportedById: session.user.id,
        severity: (value(formData, "severity") || OpsSeverity.MEDIUM) as OpsSeverity,
        title: value(formData, "title"),
        type: (value(formData, "type") || IncidentType.OTHER) as IncidentType,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "INCIDENT_CREATED", entityType: "Incident", entityId: incident.id, userId: session.user.id, details: { severity: incident.severity, type: incident.type } });
  });
  revalidatePath("/incidents");
  revalidatePath("/operations");
}

export async function updateIncidentStatus(incidentId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("incident:manage");
  const status = (value(formData, "status") || OpsItemStatus.IN_PROGRESS) as OpsItemStatus;
  await withOrganizationContext(organizationId, async (tx) => {
    const incident = await tx.incident.update({
      where: { id: incidentId },
      data: {
        resolution: value(formData, "resolution") || null,
        resolvedAt: status === OpsItemStatus.COMPLETE ? new Date() : null,
        status,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "INCIDENT_STATUS_UPDATED", entityType: "Incident", entityId: incident.id, userId: session.user.id, details: { status } });
  });
  revalidatePath("/incidents");
  revalidatePath("/operations");
}

export async function createChecklist(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const checklist = await tx.operationalChecklist.create({
      data: {
        organizationId,
        category: value(formData, "category") || "Draft Day",
        createdById: session.user.id,
        eventId: value(formData, "eventId") || null,
        name: value(formData, "name"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPERATIONAL_CHECKLIST_CREATED", entityType: "OperationalChecklist", entityId: checklist.id, userId: session.user.id });
  });
  revalidatePath("/runbooks");
  revalidatePath("/operations");
}

export async function addChecklistItem(checklistId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const checklist = await tx.operationalChecklist.findUnique({ where: { id: checklistId } });
    assertSameOrganization(checklist, organizationId, "Checklist");
    const item = await tx.operationalChecklistItem.create({
      data: {
        organizationId,
        checklistId,
        description: value(formData, "description") || null,
        dueAt: optionalDate(formData, "dueAt"),
        label: value(formData, "label"),
        ownerUserId: value(formData, "ownerUserId") || null,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPERATIONAL_CHECKLIST_ITEM_ADDED", entityType: "OperationalChecklistItem", entityId: item.id, userId: session.user.id, details: { checklistId } });
  });
  revalidatePath("/runbooks");
  revalidatePath("/operations");
}

export async function updateChecklistItemStatus(itemId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const status = (value(formData, "status") || OpsItemStatus.COMPLETE) as OpsItemStatus;
  await withOrganizationContext(organizationId, async (tx) => {
    const item = await tx.operationalChecklistItem.update({
      where: { id: itemId },
      data: {
        completedAt: status === OpsItemStatus.COMPLETE ? new Date() : null,
        completedById: status === OpsItemStatus.COMPLETE ? session.user.id : null,
        notes: value(formData, "notes") || null,
        status,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPERATIONAL_CHECKLIST_ITEM_STATUS_UPDATED", entityType: "OperationalChecklistItem", entityId: item.id, userId: session.user.id, details: { status } });
  });
  revalidatePath("/runbooks");
  revalidatePath("/operations");
}

export async function createRunbook(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("runbook:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const runbook = await tx.runbook.create({
      data: {
        organizationId,
        category: value(formData, "category") || "Match Day",
        createdById: session.user.id,
        eventId: value(formData, "eventId") || null,
        name: value(formData, "name"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "RUNBOOK_CREATED", entityType: "Runbook", entityId: runbook.id, userId: session.user.id });
  });
  revalidatePath("/runbooks");
}

export async function addRunbookTask(runbookId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("runbook:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const runbook = await tx.runbook.findUnique({ where: { id: runbookId } });
    assertSameOrganization(runbook, organizationId, "Runbook");
    const task = await tx.runbookTask.create({
      data: {
        organizationId,
        dueAt: optionalDate(formData, "dueAt"),
        notes: value(formData, "notes") || null,
        responsible: value(formData, "responsible") || null,
        runbookId,
        title: value(formData, "title"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "RUNBOOK_TASK_ADDED", entityType: "RunbookTask", entityId: task.id, userId: session.user.id, details: { runbookId } });
  });
  revalidatePath("/runbooks");
}

export async function createOperatorMessage(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const message = await tx.operatorMessage.create({
      data: {
        organizationId,
        createdById: session.user.id,
        eventId: value(formData, "eventId") || null,
        message: value(formData, "message"),
        severity: (value(formData, "severity") || OpsSeverity.MEDIUM) as OpsSeverity,
        title: value(formData, "title"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPERATOR_MESSAGE_CREATED", entityType: "OperatorMessage", entityId: message.id, userId: session.user.id, details: { severity: message.severity } });
  });
  revalidatePath("/operations");
  revalidatePath("/notifications");
}

export async function createRehearsal(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const rehearsal = await tx.rehearsal.create({
      data: {
        organizationId,
        createdById: session.user.id,
        durationMinutes: numberValue(formData, "durationMinutes"),
        eventId: value(formData, "eventId") || null,
        issuesFound: value(formData, "issuesFound") || null,
        name: value(formData, "name"),
        outstandingActions: value(formData, "outstandingActions") || null,
        rehearsalDate: optionalDate(formData, "rehearsalDate") ?? new Date(),
        type: value(formData, "type") || "Draft rehearsal",
      },
    });
    await writeAuditLog(tx, { organizationId, action: "REHEARSAL_CREATED", entityType: "Rehearsal", entityId: rehearsal.id, userId: session.user.id, details: { type: rehearsal.type } });
  });
  revalidatePath("/rehearsals");
}

export async function createEquipment(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("equipment:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const equipment = await tx.equipment.create({
      data: {
        organizationId,
        assignedOperatorId: value(formData, "assignedOperatorId") || null,
        batteryPercent: numberValue(formData, "batteryPercent"),
        name: value(formData, "name"),
        notes: value(formData, "notes") || null,
        serial: value(formData, "serial") || null,
        status: (value(formData, "status") || EquipmentStatus.AVAILABLE) as EquipmentStatus,
        type: value(formData, "type"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "EQUIPMENT_CREATED", entityType: "Equipment", entityId: equipment.id, userId: session.user.id, details: { type: equipment.type } });
  });
  revalidatePath("/equipment");
  revalidatePath("/operations");
}

export async function createOpsTask(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const task = await tx.opsTask.create({
      data: {
        organizationId,
        createdById: session.user.id,
        dependsOnId: value(formData, "dependsOnId") || null,
        dueAt: optionalDate(formData, "dueAt"),
        eventId: value(formData, "eventId") || null,
        notes: value(formData, "notes") || null,
        ownerUserId: value(formData, "ownerUserId") || null,
        priority: (value(formData, "priority") || OpsSeverity.MEDIUM) as OpsSeverity,
        title: value(formData, "title"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPS_TASK_CREATED", entityType: "OpsTask", entityId: task.id, userId: session.user.id, details: { priority: task.priority } });
  });
  revalidatePath("/tasks");
  revalidatePath("/operations");
}

export async function updateOpsTaskStatus(taskId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const status = (value(formData, "status") || OpsItemStatus.COMPLETE) as OpsItemStatus;
  await withOrganizationContext(organizationId, async (tx) => {
    const task = await tx.opsTask.update({ where: { id: taskId }, data: { status, notes: value(formData, "notes") || undefined } });
    await writeAuditLog(tx, { organizationId, action: "OPS_TASK_STATUS_UPDATED", entityType: "OpsTask", entityId: task.id, userId: session.user.id, details: { status } });
  });
  revalidatePath("/tasks");
  revalidatePath("/operations");
}

export async function createNotification(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("notification:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const notification = await tx.opsNotification.create({
      data: {
        organizationId,
        category: value(formData, "category") || "General",
        createdById: session.user.id,
        eventId: value(formData, "eventId") || null,
        message: value(formData, "message"),
        severity: (value(formData, "severity") || OpsSeverity.MEDIUM) as OpsSeverity,
        title: value(formData, "title"),
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPS_NOTIFICATION_CREATED", entityType: "OpsNotification", entityId: notification.id, userId: session.user.id, details: { category: notification.category } });
  });
  revalidatePath("/notifications");
  revalidatePath("/operations");
}

export async function createDocument(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("document:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const document = await tx.opsDocument.create({
      data: {
        organizationId,
        category: value(formData, "category") || "General",
        eventId: value(formData, "eventId") || null,
        fileUrl: value(formData, "fileUrl") || null,
        notes: value(formData, "notes") || null,
        title: value(formData, "title"),
        uploadedById: session.user.id,
      },
    });
    await writeAuditLog(tx, { organizationId, action: "OPS_DOCUMENT_CREATED", entityType: "OpsDocument", entityId: document.id, userId: session.user.id, details: { category: document.category } });
  });
  revalidatePath("/documents");
}

export async function upsertDisplayHeartbeat(formData: FormData) {
  const { organizationId } = await requirePermissionWithOrganization("operations:manage");
  const eventId = value(formData, "eventId") || "GLOBAL";
  const surface = (value(formData, "surface") || DisplaySurface.PUBLIC_DISPLAY) as DisplaySurface;
  const label = value(formData, "label") || surface;
  await withOrganizationContext(organizationId, (tx) =>
    tx.displayHeartbeat.upsert({
      where: { eventId_surface_label: { eventId, label, surface } },
      update: { lastSeenAt: new Date(), status: (value(formData, "status") || OpsHealthStatus.GREEN) as OpsHealthStatus },
      create: { organizationId, eventId, label, lastSeenAt: new Date(), status: (value(formData, "status") || OpsHealthStatus.GREEN) as OpsHealthStatus, surface },
    }),
  );
  revalidatePath("/display-monitoring");
  revalidatePath("/operations");
}

export async function createLaunchReadinessCheck(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const check = await tx.launchReadinessCheck.create({
      data: {
        organizationId,
        category: value(formData, "category") || "General",
        createdById: session.user.id,
        details: value(formData, "details") || null,
        dueAt: optionalDate(formData, "dueAt"),
        eventId: value(formData, "eventId") || null,
        evidenceUrl: value(formData, "evidenceUrl") || null,
        ownerUserId: value(formData, "ownerUserId") || null,
        priority: (value(formData, "priority") || LaunchBlockerPriority.P2) as LaunchBlockerPriority,
        seasonId: value(formData, "seasonId") || null,
        title: value(formData, "title"),
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "LAUNCH_READINESS_CHECK_CREATED",
      entityType: "LaunchReadinessCheck",
      entityId: check.id,
      userId: session.user.id,
      details: { priority: check.priority, category: check.category },
    });
  });
  revalidatePath("/launch-readiness");
  revalidatePath("/operations");
}

export async function updateLaunchReadinessCheckStatus(checkId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const status = (value(formData, "status") || OpsItemStatus.IN_PROGRESS) as OpsItemStatus;
  await withOrganizationContext(organizationId, async (tx) => {
    const check = await tx.launchReadinessCheck.update({
      where: { id: checkId },
      data: {
        details: value(formData, "details") || undefined,
        evidenceUrl: value(formData, "evidenceUrl") || undefined,
        resolvedAt: status === OpsItemStatus.COMPLETE ? new Date() : null,
        status,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "LAUNCH_READINESS_CHECK_STATUS_UPDATED",
      entityType: "LaunchReadinessCheck",
      entityId: check.id,
      userId: session.user.id,
      details: { priority: check.priority, status },
    });
  });
  revalidatePath("/launch-readiness");
  revalidatePath("/operations");
}
