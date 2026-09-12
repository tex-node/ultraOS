import { LaunchBlockerPriority, OpsHealthStatus, OpsItemStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type OpsSignal = {
  label: string;
  status: OpsHealthStatus;
  value: string | number;
  href?: string;
};

export function statusFromCounts(red: number, amber: number): OpsHealthStatus {
  if (red > 0) return OpsHealthStatus.RED;
  if (amber > 0) return OpsHealthStatus.AMBER;
  return OpsHealthStatus.GREEN;
}

export function isOverdue(dueAt: Date | null | undefined, status: OpsItemStatus) {
  const closedStatuses: OpsItemStatus[] = [OpsItemStatus.COMPLETE, OpsItemStatus.CANCELLED];
  return Boolean(dueAt && dueAt.getTime() < Date.now() && !closedStatuses.includes(status));
}

export async function operationsSnapshot(db: Prisma.TransactionClient) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayStart.getDate() + 1);

  const [
    season,
    currentEvent,
    draftEvent,
    gamesToday,
    pendingApplications,
    pendingImports,
    openIncidents,
    openTasks,
    overdueTasks,
    openChecklists,
    reservations,
    orders,
    notifications,
    displayIssues,
    equipmentIssues,
    openP0Blockers,
    openP1Blockers,
    latestAudit,
  ] = await Promise.all([
    db.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } }),
    db.event.findFirst({ where: { date: { gte: todayStart } }, orderBy: { date: "asc" } }),
    db.draftEvent.findFirst({ where: { status: { in: ["READY", "LIVE", "PAUSED"] } }, orderBy: { updatedAt: "desc" } }),
    db.fixture.count({ where: { scheduledAt: { gte: todayStart, lt: todayEnd } } }),
    db.application.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.importJob.count({ where: { status: { in: ["UPLOADED", "PARSED", "NEEDS_REVIEW", "READY", "PROCESSING"] } } }),
    db.incident.count({ where: { status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.opsTask.count({ where: { status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.opsTask.count({ where: { dueAt: { lt: new Date() }, status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.operationalChecklist.count({ where: { status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.seatReservation.count({ where: { status: "CONFIRMED" } }),
    db.order.count({ where: { status: { in: ["PENDING_PAYMENT", "PAID", "PREPARING", "READY"] } } }),
    db.opsNotification.count({ where: { status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.displayHeartbeat.count({ where: { status: { in: ["AMBER", "RED"] } } }),
    db.equipment.count({ where: { status: { in: ["MAINTENANCE", "MISSING"] } } }),
    db.launchReadinessCheck.count({ where: { priority: LaunchBlockerPriority.P0, status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.launchReadinessCheck.count({ where: { priority: LaunchBlockerPriority.P1, status: { notIn: ["COMPLETE", "CANCELLED"] } } }),
    db.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { action: true, createdAt: true } }),
  ]);

  const competitionSignals: OpsSignal[] = [
    { label: "Current Season", status: season ? OpsHealthStatus.GREEN : OpsHealthStatus.RED, value: season?.name ?? "Missing" },
    { label: "Current Event", status: currentEvent ? OpsHealthStatus.GREEN : OpsHealthStatus.AMBER, value: currentEvent?.name ?? "No upcoming event" },
    { label: "Current Draft", status: draftEvent ? OpsHealthStatus.GREEN : OpsHealthStatus.AMBER, value: draftEvent?.publicTitle ?? "No live Draft Day" },
    { label: "Current Stage", status: draftEvent ? OpsHealthStatus.GREEN : OpsHealthStatus.AMBER, value: draftEvent?.currentStage.replaceAll("_", " ") ?? "None" },
    { label: "Games Today", status: gamesToday > 0 ? OpsHealthStatus.GREEN : OpsHealthStatus.AMBER, value: gamesToday },
    { label: "Standings Updated", status: OpsHealthStatus.GREEN, value: "Available" },
  ];

  const operationsSignals: OpsSignal[] = [
    { label: "Pending applications", href: "/applications", status: statusFromCounts(0, pendingApplications), value: pendingApplications },
    { label: "Pending imports", href: "/imports", status: statusFromCounts(0, pendingImports), value: pendingImports },
    { label: "P0 launch blockers", href: "/launch-readiness", status: statusFromCounts(openP0Blockers, 0), value: openP0Blockers },
    { label: "P1 launch blockers", href: "/launch-readiness", status: statusFromCounts(0, openP1Blockers), value: openP1Blockers },
    { label: "Open incidents", href: "/incidents", status: statusFromCounts(openIncidents, 0), value: openIncidents },
    { label: "Open tasks", href: "/tasks", status: statusFromCounts(overdueTasks, openTasks), value: openTasks },
    { label: "Open checklists", href: "/runbooks", status: statusFromCounts(0, openChecklists), value: openChecklists },
    { label: "Pending orders", href: "/orders", status: statusFromCounts(0, orders), value: orders },
  ];

  const commerceSignals: OpsSignal[] = [
    { label: "Reservations", href: "/events", status: OpsHealthStatus.GREEN, value: reservations },
    { label: "Food Orders", href: "/orders", status: statusFromCounts(0, orders), value: orders },
    { label: "Revenue", status: OpsHealthStatus.AMBER, value: "Use Orders" },
    { label: "Sponsor Impressions", status: OpsHealthStatus.AMBER, value: "Tracked" },
  ];

  const systemSignals: OpsSignal[] = [
    { label: "Database", status: OpsHealthStatus.GREEN, value: "Connected" },
    { label: "Storage", status: OpsHealthStatus.GREEN, value: "Configured" },
    { label: "Display Issues", href: "/display-monitoring", status: statusFromCounts(displayIssues, 0), value: displayIssues },
    { label: "Equipment Issues", href: "/equipment", status: statusFromCounts(equipmentIssues, 0), value: equipmentIssues },
    { label: "Notifications", href: "/notifications", status: statusFromCounts(0, notifications), value: notifications },
    { label: "Latest Audit", href: "/audit", status: OpsHealthStatus.GREEN, value: latestAudit ? `${latestAudit.action}` : "None" },
  ];

  return { commerceSignals, competitionSignals, operationsSignals, systemSignals };
}
