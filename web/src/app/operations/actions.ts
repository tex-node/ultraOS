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
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

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

async function audit(action: string, entityType: string, entityId: string, userId: string, details?: Record<string, unknown>) {
  await prisma.$transaction((tx) =>
    writeAuditLog(tx, { action, details: details as Prisma.InputJsonValue | undefined, entityId, entityType, userId }),
  );
}

export async function createIncident(formData: FormData) {
  const session = await requirePermission("incident:manage");
  const incident = await prisma.incident.create({
    data: {
      description: value(formData, "description") || null,
      eventId: value(formData, "eventId") || null,
      ownerUserId: value(formData, "ownerUserId") || null,
      reportedById: session.user.id,
      severity: (value(formData, "severity") || OpsSeverity.MEDIUM) as OpsSeverity,
      title: value(formData, "title"),
      type: (value(formData, "type") || IncidentType.OTHER) as IncidentType,
    },
  });
  await audit("INCIDENT_CREATED", "Incident", incident.id, session.user.id, { severity: incident.severity, type: incident.type });
  revalidatePath("/incidents");
  revalidatePath("/operations");
}

export async function updateIncidentStatus(incidentId: string, formData: FormData) {
  const session = await requirePermission("incident:manage");
  const status = (value(formData, "status") || OpsItemStatus.IN_PROGRESS) as OpsItemStatus;
  const incident = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      resolution: value(formData, "resolution") || null,
      resolvedAt: status === OpsItemStatus.COMPLETE ? new Date() : null,
      status,
    },
  });
  await audit("INCIDENT_STATUS_UPDATED", "Incident", incident.id, session.user.id, { status });
  revalidatePath("/incidents");
  revalidatePath("/operations");
}

export async function createChecklist(formData: FormData) {
  const session = await requirePermission("operations:manage");
  const checklist = await prisma.operationalChecklist.create({
    data: {
      category: value(formData, "category") || "Draft Day",
      createdById: session.user.id,
      eventId: value(formData, "eventId") || null,
      name: value(formData, "name"),
    },
  });
  await audit("OPERATIONAL_CHECKLIST_CREATED", "OperationalChecklist", checklist.id, session.user.id);
  revalidatePath("/runbooks");
  revalidatePath("/operations");
}

export async function addChecklistItem(checklistId: string, formData: FormData) {
  const session = await requirePermission("operations:manage");
  const item = await prisma.operationalChecklistItem.create({
    data: {
      checklistId,
      description: value(formData, "description") || null,
      dueAt: optionalDate(formData, "dueAt"),
      label: value(formData, "label"),
      ownerUserId: value(formData, "ownerUserId") || null,
    },
  });
  await audit("OPERATIONAL_CHECKLIST_ITEM_ADDED", "OperationalChecklistItem", item.id, session.user.id, { checklistId });
  revalidatePath("/runbooks");
  revalidatePath("/operations");
}

export async function updateChecklistItemStatus(itemId: string, formData: FormData) {
  const session = await requirePermission("operations:manage");
  const status = (value(formData, "status") || OpsItemStatus.COMPLETE) as OpsItemStatus;
  const item = await prisma.operationalChecklistItem.update({
    where: { id: itemId },
    data: {
      completedAt: status === OpsItemStatus.COMPLETE ? new Date() : null,
      completedById: status === OpsItemStatus.COMPLETE ? session.user.id : null,
      notes: value(formData, "notes") || null,
      status,
    },
  });
  await audit("OPERATIONAL_CHECKLIST_ITEM_STATUS_UPDATED", "OperationalChecklistItem", item.id, session.user.id, { status });
  revalidatePath("/runbooks");
  revalidatePath("/operations");
}

export async function createRunbook(formData: FormData) {
  const session = await requirePermission("runbook:manage");
  const runbook = await prisma.runbook.create({
    data: {
      category: value(formData, "category") || "Match Day",
      createdById: session.user.id,
      eventId: value(formData, "eventId") || null,
      name: value(formData, "name"),
    },
  });
  await audit("RUNBOOK_CREATED", "Runbook", runbook.id, session.user.id);
  revalidatePath("/runbooks");
}

export async function addRunbookTask(runbookId: string, formData: FormData) {
  const session = await requirePermission("runbook:manage");
  const task = await prisma.runbookTask.create({
    data: {
      dueAt: optionalDate(formData, "dueAt"),
      notes: value(formData, "notes") || null,
      responsible: value(formData, "responsible") || null,
      runbookId,
      title: value(formData, "title"),
    },
  });
  await audit("RUNBOOK_TASK_ADDED", "RunbookTask", task.id, session.user.id, { runbookId });
  revalidatePath("/runbooks");
}

export async function createOperatorMessage(formData: FormData) {
  const session = await requirePermission("operations:manage");
  const message = await prisma.operatorMessage.create({
    data: {
      createdById: session.user.id,
      eventId: value(formData, "eventId") || null,
      message: value(formData, "message"),
      severity: (value(formData, "severity") || OpsSeverity.MEDIUM) as OpsSeverity,
      title: value(formData, "title"),
    },
  });
  await audit("OPERATOR_MESSAGE_CREATED", "OperatorMessage", message.id, session.user.id, { severity: message.severity });
  revalidatePath("/operations");
  revalidatePath("/notifications");
}

