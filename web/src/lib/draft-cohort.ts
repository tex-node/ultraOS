import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import type { Prisma } from "@/generated/prisma/client";
import { ApplicationStatus, DraftSelectionGroup } from "@/generated/prisma/enums";
import { approvedPlayerDuplicateGroups } from "@/lib/data-quality";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

type Db = Prisma.TransactionClient | typeof prisma;

export const draftCohortLabel = "SEASON_ZERO_DRAFT_COHORT";
const rowResolutionPrefix = "draft-cohort-row-resolution:";

export const cohortRowResolutionActions = [
  "LINK_TO_APPLICATION",
  "LINK_TO_USER_AND_APPLICATION",
  "ADMIN_INTAKE_REQUIRED",
  "EXCLUDE_FROM_CURRENT_COHORT",
  "PENDING_INVESTIGATION",
  "APPLICATION_DETAILS_DIFFER",
  "APPLICATION_NOT_APPROVED",
  "APPLIED_WITH_DIFFERENT_CONTACT",
  "APPLICATION_NOT_FOUND",
] as const;

export type CohortRowResolutionAction = (typeof cohortRowResolutionActions)[number];

export const cohortApplicationReviewActions = [
  "APPROVE_FOR_SEASON_ZERO",
  "KEEP_PENDING",
  "REOPEN_FOR_REVIEW",
  "APPROVE_OVERRIDE",
  "EXCLUDE_FROM_CURRENT_COHORT",
  "INVESTIGATE",
] as const;

export type CohortApplicationReviewAction = (typeof cohortApplicationReviewActions)[number];

export type DraftCohortWorkbookRow = {
  worksheet: "Male" | "Female";
  rowNumber: number;
  applicationId: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  position: string;
  sourceStatus: string;
  draftSelectionGroup: DraftSelectionGroup;
  proposedSquadCode: string | null;
  proposedSquadSequence: number | null;
  heightCm: number | null;
  photoUrl: string | null;
};

export type DraftCohortAnalysisRow = DraftCohortWorkbookRow & {
  matchedApplicationId: string | null;
  matchedUserId: string | null;
  applicationStatus: ApplicationStatus | null;
  matchType: "SAFE" | "DUPLICATE_BLOCKED" | "AMBIGUOUS" | "UNMATCHED" | "PENDING_APPROVAL" | "EXCLUDED" | "PENDING_INVESTIGATION" | "ADMIN_INTAKE_REQUIRED" | "READY" | "PROVISIONED";
  resolutionAction: string | null;
  resolutionReason: string | null;
  nextAction: string;
  provisioned: boolean;
};

function workbookPath() {
  const candidates = [
    process.env.TRYOUT_WORKBOOK_FILE,
    "/opt/ultraos-staging/shared/imports/TryOutsPlayers.xlsx",
    "C:/UltraLeagueOS/data/TryOutsPlayers.xlsx",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1];
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cell(value: unknown) {
  return String(value ?? "").trim();
}

function field(row: Record<string, string>, ...headers: string[]) {
  for (const header of headers) {
    const value = row[header];
    if (value) return value;
  }
  return "";
}

function feetToCm(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 30.48) : null;
}

function photoUrl(value: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { url?: unknown };
    return cell(parsed.url) || value;
  } catch {
    return value;
  }
}

function selection(worksheet: "Male" | "Female", sourceStatus: string) {
  if (worksheet === "Male" && sourceStatus === "5") return { draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT, proposedSquadSequence: null, proposedSquadCode: null };
  const sequence = Number(sourceStatus);
  return {
    draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT,
    proposedSquadSequence: Number.isFinite(sequence) ? sequence : null,
    proposedSquadCode: Number.isFinite(sequence) ? `${worksheet === "Female" ? "WOMEN" : "MEN"}-GROUP-${sequence}` : null,
  };
}

export async function readDraftCohortWorkbookRows(): Promise<DraftCohortWorkbookRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath());
  const rows: DraftCohortWorkbookRow[] = [];
  for (const worksheetName of ["Male", "Female"] as const) {
    const sheet = workbook.worksheets.find((candidate) => candidate.name.toLowerCase() === worksheetName.toLowerCase());
    if (!sheet) continue;
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(cell);
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = (row.values as unknown[]).slice(1).map(cell);
      const raw = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      if (!Object.values(raw).some(Boolean)) return;
      const sourceStatus = field(raw, "Status");
      const mapped = selection(worksheetName, sourceStatus);
      rows.push({
        worksheet: worksheetName,
        rowNumber,
        applicationId: field(raw, "Application ID"),
        fullName: field(raw, "Full Name", "Applicant Name"),
        email: normalizeEmail(field(raw, "Email", "Applicant Email", "Linked User Email")),
        phone: normalizePhone(field(raw, "Phone")),
        gender: field(raw, "Gender") || worksheetName,
        position: field(raw, "Position"),
        sourceStatus,
        heightCm: feetToCm(field(raw, "Height Feet")),
        photoUrl: photoUrl(field(raw, "Profile Photo")),
        ...mapped,
      });
    });
  }
  return rows;
}

