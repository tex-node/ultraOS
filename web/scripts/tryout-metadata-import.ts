import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Prisma } from "../src/generated/prisma/client";
import { ApplicationStatus, ApplicationType, DraftSelectionGroup } from "../src/generated/prisma/enums";
import { approvedPlayerDuplicateGroups, duplicateResolutionSummary } from "../src/lib/data-quality";
import {
  classifyDraftSquadReadiness,
  draftSquadCapacityConfig,
  draftSquadStatusSeverity,
  targetSizeForGender,
} from "../src/lib/draft-squad-capacity";
import { parseCsv, rowsToCsv } from "../src/lib/imports";
import { prisma } from "../src/lib/prisma";

type FlatRow = Record<string, string>;
type SourceRow = FlatRow & {
  sourceWorksheet: string;
  sourceRowNumber: string;
};

type RowSet = {
  headers: string[];
  rows: SourceRow[];
};

type MatchType =
  | "EXACT_APPLICATION_MATCH"
  | "EXACT_EMAIL_MATCH"
  | "STRONG_PHONE_NAME_MATCH"
  | "AMBIGUOUS_MATCH"
  | "NO_APPLICATION_MATCH"
  | "DUPLICATE_SPREADSHEET_ROW"
  | "INVALID_ROW";

const apply = process.argv.includes("--apply");
const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
const sheetModeArg = process.argv.find((arg) => arg.startsWith("--sheet-mode="));
const filePath = fileArg?.split("=").slice(1).join("=") ?? process.env.TRYOUT_METADATA_FILE;
const sheetMode = sheetModeArg?.split("=").slice(1).join("=") ?? process.env.TRYOUT_METADATA_SHEET_MODE ?? "flat";
const reportDir = process.env.REPORT_DIR ?? process.cwd();
const selectedCohortLabel = "SEASON_ZERO_DRAFT_COHORT";
const rowResolutionPrefix = "draft-cohort-row-resolution:";
const acceptedGroups = new Set(Object.values(DraftSelectionGroup));
const flatExpectedHeaders = ["applicationId", "email", "firstName", "lastName", "tryoutNumber", "tryoutScore", "draftSelectionGroup", "position", "heightCm", "weightKg", "photoUrl", "selectionNotes"];
const workbookRequiredHeaders = ["application_id", "status", "full_name", "email", "phone", "gender", "height_feet", "position", "profile_photo"];

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

function normalizeName(...parts: unknown[]) {
  return parts.map((part) => String(part ?? "").trim().toLowerCase()).filter(Boolean).join(" ").replace(/\s+/g, " ");
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function numberString(value: string) {
  if (!value) return "";
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function feetToCm(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed * 30.48)) : "";
}

function safeGroup(value: string) {
  const normalized = value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
  return acceptedGroups.has(normalized as DraftSelectionGroup) ? normalized : "";
}

function dataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonScalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

function field(row: FlatRow, ...headers: string[]) {
  for (const header of headers) {
    const exact = row[header];
    if (exact !== undefined && stringValue(exact)) return stringValue(exact);
    const normalized = normalizeHeader(header);
    const match = Object.entries(row).find(([key]) => normalizeHeader(key) === normalized);
    if (match && stringValue(match[1])) return stringValue(match[1]);
  }
  return "";
}

function photoUrl(value: string) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { url?: unknown };
    return stringValue(parsed.url) || value;
  } catch {
    return value;
  }
}

function selectionFor(row: FlatRow, worksheet: string) {
  const status = field(row, "Status", "status");
  const sheet = worksheet.toLowerCase();
  if (sheet === "female") {
    if (["1", "2", "3", "4"].includes(status)) {
      return { draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT, squadSequence: Number(status), error: "" };
    }
    return { draftSelectionGroup: null, squadSequence: null, error: "Invalid female status. Expected 1-4." };
  }
  if (sheet === "male") {
    if (["1", "2", "3", "4"].includes(status)) {
      return { draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT, squadSequence: Number(status), error: "" };
    }
    if (status === "5") {
      return { draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT, squadSequence: null, error: "" };
    }
    return { draftSelectionGroup: null, squadSequence: null, error: "Invalid male status. Expected 1-5." };
  }
  return { draftSelectionGroup: null, squadSequence: null, error: `Unknown worksheet ${worksheet}.` };
}