export async function createRehearsal(formData: FormData) {
  const session = await requirePermission("operations:manage");
  const rehearsal = await prisma.rehearsal.create({
    data: {
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
  await audit("REHEARSAL_CREATED", "Rehearsal", rehearsal.id, session.user.id, { type: rehearsal.type });
  revalidatePath("/rehearsals");
}

export async function createEquipment(formData: FormData) {
  const session = await requirePermission("equipment:manage");
  const equipment = await prisma.equipment.create({
    data: {
      assignedOperatorId: value(formData, "assignedOperatorId") || null,
      batteryPercent: numberValue(formData, "batteryPercent"),
      name: value(formData, "name"),
      notes: value(formData, "notes") || null,
      serial: value(formData, "serial") || null,
      status: (value(formData, "status") || EquipmentStatus.AVAILABLE) as EquipmentStatus,
      type: value(formData, "type"),
    },
  });
  await audit("EQUIPMENT_CREATED", "Equipment", equipment.id, session.user.id, { type: equipment.type });
  revalidatePath("/equipment");
  revalidatePath("/operations");
}

export async function createOpsTask(formData: FormData) {
  const session = await requirePermission("operations:manage");
  const task = await prisma.opsTask.create({
    data: {
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
  await audit("OPS_TASK_CREATED", "OpsTask", task.id, session.user.id, { priority: task.priority });
  revalidatePath("/tasks");
  revalidatePath("/operations");
}

export async function updateOpsTaskStatus(taskId: string, formData: FormData) {
  const session = await requirePermission("operations:manage");
  const status = (value(formData, "status") || OpsItemStatus.COMPLETE) as OpsItemStatus;
  const task = await prisma.opsTask.update({ where: { id: taskId }, data: { status, notes: value(formData, "notes") || undefined } });
  await audit("OPS_TASK_STATUS_UPDATED", "OpsTask", task.id, session.user.id, { status });
  revalidatePath("/tasks");
  revalidatePath("/operations");
}

export async function createNotification(formData: FormData) {
  const session = await requirePermission("notification:manage");
  const notification = await prisma.opsNotification.create({
    data: {
      category: value(formData, "category") || "General",
      createdById: session.user.id,
      eventId: value(formData, "eventId") || null,
      message: value(formData, "message"),
      severity: (value(formData, "severity") || OpsSeverity.MEDIUM) as OpsSeverity,
      title: value(formData, "title"),
    },
  });
  await audit("OPS_NOTIFICATION_CREATED", "OpsNotification", notification.id, session.user.id, { category: notification.category });
  revalidatePath("/notifications");
  revalidatePath("/operations");
}

export async function createDocument(formData: FormData) {
  const session = await requirePermission("document:manage");
  const document = await prisma.opsDocument.create({
    data: {
      category: value(formData, "category") || "General",
      eventId: value(formData, "eventId") || null,
      fileUrl: value(formData, "fileUrl") || null,
      notes: value(formData, "notes") || null,
      title: value(formData, "title"),
      uploadedById: session.user.id,
    },
  });
  await audit("OPS_DOCUMENT_CREATED", "OpsDocument", document.id, session.user.id, { category: document.category });
  revalidatePath("/documents");
}

export async function upsertDisplayHeartbeat(formData: FormData) {
  await requirePermission("operations:manage");
  const eventId = value(formData, "eventId") || "GLOBAL";
  const surface = (value(formData, "surface") || DisplaySurface.PUBLIC_DISPLAY) as DisplaySurface;
  const label = value(formData, "label") || surface;
  await prisma.displayHeartbeat.upsert({
    where: { eventId_surface_label: { eventId, label, surface } },
    update: { lastSeenAt: new Date(), status: (value(formData, "status") || OpsHealthStatus.GREEN) as OpsHealthStatus },
    create: { eventId, label, lastSeenAt: new Date(), status: (value(formData, "status") || OpsHealthStatus.GREEN) as OpsHealthStatus, surface },
  });
  revalidatePath("/display-monitoring");
  revalidatePath("/operations");
}

export async function createLaunchReadinessCheck(formData: FormData) {
  const session = await requirePermission("operations:manage");
  const check = await prisma.launchReadinessCheck.create({
    data: {
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
  await audit("LAUNCH_READINESS_CHECK_CREATED", "LaunchReadinessCheck", check.id, session.user.id, {
    priority: check.priority,
    category: check.category,
  });
  revalidatePath("/launch-readiness");
  revalidatePath("/operations");
}

export async function updateLaunchReadinessCheckStatus(checkId: string, formData: FormData) {
  const session = await requirePermission("operations:manage");
  const status = (value(formData, "status") || OpsItemStatus.IN_PROGRESS) as OpsItemStatus;
  const check = await prisma.launchReadinessCheck.update({
    where: { id: checkId },
    data: {
      details: value(formData, "details") || undefined,
      evidenceUrl: value(formData, "evidenceUrl") || undefined,
      resolvedAt: status === OpsItemStatus.COMPLETE ? new Date() : null,
      status,
    },
  });
  await audit("LAUNCH_READINESS_CHECK_STATUS_UPDATED", "LaunchReadinessCheck", check.id, session.user.id, {
    priority: check.priority,
    status,
  });
  revalidatePath("/launch-readiness");
  revalidatePath("/operations");
}