export async function saveDraftCohortRowResolution(input: {
  worksheet: string;
  rowNumber: number;
  action: CohortRowResolutionAction;
  reason: string;
  applicationId?: string;
  userId?: string;
  actorUserId: string;
  organizationId: string;
}) {
  if (!cohortRowResolutionActions.includes(input.action)) throw new Error("Invalid cohort row resolution action.");
  if (!input.reason.trim()) throw new Error("Resolution reason is required.");
  const key = `${rowResolutionPrefix}${input.worksheet}:${input.rowNumber}`;
  const value = {
    worksheet: input.worksheet,
    rowNumber: input.rowNumber,
    action: input.action,
    reason: input.reason.trim(),
    applicationId: input.applicationId || null,
    userId: input.userId || null,
    resolvedById: input.actorUserId,
    resolvedAt: new Date().toISOString(),
  };
  await withOrganizationContext(input.organizationId, async (tx) => {
    await tx.systemSetting.upsert({
      where: { key },
      update: { value, category: "draft-cohort", description: "Selected draft cohort row resolution" },
      create: { key, value, organizationId: input.organizationId, category: "draft-cohort", description: "Selected draft cohort row resolution" },
    });
    await tx.auditLog.create({
      data: { userId: input.actorUserId, organizationId: input.organizationId, action: "DRAFT_COHORT_ROW_RESOLVED", entityType: "DraftCohortRow", entityId: `${input.worksheet}:${input.rowNumber}`, details: value },
    });
  });
}

export async function saveDraftCohortApplicationReview(input: {
  worksheet: string;
  rowNumber: number;
  applicationId: string;
  action: CohortApplicationReviewAction;
  reason: string;
  actorUserId: string;
  organizationId: string;
}) {
  if (!cohortApplicationReviewActions.includes(input.action)) throw new Error("Invalid cohort application review action.");
  if (!input.reason.trim()) throw new Error("Written reason is required.");
  return withOrganizationContext(input.organizationId, async (tx) => {
    const application = await tx.application.findUnique({ where: { id: input.applicationId }, select: { id: true, status: true, submittedData: true, notes: true } });
    if (!application) throw new Error("Application not found.");
  const targetStatus =
    input.action === "APPROVE_FOR_SEASON_ZERO" || input.action === "APPROVE_OVERRIDE"
      ? ApplicationStatus.APPROVED
      : input.action === "REOPEN_FOR_REVIEW"
        ? ApplicationStatus.UNDER_REVIEW
        : application.status;
  const rowKey = `${input.worksheet}:${input.rowNumber}`;
  const resolutionAction = input.action === "EXCLUDE_FROM_CURRENT_COHORT" ? "EXCLUDE_FROM_CURRENT_COHORT" : input.action === "INVESTIGATE" ? "PENDING_INVESTIGATION" : "LINK_TO_APPLICATION";
    const reviewLine = `[${new Date().toISOString()}] ${input.reason.trim()}`;
    const notes = application.notes?.includes(input.reason.trim())
      ? application.notes
      : [application.notes, reviewLine].filter(Boolean).join("\n\n");
    await tx.application.update({
      where: { id: application.id },
      data: {
        status: targetStatus,
        reviewedById: input.actorUserId,
        reviewedAt: new Date(),
        notes,
      },
    });
    await tx.systemSetting.upsert({
      where: { key: `${rowResolutionPrefix}${rowKey}` },
      update: {
        category: "draft-cohort",
        description: "Selected draft cohort application review",
        value: {
          worksheet: input.worksheet,
          rowNumber: input.rowNumber,
          action: resolutionAction,
          applicationReviewAction: input.action,
          reason: input.reason.trim(),
          applicationId: application.id,
          previousStatus: application.status,
          statusAfterReview: targetStatus,
          resolvedById: input.actorUserId,
          resolvedAt: new Date().toISOString(),
        },
      },
      create: {
        key: `${rowResolutionPrefix}${rowKey}`,
        organizationId: input.organizationId,
        category: "draft-cohort",
        description: "Selected draft cohort application review",
        value: {
          worksheet: input.worksheet,
          rowNumber: input.rowNumber,
          action: resolutionAction,
          applicationReviewAction: input.action,
          reason: input.reason.trim(),
          applicationId: application.id,
          previousStatus: application.status,
          statusAfterReview: targetStatus,
          resolvedById: input.actorUserId,
          resolvedAt: new Date().toISOString(),
        },
      },
    });
    await writeAuditLog(tx, {
      userId: input.actorUserId,
      organizationId: input.organizationId,
      action: "DRAFT_COHORT_APPLICATION_REVIEWED",
      entityType: "Application",
      entityId: application.id,
      details: {
        worksheet: input.worksheet,
        rowNumber: input.rowNumber,
        action: input.action,
        previousStatus: application.status,
        statusAfterReview: targetStatus,
        reason: input.reason.trim(),
      },
    });
  });
}