function toFlatWorkbookRow(raw: FlatRow, worksheet: string, rowNumber: number): SourceRow {
  const fullName = field(raw, "Full Name", "Applicant Name");
  const [firstName, ...lastNameParts] = fullName.split(/\s+/);
  const sourceStatus = field(raw, "Status");
  const selection = selectionFor(raw, worksheet);
  const squadPrefix = worksheet.toLowerCase() === "female" ? "WOMEN" : "MEN";
  const heightFeet = field(raw, "Height Feet");
  const wingspanFeet = field(raw, "Wingspan Feet");
  const profilePhoto = photoUrl(field(raw, "Profile Photo"));
  return {
    ...raw,
    sourceWorksheet: worksheet,
    sourceRowNumber: String(rowNumber),
    applicationId: field(raw, "Application ID"),
    email: normalizeEmail(field(raw, "Email", "Applicant Email", "Linked User Email")),
    applicantEmail: normalizeEmail(field(raw, "Applicant Email")),
    phone: normalizePhone(field(raw, "Phone")),
    firstName: firstName ?? "",
    lastName: lastNameParts.join(" "),
    fullName,
    gender: field(raw, "Gender") || worksheet,
    sourceStatus,
    draftSelectionGroup: selection.draftSelectionGroup ?? "",
    proposedSquadSequence: selection.squadSequence == null ? "" : String(selection.squadSequence),
    proposedSquadCode: selection.squadSequence == null ? "" : `${squadPrefix}-GROUP-${selection.squadSequence}`,
    tryoutNumber: field(raw, "Tryout Number", "TryoutNumber"),
    tryoutScore: field(raw, "Tryout Score", "TryoutScore"),
    position: field(raw, "Position"),
    heightFeet,
    heightCm: feetToCm(heightFeet),
    weightKg: field(raw, "Weight Kg", "WeightKg"),
    wingspanFeet,
    photoUrl: profilePhoto,
    selectionNotes: field(raw, "Notes"),
    appearanceLinkOne: field(raw, "Appearance Link One"),
    appearanceLinkTwo: field(raw, "Appearance Link Two"),
    selectionError: selection.error,
  };
}

async function readRows(file: string): Promise<RowSet> {
  if (file.toLowerCase().endsWith(".csv")) {
    const parsed = parseCsv(readFileSync(file, "utf8"));
    return {
      headers: parsed.headers,
      rows: parsed.rows.map((row, index) => ({ ...row, sourceWorksheet: "csv", sourceRowNumber: String(index + 2) })),
    };
  }
  if (file.toLowerCase().endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    if (sheetMode === "gender-sheets") {
      const allowed = new Set(["male", "female"]);
      const unknownSheets = workbook.worksheets.map((sheet) => sheet.name).filter((name) => !allowed.has(name.toLowerCase()));
      if (unknownSheets.length > 0) throw new Error(`Unknown worksheet(s): ${unknownSheets.join(", ")}`);
      const rows: SourceRow[] = [];
      const headersBySheet: string[] = [];
      for (const worksheetName of ["male", "female"]) {
        const sheet = workbook.worksheets.find((candidate) => candidate.name.toLowerCase() === worksheetName);
        if (!sheet) throw new Error(`Workbook is missing ${worksheetName} worksheet.`);
        const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(stringValue);
        headersBySheet.push(...headers.map((header) => `${sheet.name}:${header}`));
        sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const values = (row.values as unknown[]).slice(1);
          const raw = Object.fromEntries(headers.map((header, index) => [header, stringValue(values[index])]));
          if (Object.values(raw).some(Boolean)) rows.push(toFlatWorkbookRow(raw, sheet.name, rowNumber));
        });
      }
      return { headers: headersBySheet, rows };
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("XLSX workbook has no worksheet.");
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(stringValue);
    const rows: SourceRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = (row.values as unknown[]).slice(1);
      const record = Object.fromEntries(headers.map((header, index) => [header, stringValue(values[index])]));
      if (Object.values(record).some(Boolean)) rows.push({ ...record, sourceWorksheet: sheet.name, sourceRowNumber: String(rowNumber) });
    });
    return { headers, rows };
  }
  throw new Error("Unsupported file type. Use .csv or .xlsx.");
}

function appEmails(application: Awaited<ReturnType<typeof loadApplications>>[number]) {
  const data = dataObject(application.submittedData);
  return [application.applicantUser?.email, data.email, data.applicantEmail, data.linkedUserEmail]
    .map(normalizeEmail)
    .filter(Boolean);
}