export async function draftCohortAnalysis(db: Db, organizationId: string) {
  const [rows, applications, resolutions, duplicateGroups] = await Promise.all([
    readDraftCohortWorkbookRows(),
    db.application.findMany({
      where: { type: "PLAYER", organizationId },
      include: { applicantUser: { select: { id: true, email: true, name: true } } },
    }),
    db.systemSetting.findMany({ where: { key: { startsWith: rowResolutionPrefix }, organizationId }, select: { key: true, value: true } }),
    approvedPlayerDuplicateGroups(db, organizationId),
  ]);
  const resolutionByRow = new Map(resolutions.map((resolution) => [resolution.key.replace(rowResolutionPrefix, ""), resolution.value as { action?: string; reason?: string; applicationId?: string; userId?: string }]));
  const byId = new Map(applications.map((application) => [application.id, application]));
  const byEmail = new Map<string, typeof applications>();
  const byPhone = new Map<string, typeof applications>();
  for (const application of applications) {
    const data = application.submittedData && typeof application.submittedData === "object" && !Array.isArray(application.submittedData) ? application.submittedData as Record<string, unknown> : {};
    const emails = [application.applicantUser?.email, data.email].map(normalizeEmail).filter(Boolean);
    const phone = normalizePhone(data.phone ?? data.mobile);
    for (const email of emails) byEmail.set(email, [...(byEmail.get(email) ?? []), application]);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), application]);
  }
  const unresolvedDuplicateApplicationIds = new Set(
    duplicateGroups
      .filter((group) => group.currentResolution === "UNRESOLVED")
      .flatMap((group) => group.applications.map((application) => application.applicationId)),
  );
  const analyzed: DraftCohortAnalysisRow[] = rows.map((row) => {
    const resolution = resolutionByRow.get(`${row.worksheet}:${row.rowNumber}`);
    const manualApplication = resolution?.applicationId ? byId.get(resolution.applicationId) : null;
    const exact = row.applicationId ? byId.get(row.applicationId) : null;
    const emailMatches = !exact && row.email ? byEmail.get(row.email) ?? [] : [];
    const phoneMatches = !exact && emailMatches.length === 0 && row.phone ? (byPhone.get(row.phone) ?? []).filter((application) => normalizeName((application.submittedData as Record<string, unknown>)?.fullName ?? application.applicantUser?.name) === normalizeName(row.fullName)) : [];
    const candidates = manualApplication ? [manualApplication] : exact ? [exact] : emailMatches.length ? emailMatches : phoneMatches;
    const application = candidates.length === 1 ? candidates[0] : null;
    const blockedDuplicate = application ? unresolvedDuplicateApplicationIds.has(application.id) : false;
    let matchType: DraftCohortAnalysisRow["matchType"] = "SAFE";
    let nextAction = "Ready for metadata apply.";
    if (resolution?.action === "EXCLUDE_FROM_CURRENT_COHORT") {
      matchType = "EXCLUDED";
      nextAction = "Excluded from current cohort by administrator.";
    } else if (resolution?.action === "PENDING_INVESTIGATION") {
      matchType = "PENDING_INVESTIGATION";
      nextAction = "Complete investigation.";
    } else if (resolution?.action === "ADMIN_INTAKE_REQUIRED" || resolution?.action === "APPLICATION_NOT_FOUND") {
      matchType = "ADMIN_INTAKE_REQUIRED";
      nextAction = "Create approved administrator intake Application before provisioning.";
    } else if (!application && candidates.length > 1) {
      matchType = "AMBIGUOUS";
      nextAction = "Select the correct Application/User or mark for intake/exclusion.";
    } else if (!application) {
      matchType = "UNMATCHED";
      nextAction = "Classify unmatched row.";
    } else if (blockedDuplicate) {
      matchType = "DUPLICATE_BLOCKED";
      nextAction = "Resolve selected-cohort duplicate identity group.";
    } else if (application.status !== ApplicationStatus.APPROVED) {
      matchType = "PENDING_APPROVAL";
      nextAction = application.status === ApplicationStatus.REJECTED ? "Reopen/override or exclude with written reason." : "Review and approve before provisioning.";
    } else if (application.provisionedPlayerId) {
      matchType = "PROVISIONED";
      nextAction = "Already provisioned.";
    } else if (resolution?.applicationId || exact || emailMatches.length === 1 || phoneMatches.length === 1) {
      matchType = "READY";
    }
    return {
      ...row,
      matchedApplicationId: application?.id ?? null,
      matchedUserId: application?.applicantUserId ?? resolution?.userId ?? null,
      applicationStatus: application?.status ?? null,
      matchType,
      resolutionAction: resolution?.action ?? null,
      resolutionReason: resolution?.reason ?? null,
      nextAction,
      provisioned: Boolean(application?.provisionedPlayerId),
    };
  });
  const selectedDuplicateGroups = duplicateGroups.filter((group) => group.applications.some((application) => analyzed.some((row) => row.matchedApplicationId === application.applicationId || row.applicationId === application.applicationId)));
  return {
    rows: analyzed,
    selectedDuplicateGroups,
    selectedUnresolvedDuplicateGroups: selectedDuplicateGroups.filter((group) => group.currentResolution === "UNRESOLVED"),
    allDuplicateGroups: duplicateGroups.length,
    unrelatedDuplicateGroups: duplicateGroups.length - selectedDuplicateGroups.length,
  };
}