function appPhone(application: Awaited<ReturnType<typeof loadApplications>>[number]) {
  const data = dataObject(application.submittedData);
  return normalizePhone(data.phone ?? data.mobile);
}

function appName(application: Awaited<ReturnType<typeof loadApplications>>[number]) {
  const data = dataObject(application.submittedData);
  return normalizeName(data.fullName ?? data.name ?? application.applicantUser?.name);
}

async function loadApplications() {
  return prisma.application.findMany({
    where: { type: ApplicationType.PLAYER },
    include: { applicantUser: { select: { id: true, email: true, name: true } } },
  });
}

async function main() {
  if (!filePath) throw new Error("Pass --file=/path/to/tryout.csv or set TRYOUT_METADATA_FILE.");
  const { headers: sourceHeaders, rows } = await readRows(filePath);
  const normalizedHeaders = new Set(sourceHeaders.map((header) => normalizeHeader(header.split(":").pop())));
  const missingHeaders = sheetMode === "gender-sheets"
    ? workbookRequiredHeaders.filter((header) => !normalizedHeaders.has(header))
    : flatExpectedHeaders.filter((header) => !normalizedHeaders.has(normalizeHeader(header)));
  const duplicateSummary = await duplicateResolutionSummary();
  const capacityConfig = await draftSquadCapacityConfig();
  const duplicateGroups = await approvedPlayerDuplicateGroups();
  const unresolvedDuplicateApplicationIds = new Set(
    duplicateGroups
      .filter((group) => group.currentResolution === "UNRESOLVED")
      .flatMap((group) => group.applications.map((application) => application.applicationId)),
  );
  const applications = await loadApplications();
  const rowResolutions = await prisma.systemSetting.findMany({
    where: { key: { startsWith: rowResolutionPrefix } },
    select: { key: true, value: true },
  });
  const resolutionBySourceRow = new Map(rowResolutions.map((resolution) => [resolution.key.replace(rowResolutionPrefix, ""), dataObject(resolution.value)]));
  const byId = new Map(applications.map((application) => [application.id, application]));
  const byEmail = new Map<string, typeof applications>();
  const byPhone = new Map<string, typeof applications>();
  for (const application of applications) {
    for (const email of appEmails(application)) byEmail.set(email, [...(byEmail.get(email) ?? []), application]);
    const phone = appPhone(application);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), application]);
  }
  const tryoutCounts = new Map<string, number>();
  const rowSignatureCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  const applicationCounts = new Map<string, number>();
  for (const row of rows) {
    const tryoutNumber = stringValue(row.tryoutNumber);
    const email = normalizeEmail(row.email || row.applicantEmail);
    const signature = [row.sourceWorksheet, row.applicationId, email, row.phone, row.fullName, row.sourceStatus].map((value) => String(value ?? "").toLowerCase()).join("|");
    if (tryoutNumber) tryoutCounts.set(tryoutNumber, (tryoutCounts.get(tryoutNumber) ?? 0) + 1);
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    if (row.applicationId) applicationCounts.set(row.applicationId, (applicationCounts.get(row.applicationId) ?? 0) + 1);
    rowSignatureCounts.set(signature, (rowSignatureCounts.get(signature) ?? 0) + 1);
  }
  const analyzed = rows.map((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const resolution = resolutionBySourceRow.get(`${row.sourceWorksheet}:${row.sourceRowNumber}`);
    const resolutionAction = stringValue(resolution?.action);
    const resolutionReason = stringValue(resolution?.reason);
    const resolvedApplicationId = stringValue(resolution?.applicationId);
    const excludedFromCohort = resolutionAction === "EXCLUDE_FROM_CURRENT_COHORT";
    const applicationId = stringValue(row.applicationId);
    const email = normalizeEmail(row.email || row.applicantEmail);
    const phone = normalizePhone(row.phone);
    const sourceName = normalizeName(row.fullName, row.firstName, row.lastName);
    const manual = resolvedApplicationId ? byId.get(resolvedApplicationId) : null;
    const exact = applicationId ? byId.get(applicationId) : null;
    const emailMatches = !exact && email ? byEmail.get(email) ?? [] : [];
    const phoneMatches = !exact && emailMatches.length === 0 && phone ? (byPhone.get(phone) ?? []).filter((application) => appName(application) === sourceName) : [];
    const candidates = manual ? [manual] : exact ? [exact] : emailMatches.length > 0 ? emailMatches : phoneMatches;
    const application = candidates.length === 1 ? candidates[0] : null;
    let matchType: MatchType = "NO_APPLICATION_MATCH";
    if (manual || exact) matchType = "EXACT_APPLICATION_MATCH";
    else if (emailMatches.length === 1) matchType = "EXACT_EMAIL_MATCH";
    else if (phoneMatches.length === 1) matchType = "STRONG_PHONE_NAME_MATCH";
    else if (emailMatches.length > 1 || phoneMatches.length > 1) matchType = "AMBIGUOUS_MATCH";
    if (excludedFromCohort) {
      warnings.push("Excluded from current cohort by reviewed administrator resolution.");
    } else if (!application) {
      errors.push(matchType === "AMBIGUOUS_MATCH" ? "Spreadsheet row maps to multiple applications." : "No application match.");
    }
    if (applicationId && !exact) warnings.push("Application ID was provided but not found; fallback matching used if possible.");
    if (resolutionAction && !resolutionReason) errors.push("Reviewed row resolution is missing a written reason.");
    if (["ADMIN_INTAKE_REQUIRED", "PENDING_INVESTIGATION", "APPLICATION_NOT_FOUND"].includes(resolutionAction)) errors.push(`Row remains ${resolutionAction}.`);
    if (application && application.status !== ApplicationStatus.APPROVED && !excludedFromCohort) errors.push(`Matched application is ${application.status}; approve or explicitly exclude before metadata apply.`);
    const appData = dataObject(application?.submittedData);
    const applicationName = normalizeName(appData.fullName ?? application?.applicantUser?.name);
    if (application && sourceName && applicationName && sourceName !== applicationName) warnings.push("Name differs from application record.");
    const draftSelectionGroup = safeGroup(stringValue(row.draftSelectionGroup));
    if (!draftSelectionGroup) errors.push(stringValue(row.selectionError) || "Invalid or missing draftSelectionGroup.");
    const tryoutNumber = stringValue(row.tryoutNumber);
    if (tryoutNumber && (tryoutCounts.get(tryoutNumber) ?? 0) > 1) errors.push("Duplicate tryoutNumber in import file.");
    if (application?.id && (applicationCounts.get(application.id) ?? 0) > 1) errors.push("Application receives conflicting multiple spreadsheet rows.");
    const signature = [row.sourceWorksheet, row.applicationId, email, row.phone, row.fullName, row.sourceStatus].map((value) => String(value ?? "").toLowerCase()).join("|");
    if ((rowSignatureCounts.get(signature) ?? 0) > 1) {
      matchType = "DUPLICATE_SPREADSHEET_ROW";
      errors.push("Duplicate spreadsheet row.");
    }
    const blockedDuplicateIdentity = !excludedFromCohort && application ? unresolvedDuplicateApplicationIds.has(application.id) : false;
    if (blockedDuplicateIdentity) warnings.push("Blocked by unresolved duplicate identity group.");
    if (!stringValue(row.tryoutScore)) warnings.push("Missing tryoutScore.");
    if (!stringValue(row.photoUrl)) warnings.push("Missing photoUrl.");
    if (!stringValue(row.position)) warnings.push("Missing position.");
    if (!stringValue(row.heightCm) && !stringValue(row.weightKg)) warnings.push("Missing measurements.");
    return {
      rowNumber: index + 2,
      sourceWorksheet: row.sourceWorksheet,
      sourceRowNumber: Number(row.sourceRowNumber || index + 2),
      applicationId: (application?.id ?? applicationId) || null,
      matchType,
      emailMatched: matchType === "EXACT_EMAIL_MATCH",
      blockedDuplicateIdentity,
      sourceStatus: row.sourceStatus || null,
      proposedSquadSequence: row.proposedSquadSequence || null,
      proposedSquadCode: row.proposedSquadCode || null,
      tryoutNumber: tryoutNumber || null,
      tryoutScore: numberString(stringValue(row.tryoutScore)) || null,
      draftSelectionGroup: draftSelectionGroup || null,
      position: stringValue(row.position) || null,
      heightCm: numberString(stringValue(row.heightCm)) || null,
      weightKg: numberString(stringValue(row.weightKg)) || null,
      wingspanFeet: stringValue(row.wingspanFeet) || null,
      photoUrl: stringValue(row.photoUrl) || null,
      selectionNotes: stringValue(row.selectionNotes) || null,
      fullName: stringValue(row.fullName) || null,
      email: email || null,
      phone: phone || null,
      resolutionAction: resolutionAction || null,
      resolutionReason: resolutionReason || null,
      excludedFromCohort,
      errors,
      warnings,
      safeToImport: !excludedFromCohort && errors.length === 0 && Boolean(application) && application?.status === ApplicationStatus.APPROVED && !blockedDuplicateIdentity,
    };
  });
  const bySheet = ["Male", "Female"].map((sheet) => {
    const sheetRows = analyzed.filter((row) => row.sourceWorksheet.toLowerCase() === sheet.toLowerCase());
    const inSequence = (row: typeof analyzed[number], sequence: number) => Number(row.proposedSquadSequence) === sequence;
    const gender = sheet === "Female" ? "women" : "men";
    const targetSize = targetSizeForGender(capacityConfig, gender);
    const groupCounts = [1, 2, 3, 4].map((sequence) => ({
      squadSequence: sequence,
      playerCount: sheetRows.filter((row) => inSequence(row, sequence)).length,
      positionCount: Object.fromEntries(
        [...new Set(sheetRows.filter((row) => inSequence(row, sequence)).map((row) => row.position ?? "Missing"))]
          .map((position) => [position, sheetRows.filter((row) => inSequence(row, sequence) && (row.position ?? "Missing") === position).length]),
      ),
      missingPositionCount: sheetRows.filter((row) => inSequence(row, sequence) && !row.position).length,
      missingMeasurementCount: sheetRows.filter((row) => inSequence(row, sequence) && !row.heightCm && !row.weightKg).length,
      knownHeightRange: (() => {
        const heights = sheetRows.filter((row) => inSequence(row, sequence) && row.heightCm).map((row) => Number(row.heightCm));
        return heights.length ? `${Math.min(...heights)}-${Math.max(...heights)} cm` : null;
      })(),
      averageHeightCm: (() => {
        const heights = sheetRows.filter((row) => inSequence(row, sequence) && row.heightCm).map((row) => Number(row.heightCm));
        return heights.length ? Math.round(heights.reduce((sum, value) => sum + value, 0) / heights.length) : null;
      })(),
    })).map((group) => {
      const readinessStatus = classifyDraftSquadReadiness({ currentSize: group.playerCount, targetSize });
      return {
        ...group,
        targetSize,
        remainingCapacity: Math.max(targetSize - group.playerCount, 0),
        shortfall: Math.max(targetSize - group.playerCount, 0),
        readinessStatus,
        severity: draftSquadStatusSeverity(readinessStatus),
      };
    });
    const totalTarget = targetSize * 4;
    const totalPlayers = sheetRows.filter((row) => row.draftSelectionGroup === DraftSelectionGroup.MAIN_DRAFT).length;
    return {
      sheet,
      totalRows: sheetRows.length,
      validRows: sheetRows.filter((row) => row.errors.length === 0).length,
      exactApplicationMatches: sheetRows.filter((row) => row.matchType === "EXACT_APPLICATION_MATCH").length,
      emailMatches: sheetRows.filter((row) => row.matchType === "EXACT_EMAIL_MATCH").length,
      strongPhoneNameMatches: sheetRows.filter((row) => row.matchType === "STRONG_PHONE_NAME_MATCH").length,
      ambiguousMatches: sheetRows.filter((row) => row.matchType === "AMBIGUOUS_MATCH").length,
      missingApplications: sheetRows.filter((row) => row.matchType === "NO_APPLICATION_MATCH").length,
      duplicateSpreadsheetRows: sheetRows.filter((row) => row.matchType === "DUPLICATE_SPREADSHEET_ROW").length,
      invalidStatuses: sheetRows.filter((row) => row.errors.some((error) => error.includes("Invalid"))).length,
      missingNames: sheetRows.filter((row) => !row.fullName).length,
      missingPositions: sheetRows.filter((row) => !row.position).length,
      missingMeasurements: sheetRows.filter((row) => !row.heightCm && !row.weightKg).length,
      missingPhotos: sheetRows.filter((row) => !row.photoUrl).length,
      mainDraftCount: sheetRows.filter((row) => row.draftSelectionGroup === DraftSelectionGroup.MAIN_DRAFT).length,
      secondaryDraftCount: sheetRows.filter((row) => row.draftSelectionGroup === DraftSelectionGroup.SECONDARY_DRAFT).length,
      targetMainDraftPlayers: totalTarget,
      completionPercent: totalTarget > 0 ? Math.round((totalPlayers / totalTarget) * 100) : 0,
      remainingPlayers: Math.max(totalTarget - totalPlayers, 0),
      countPerSquadGroup: groupCounts.map((group) => ({
        squadSequence: group.squadSequence,
        playerCount: group.playerCount,
        targetSize: group.targetSize,
        remainingCapacity: group.remainingCapacity,
        status: group.readinessStatus,
        shortfall: group.shortfall,
      })),
      blockedDuplicateIdentityRows: sheetRows.filter((row) => row.blockedDuplicateIdentity).length,
      safeToImportRows: sheetRows.filter((row) => row.safeToImport).length,
      squadBalance: groupCounts,
    };
  });
  const duplicateEmails = [...emailCounts.entries()].filter(([, count]) => count > 1).map(([email]) => email);
  const gateReasons = [
    missingHeaders.length > 0 ? `Missing required mapped headers: ${missingHeaders.join(", ")}` : "",
    analyzed.some((row) => row.errors.some((error) => error.includes("Invalid"))) ? "Invalid status rows exist." : "",
    [...tryoutCounts.values()].some((count) => count > 1) ? "Duplicate tryout numbers exist." : "",
    analyzed.some((row) => !row.excludedFromCohort && row.matchType === "AMBIGUOUS_MATCH") ? "Selected-cohort ambiguous workbook-to-application matches exist." : "",
    analyzed.some((row) => !row.excludedFromCohort && row.matchType === "NO_APPLICATION_MATCH") ? "Selected-cohort rows without matching applications exist." : "",
    analyzed.some((row) => row.matchType === "DUPLICATE_SPREADSHEET_ROW") ? "Duplicate spreadsheet rows exist." : "",
    analyzed.some((row) => !row.excludedFromCohort && row.blockedDuplicateIdentity) ? "Selected-cohort rows are blocked by unresolved duplicate identity groups." : "",
    analyzed.some((row) => !row.excludedFromCohort && row.errors.some((error) => error.includes("Matched application is"))) ? "Selected-cohort rows include applications that are not approved." : "",
    analyzed.some((row) => !row.excludedFromCohort && row.errors.some((error) => error.includes("Row remains"))) ? "Selected-cohort rows still require admin intake or investigation." : "",
    bySheet.some((sheet) => sheet.squadBalance.some((group) => group.readinessStatus === "OVER_CAPACITY")) ? "One or more draft squad groups exceed configured capacity." : "",
  ].filter(Boolean);
  const report = {
    dryRun: !apply,
    file: filePath,
    sheetMode,
    rowCount: analyzed.length,
    missingHeaders,
    duplicateIdentitySummary: duplicateSummary,
    selectedCohortLabel,
    selectedCohortDuplicateGroups: duplicateGroups
      .filter((group) => group.applications.some((application) => analyzed.some((row) => row.applicationId === application.applicationId)))
      .map((group) => ({ id: group.id, currentResolution: group.currentResolution, applications: group.applications.map((application) => application.applicationId) })),
    selectedCohortUnresolvedDuplicateGroups: duplicateGroups
      .filter((group) => group.currentResolution === "UNRESOLVED" && group.applications.some((application) => analyzed.some((row) => row.applicationId === application.applicationId)))
      .length,
    unrelatedDuplicateGroups: duplicateSummary.totalGroups - duplicateGroups.filter((group) => group.applications.some((application) => analyzed.some((row) => row.applicationId === application.applicationId))).length,
    exactApplicationMatches: analyzed.filter((row) => row.matchType === "EXACT_APPLICATION_MATCH").length,
    emailMatches: analyzed.filter((row) => row.matchType === "EXACT_EMAIL_MATCH").length,
    strongPhoneNameMatches: analyzed.filter((row) => row.matchType === "STRONG_PHONE_NAME_MATCH").length,
    ambiguousMatches: analyzed.filter((row) => row.matchType === "AMBIGUOUS_MATCH").length,
    missingApplications: analyzed.filter((row) => row.matchType === "NO_APPLICATION_MATCH").length,
    duplicateSpreadsheetRows: analyzed.filter((row) => row.matchType === "DUPLICATE_SPREADSHEET_ROW").length,
    duplicateEmails,
    duplicateTryoutNumbers: [...tryoutCounts.entries()].filter(([, count]) => count > 1).map(([tryoutNumber]) => tryoutNumber),
    invalidDraftClassifications: analyzed.filter((row) => row.errors.some((error) => error.includes("Invalid") || error.includes("draftSelectionGroup"))).length,
    nameConflicts: analyzed.filter((row) => row.warnings.includes("Name differs from application record.")).length,
    missingPhotos: analyzed.filter((row) => row.warnings.includes("Missing photoUrl.")).length,
    missingPositions: analyzed.filter((row) => row.warnings.includes("Missing position.")).length,
    missingMeasurements: analyzed.filter((row) => row.warnings.includes("Missing measurements.")).length,
    overCapacityGroups: bySheet.flatMap((sheet) => sheet.squadBalance.filter((group) => group.readinessStatus === "OVER_CAPACITY").map((group) => `${sheet.sheet} Group ${group.squadSequence}`)),
    incompleteGroups: bySheet.flatMap((sheet) => sheet.squadBalance.filter((group) => group.readinessStatus === "INCOMPLETE").map((group) => `${sheet.sheet} Group ${group.squadSequence}`)),
    blockedDuplicateIdentityRows: analyzed.filter((row) => row.blockedDuplicateIdentity).length,
    safeToImport: analyzed.filter((row) => row.safeToImport).length,
    invalidRows: analyzed.filter((row) => row.errors.length > 0).length,
    safeToApplyTryoutMetadata: gateReasons.length === 0,
    gateReasons,
    proposedDraftSquads: [
      ...[1, 2, 3, 4].map((sequence) => ({ code: `MEN-GROUP-${sequence}`, name: `Men's Squad Group ${sequence}`, sequence, gender: "Male", seasonClubAssignment: null })),
      ...[1, 2, 3, 4].map((sequence) => ({ code: `WOMEN-GROUP-${sequence}`, name: `Women's Squad Group ${sequence}`, sequence, gender: "Female", seasonClubAssignment: null })),
    ],
    bySheet,
    rows: analyzed,
  };
  if (apply) {
    if (!report.safeToApplyTryoutMetadata) throw new Error(`Refusing apply. Gate failed: ${gateReasons.join(" ")}`);
    const actor = await prisma.user.findFirst({ where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } }, select: { id: true } }) ?? await prisma.user.findFirst({ select: { id: true } });
    if (!actor) throw new Error("No staging actor user found.");
    await prisma.$transaction(async (tx) => {
      for (const row of analyzed) {
        if (!row.safeToImport || !row.applicationId) continue;
        const existing = await tx.application.findUniqueOrThrow({ where: { id: row.applicationId }, select: { submittedData: true } });
        const submittedData = dataObject(existing.submittedData);
        const mergedSubmittedData: Prisma.InputJsonObject = {
          ...Object.fromEntries(Object.entries(submittedData).map(([key, value]) => [key, jsonScalar(value)])),
          tryoutNumber: row.tryoutNumber,
          tryoutScore: row.tryoutScore,
          draftSelectionGroup: row.draftSelectionGroup,
          draftCohort: selectedCohortLabel,
          draftCohortStatus: row.draftSelectionGroup,
          proposedSquadSequence: row.proposedSquadSequence,
          proposedSquadCode: row.proposedSquadCode,
          selectedCohortImportedFrom: path.basename(filePath),
          tryoutSourceWorksheet: row.sourceWorksheet,
          tryoutSourceRowNumber: row.sourceRowNumber,
          tryoutSourceStatus: row.sourceStatus,
          position: row.position || jsonScalar(submittedData.position),
          heightCm: row.heightCm || jsonScalar(submittedData.heightCm),
          weightKg: row.weightKg || jsonScalar(submittedData.weightKg),
          wingspanFeet: row.wingspanFeet || jsonScalar(submittedData.wingspanFeet),
          photoUrl: row.photoUrl || jsonScalar(submittedData.photoUrl),
          profilePhotoUrl: row.photoUrl || jsonScalar(submittedData.profilePhotoUrl),
          selectionNotes: row.selectionNotes || jsonScalar(submittedData.selectionNotes),
          tryoutMetadataImportedAt: new Date().toISOString(),
        };
        await tx.application.update({ where: { id: row.applicationId }, data: { submittedData: mergedSubmittedData } });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "TRYOUT_METADATA_ROW_IMPORTED",
            entityType: "Application",
            entityId: row.applicationId,
            details: { worksheet: row.sourceWorksheet, sourceRowNumber: row.sourceRowNumber, draftSelectionGroup: row.draftSelectionGroup, proposedSquadSequence: row.proposedSquadSequence },
          },
        });
      }
    });
  }
  const suffix = apply ? "apply" : "preview";
  const jsonOut = path.join(reportDir, sheetMode === "gender-sheets" ? `tryout-workbook-${suffix}.json` : `tryout-metadata-import-${suffix}-${Date.now()}.json`);
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  writeFileSync(jsonOut.replace(".json", ".csv"), rowsToCsv([
    ["sourceWorksheet", "sourceRowNumber", "applicationId", "matchType", "sourceStatus", "draftSelectionGroup", "proposedSquadCode", "errors", "warnings", "safeToImport"],
    ...analyzed.map((row) => [row.sourceWorksheet, row.sourceRowNumber, row.applicationId, row.matchType, row.sourceStatus, row.draftSelectionGroup, row.proposedSquadCode, row.errors.join("; "), row.warnings.join("; "), row.safeToImport]),
  ]));
  if (sheetMode === "gender-sheets") {
    const md = [
      "# Tryout Workbook Preview Summary",
      "",
      `Generated: ${new Date().toISOString()}`,
      `File: ${filePath}`,
      `Rows: ${report.rowCount}`,
      `SAFE_TO_APPLY_TRYOUT_METADATA: ${report.safeToApplyTryoutMetadata ? "YES" : "NO"}`,
      `Selected cohort: ${selectedCohortLabel}`,
      `All duplicate groups: ${duplicateSummary.totalGroups}`,
      `Selected-cohort unresolved duplicate groups: ${report.selectedCohortUnresolvedDuplicateGroups}`,
      `Unrelated duplicate groups: ${report.unrelatedDuplicateGroups}`,
      "",
      "## Gate Reasons",
      ...(gateReasons.length ? gateReasons.map((reason) => `- ${reason}`) : ["- None"]),
      "",
      "## Sheet Summary",
      "| Sheet | Rows | Exact App | Email | Phone+Name | Ambiguous | Missing Apps | Invalid Status | Main Draft | Secondary Draft | Blocked Duplicate | Safe |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...bySheet.map((sheet) => `| ${sheet.sheet} | ${sheet.totalRows} | ${sheet.exactApplicationMatches} | ${sheet.emailMatches} | ${sheet.strongPhoneNameMatches} | ${sheet.ambiguousMatches} | ${sheet.missingApplications} | ${sheet.invalidStatuses} | ${sheet.mainDraftCount} | ${sheet.secondaryDraftCount} | ${sheet.blockedDuplicateIdentityRows} | ${sheet.safeToImportRows} |`),
      "",
      "## Squad Capacity",
      "| Sheet | Group | Current | Target | Status | Shortfall |",
      "| --- | ---: | ---: | ---: | --- | ---: |",
      ...bySheet.flatMap((sheet) => sheet.countPerSquadGroup.map((group) => `| ${sheet.sheet} | ${group.squadSequence} | ${group.playerCount} | ${group.targetSize} | ${group.status} | ${group.shortfall} |`)),
      "",
      "## Capacity Warnings",
      ...(report.incompleteGroups.length
        ? report.incompleteGroups.map((group) => {
            const [sheet, , sequence] = group.split(" ");
            const sheetSummary = bySheet.find((item) => item.sheet === sheet);
            const squad = sheetSummary?.countPerSquadGroup.find((item) => String(item.squadSequence) === sequence);
            return `- ${group} requires ${squad?.shortfall ?? 0} additional player(s) to reach the configured target size of ${squad?.targetSize ?? "unknown"}.`;
          })
        : ["- None"]),
      "",
      "## Proposed Draft Squads",
      ...report.proposedDraftSquads.map((squad) => `- ${squad.code}: ${squad.name}; SeasonClub assignment: none`),
    ].join("\n");
    writeFileSync(jsonOut.replace(".json", "-summary.md"), md);
  }
  console.log(JSON.stringify({ ...report, rows: analyzed.slice(0, 25), reportFile: jsonOut, csvReportFile: jsonOut.replace(".json", ".csv") }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
