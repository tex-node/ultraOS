import { Prisma } from "@/generated/prisma/client";
import {
  ApplicationStatus,
  ApplicationType,
  AthleteGender,
  ClubStatus,
  DraftSelectionGroup,
  ImportResolutionAction,
  ImportRowStatus,
  ImportStatus,
  ImportType,
  PlayerStatus,
  PublicResourceLocatorType,
  SeasonClubStatus,
  StaffRole,
  UserRole,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { upsertPublicResourceLocator } from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";
import { upsertRoleAssignment } from "@/lib/user-roles";

export const MAX_IMPORT_FILE_BYTES = Number(process.env.IMPORT_MAX_FILE_BYTES ?? 1_000_000);

export const importTemplates: Record<ImportType, string[]> = {
  PLAYER: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "gender",
    "dateOfBirth",
    "heightCm",
    "weightKg",
    "position",
    "dominantHand",
    "previousTeam",
    "tryoutNumber",
    "tryoutScore",
    "draftSelectionGroup",
    "season",
    "division",
    "applicationStatus",
    "selectionNotes",
  ],
  COACH: [
    "fullName",
    "email",
    "phone",
    "experienceSummary",
    "preferredDivision",
    "applicationStatus",
    "season",
    "assignmentRole",
    "seasonClub",
    "photoUrl",
    "bio",
  ],
  CLUB: [
    "clubName",
    "shortName",
    "primaryColor",
    "secondaryColor",
    "logoUrl",
    "foundedYear",
    "website",
    "season",
    "division",
    "status",
  ],
};

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export type AnalyzedImportRow = {
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  matchedEntityType?: string;
  matchedEntityId?: string;
  resolutionAction?: ImportResolutionAction;
  resolutionData?: Record<string, unknown>;
};

const requiredHeaders: Record<ImportType, string[]> = {
  PLAYER: ["firstName", "lastName", "gender", "tryoutNumber", "draftSelectionGroup", "season", "division"],
  COACH: ["fullName", "email", "applicationStatus"],
  CLUB: ["clubName", "shortName"],
};

const playerPositions = new Set(["POINT GUARD", "SHOOTING GUARD", "SMALL FORWARD", "POWER FORWARD", "CENTER", "PG", "SG", "SF", "PF", "C", ""]);
const coachAssignmentRoles = new Set(["HEAD_COACH", "ASSISTANT_COACH", "UNASSIGNED", ""]);

export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) {
    throw new Error("CSV file is empty.");
  }

  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" && !inQuotes) {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  row.push(field);
  records.push(row);

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  const nonEmptyRecords = records.filter((record) => record.some((cell) => cell.trim() !== ""));
  const headers = nonEmptyRecords[0]?.map((header) => header.trim()) ?? [];
  if (headers.length === 0) {
    throw new Error("CSV header row is required.");
  }

  const rows = nonEmptyRecords.slice(1).map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, (record[index] ?? "").trim()])),
  );
  return { headers, rows };
}

export function validateHeaders(type: ImportType, headers: string[]) {
  const expected = importTemplates[type];
  const missing = expected.filter((header) => !headers.includes(header));
  const extra = headers.filter((header) => !expected.includes(header));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Invalid ${type.toLowerCase()} CSV headers. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

export function csvTemplate(type: ImportType) {
  return `${importTemplates[type].join(",")}\r\n`;
}

export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text) || text.startsWith("*")) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function text(data: Record<string, string>, key: string) {
  return (data[key] ?? "").trim();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function enumValue<T extends Record<string, string>>(values: T, value: string) {
  return Object.values(values).includes(value as T[keyof T]) ? (value as T[keyof T]) : null;
}

function rowStatus(errors: string[], warnings: string[]) {
  if (errors.length > 0) return ImportRowStatus.ERROR;
  if (warnings.length > 0) return ImportRowStatus.WARNING;
  return ImportRowStatus.VALID;
}

async function seasonAndDivision(tx: Prisma.TransactionClient, seasonName: string, divisionName: string) {
  const season = await tx.season.findFirst({
    where: { name: { equals: seasonName, mode: "insensitive" } },
    select: { id: true, name: true, competitionId: true, competition: { select: { sportId: true } } },
  });
  const division = await tx.division.findFirst({
    where: { name: { equals: divisionName, mode: "insensitive" } },
    select: { id: true, name: true, competitionId: true },
  });
  const compatible = Boolean(season && division && season.competitionId === division.competitionId);
  return { compatible, division, season };
}

export async function analyzePlayerRow(tx: Prisma.TransactionClient, rawData: Record<string, string>, rowNumber: number): Promise<AnalyzedImportRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized = {
    applicationStatus: text(rawData, "applicationStatus") || ApplicationStatus.APPROVED,
    dateOfBirth: text(rawData, "dateOfBirth"),
    division: text(rawData, "division"),
    dominantHand: text(rawData, "dominantHand") || "RIGHT",
    draftSelectionGroup: text(rawData, "draftSelectionGroup"),
    email: normalizeEmail(text(rawData, "email")),
    firstName: text(rawData, "firstName"),
    gender: text(rawData, "gender").toUpperCase(),
    heightCm: parseNumber(text(rawData, "heightCm")),
    lastName: text(rawData, "lastName"),
    phone: normalizePhone(text(rawData, "phone")),
    position: text(rawData, "position"),
    previousTeam: text(rawData, "previousTeam"),
    season: text(rawData, "season"),
    selectionNotes: text(rawData, "selectionNotes"),
    tryoutNumber: text(rawData, "tryoutNumber"),
    tryoutScore: parseNumber(text(rawData, "tryoutScore")),
    weightKg: parseNumber(text(rawData, "weightKg")),
  };

  for (const header of requiredHeaders.PLAYER) {
    if (!text(rawData, header)) errors.push(`${header} is required.`);
  }
  const gender = enumValue(AthleteGender, normalized.gender);
  if (!gender) errors.push("gender must be MALE or FEMALE.");
  const draftSelectionGroup = enumValue(DraftSelectionGroup, normalized.draftSelectionGroup);
  if (!draftSelectionGroup) errors.push("draftSelectionGroup is invalid.");
  if (normalized.applicationStatus && !enumValue(ApplicationStatus, normalized.applicationStatus)) {
    errors.push("applicationStatus is invalid.");
  }
  const dateOfBirth = parseDate(normalized.dateOfBirth);
  if (normalized.dateOfBirth && !dateOfBirth) errors.push("dateOfBirth is invalid.");
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) errors.push("email is invalid.");
  if (normalized.position && !playerPositions.has(normalized.position.toUpperCase())) warnings.push("position is non-standard.");
  if (normalized.heightCm != null && (normalized.heightCm < 120 || normalized.heightCm > 230)) warnings.push("heightCm is outside expected basketball range.");
  if (normalized.weightKg != null && (normalized.weightKg < 35 || normalized.weightKg > 180)) warnings.push("weightKg is outside expected range.");
  if (normalized.tryoutScore != null && (normalized.tryoutScore < 0 || normalized.tryoutScore > 100)) errors.push("tryoutScore must be between 0 and 100.");

  const scope = normalized.season && normalized.division ? await seasonAndDivision(tx, normalized.season, normalized.division) : null;
  if (!scope?.season) errors.push("season was not found.");
  if (!scope?.division) errors.push("division was not found.");
  if (scope && !scope.compatible) errors.push("season and division are not in the same competition.");

  let matchedEntityType: string | undefined;
  let matchedEntityId: string | undefined;
  let resolutionAction: ImportResolutionAction | undefined = ImportResolutionAction.CREATE;
  if (normalized.email) {
    // User is global (not tenant-scoped), so this lookup can legitimately find a person who is
    // e.g. already a Neon Ultra fan applying to Org B - matching participant-internalization.ts's
    // established "User stays global, membership is per-org" model. What matters is that the
    // Athlete/Player records below are scoped, not this identity lookup itself.
    const user = await tx.user.findUnique({ where: { email: normalized.email }, select: { id: true } });
    if (user) {
      matchedEntityType = "User";
      matchedEntityId = user.id;
      resolutionAction = ImportResolutionAction.LINK_EXISTING;
      const athlete = await tx.athlete.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (athlete && scope?.season) {
        const player = await tx.player.findUnique({
          where: { athleteId_seasonId: { athleteId: athlete.id, seasonId: scope.season.id } },
          select: { id: true },
        });
        if (player) {
          matchedEntityType = "Player";
          matchedEntityId = player.id;
          resolutionAction = ImportResolutionAction.UPDATE_EXISTING;
          warnings.push("Existing Player registration found for this athlete and season.");
        } else {
          matchedEntityType = "Athlete";
          matchedEntityId = athlete.id;
          resolutionAction = ImportResolutionAction.LINK_EXISTING;
        }
      }
    }
  }

  if (!matchedEntityId && normalized.firstName && normalized.lastName && dateOfBirth) {
    const candidates = await tx.athlete.findMany({
      where: {
        dateOfBirth,
        firstName: { equals: normalized.firstName, mode: "insensitive" },
        lastName: { equals: normalized.lastName, mode: "insensitive" },
        ...(normalized.phone ? { phone: normalized.phone } : {}),
      },
      select: { id: true },
      take: 3,
    });
    if (candidates.length === 1) {
      matchedEntityType = "Athlete";
      matchedEntityId = candidates[0].id;
      resolutionAction = ImportResolutionAction.LINK_EXISTING;
    } else if (candidates.length > 1) {
      errors.push("AMBIGUOUS_MATCH: multiple athletes match this identity.");
      resolutionAction = undefined;
    }
  }

  if (scope?.season && normalized.tryoutNumber) {
    const duplicateTryout = await tx.player.findFirst({
      where: { seasonId: scope.season.id, tryoutNumber: normalized.tryoutNumber },
      select: { id: true },
    });
    if (duplicateTryout && duplicateTryout.id !== matchedEntityId) {
      warnings.push("Duplicate tryout number exists in this season.");
    }
  }

  return {
    rowNumber,
    rawData,
    normalizedData: { ...normalized, divisionId: scope?.division?.id, seasonId: scope?.season?.id },
    status: rowStatus(errors, warnings),
    errors,
    warnings,
    matchedEntityType,
    matchedEntityId,
    resolutionAction,
  };
}

export async function analyzeCoachRow(tx: Prisma.TransactionClient, rawData: Record<string, string>, rowNumber: number): Promise<AnalyzedImportRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized = {
    applicationStatus: text(rawData, "applicationStatus"),
    assignmentRole: text(rawData, "assignmentRole") || "UNASSIGNED",
    bio: text(rawData, "bio"),
    email: normalizeEmail(text(rawData, "email")),
    experienceSummary: text(rawData, "experienceSummary"),
    fullName: text(rawData, "fullName"),
    phone: normalizePhone(text(rawData, "phone")),
    photoUrl: text(rawData, "photoUrl"),
    preferredDivision: text(rawData, "preferredDivision"),
    season: text(rawData, "season"),
    seasonClub: text(rawData, "seasonClub"),
  };
  for (const header of requiredHeaders.COACH) if (!text(rawData, header)) errors.push(`${header} is required.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) errors.push("email is invalid.");
  if (!enumValue(ApplicationStatus, normalized.applicationStatus)) errors.push("applicationStatus is invalid.");
  if (!coachAssignmentRoles.has(normalized.assignmentRole)) errors.push("assignmentRole is invalid.");

  let matchedEntityType: string | undefined;
  let matchedEntityId: string | undefined;
  let resolutionAction: ImportResolutionAction | undefined = ImportResolutionAction.CREATE;
  const user = normalized.email ? await tx.user.findUnique({ where: { email: normalized.email }, select: { id: true } }) : null;
  if (user) {
    matchedEntityType = "User";
    matchedEntityId = user.id;
    resolutionAction = ImportResolutionAction.LINK_EXISTING;
    const staff = await tx.staff.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (staff) {
      matchedEntityType = "Staff";
      matchedEntityId = staff.id;
      resolutionAction = ImportResolutionAction.UPDATE_EXISTING;
      warnings.push("Existing Staff profile found.");
    }
  } else if (normalized.email) {
    const staff = await tx.staff.findFirst({ where: { email: normalized.email }, select: { id: true } });
    if (staff) {
      matchedEntityType = "Staff";
      matchedEntityId = staff.id;
      resolutionAction = ImportResolutionAction.UPDATE_EXISTING;
      warnings.push("Existing Staff profile found by email.");
    }
  }

  let seasonClubId: string | undefined;
  if (normalized.assignmentRole !== "UNASSIGNED" && normalized.seasonClub) {
    const seasonClub = await tx.seasonClub.findFirst({
      where: {
        club: { name: { equals: normalized.seasonClub, mode: "insensitive" } },
        season: normalized.season ? { name: { equals: normalized.season, mode: "insensitive" } } : undefined,
      },
      select: { id: true, seasonId: true, divisionId: true },
    });
    if (!seasonClub) {
      errors.push("SeasonClub assignment was not found.");
    } else if (matchedEntityType === "Staff" && matchedEntityId) {
      const conflict = await tx.seasonClub.findFirst({
        where: {
          id: { not: seasonClub.id },
          OR: [{ headCoachId: matchedEntityId }, { assistantCoachId: matchedEntityId }],
          seasonId: seasonClub.seasonId,
          divisionId: seasonClub.divisionId,
        },
        select: { id: true },
      });
      if (conflict) errors.push("Coach assignment conflicts with another SeasonClub in this season/division.");
      seasonClubId = seasonClub.id;
    } else {
      seasonClubId = seasonClub.id;
    }
  }

  return {
    rowNumber,
    rawData,
    normalizedData: { ...normalized, seasonClubId },
    status: rowStatus(errors, warnings),
    errors,
    warnings,
    matchedEntityType,
    matchedEntityId,
    resolutionAction,
  };
}

export async function analyzeClubRow(tx: Prisma.TransactionClient, rawData: Record<string, string>, rowNumber: number): Promise<AnalyzedImportRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized = {
    clubName: text(rawData, "clubName"),
    division: text(rawData, "division"),
    foundedYear: parseNumber(text(rawData, "foundedYear")),
    logoUrl: text(rawData, "logoUrl"),
    primaryColor: text(rawData, "primaryColor"),
    secondaryColor: text(rawData, "secondaryColor"),
    season: text(rawData, "season"),
    shortName: text(rawData, "shortName").toUpperCase(),
    status: text(rawData, "status") || ClubStatus.ACTIVE,
    website: text(rawData, "website"),
  };
  for (const header of requiredHeaders.CLUB) if (!text(rawData, header)) errors.push(`${header} is required.`);
  if (normalized.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(normalized.primaryColor)) errors.push("primaryColor must be a hex color.");
  if (normalized.secondaryColor && !/^#[0-9a-fA-F]{6}$/.test(normalized.secondaryColor)) errors.push("secondaryColor must be a hex color.");
  if (normalized.foundedYear != null && (normalized.foundedYear < 1800 || normalized.foundedYear > new Date().getFullYear())) errors.push("foundedYear is invalid.");
  if (!enumValue(ClubStatus, normalized.status)) errors.push("status is invalid.");

  // Sport is global (not tenant-scoped), read fine through tx regardless of active org context.
  const sport = await tx.sport.findFirst({ where: { slug: "basketball" }, select: { id: true } });
  if (!sport) errors.push("Basketball sport record was not found.");
  const existing = sport
    ? await tx.club.findFirst({
        where: {
          sportId: sport.id,
          OR: [
            { name: { equals: normalized.clubName, mode: "insensitive" } },
            { shortName: { equals: normalized.shortName, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      })
    : null;

  let matchedEntityType: string | undefined;
  let matchedEntityId: string | undefined;
  let resolutionAction: ImportResolutionAction | undefined = ImportResolutionAction.CREATE;
  if (existing) {
    matchedEntityType = "Club";
    matchedEntityId = existing.id;
    resolutionAction = ImportResolutionAction.UPDATE_EXISTING;
    warnings.push("Existing permanent Club identity found.");
  }

  const scope = normalized.season && normalized.division ? await seasonAndDivision(tx, normalized.season, normalized.division) : null;
  if (normalized.season || normalized.division) {
    if (!scope?.season) errors.push("season was not found.");
    if (!scope?.division) errors.push("division was not found.");
    if (scope && !scope.compatible) errors.push("season and division are not in the same competition.");
  }

  return {
    rowNumber,
    rawData,
    normalizedData: { ...normalized, divisionId: scope?.division?.id, seasonId: scope?.season?.id, sportId: sport?.id },
    status: rowStatus(errors, warnings),
    errors,
    warnings,
    matchedEntityType,
    matchedEntityId,
    resolutionAction,
  };
}

export async function analyzeImportRows(tx: Prisma.TransactionClient, type: ImportType, rows: Record<string, string>[]) {
  const analyzed: AnalyzedImportRow[] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    if (type === ImportType.PLAYER) analyzed.push(await analyzePlayerRow(tx, row, rowNumber));
    if (type === ImportType.COACH) analyzed.push(await analyzeCoachRow(tx, row, rowNumber));
    if (type === ImportType.CLUB) analyzed.push(await analyzeClubRow(tx, row, rowNumber));
  }
  return analyzed;
}

export function summarizeAnalyzedRows(rows: AnalyzedImportRow[]) {
  return {
    errorRows: rows.filter((row) => row.status === ImportRowStatus.ERROR).length,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === ImportRowStatus.VALID).length,
    warningRows: rows.filter((row) => row.status === ImportRowStatus.WARNING).length,
  };
}

export function importStatusFromRows(rows: AnalyzedImportRow[]) {
  if (rows.some((row) => row.status === ImportRowStatus.ERROR)) return ImportStatus.NEEDS_REVIEW;
  if (rows.some((row) => row.status === ImportRowStatus.WARNING)) return ImportStatus.NEEDS_REVIEW;
  return ImportStatus.READY;
}

export async function createImportJobFromCsv(params: {
  fileName: string;
  text: string;
  type: ImportType;
  userId: string;
  organizationId: string;
}) {
  const parsed = parseCsv(params.text);
  validateHeaders(params.type, parsed.headers);

  return withOrganizationContext(params.organizationId, async (tx) => {
    // Analysis (matching/duplicate-detection) runs inside the same scoped transaction as the
    // job/row creation below, not before it - every Club/Season/SeasonClub/Athlete/Staff lookup
    // a row's analysis performs is therefore already invisible to any other organization's data,
    // so a CSV imported for Org B can never match an identically-named Club that belongs to
    // Org A.
    const analyzedRows = await analyzeImportRows(tx, params.type, parsed.rows);
    const summary = summarizeAnalyzedRows(analyzedRows);
    const status = importStatusFromRows(analyzedRows);

    const job = await tx.importJob.create({
      data: {
        ...summary,
        organizationId: params.organizationId,
        fileName: params.fileName,
        status,
        type: params.type,
        uploadedById: params.userId,
        rows: {
          create: analyzedRows.map((row) => ({
            organizationId: params.organizationId,
            errors: row.errors as Prisma.InputJsonValue,
            matchedEntityId: row.matchedEntityId,
            matchedEntityType: row.matchedEntityType,
            normalizedData: row.normalizedData as Prisma.InputJsonValue,
            rawData: row.rawData as Prisma.InputJsonValue,
            resolutionAction: row.resolutionAction,
            resolutionData: row.resolutionData as Prisma.InputJsonValue | undefined,
            rowNumber: row.rowNumber,
            status: row.status,
            warnings: row.warnings as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await writeAuditLog(tx, {
      organizationId: params.organizationId,
      action: "IMPORT_PARSED",
      details: { fileName: params.fileName, importJobId: job.id, summary, type: params.type },
      entityId: job.id,
      entityType: "ImportJob",
      userId: params.userId,
    });
    return job;
  });
}

async function ensureFanRole(tx: Prisma.TransactionClient, organizationId: string, userId: string, grantedById: string) {
  await upsertRoleAssignment(tx, { userId, role: UserRole.FAN, organizationId, grantedById });
}

async function ensureRole(tx: Prisma.TransactionClient, organizationId: string, userId: string, role: UserRole, grantedById: string) {
  await upsertRoleAssignment(tx, { userId, role, organizationId, grantedById });
}

function rowMessage(row: { errors: unknown; warnings: unknown }) {
  const errors = Array.isArray(row.errors) ? row.errors.join("; ") : "";
  const warnings = Array.isArray(row.warnings) ? row.warnings.join("; ") : "";
  return errors || warnings || "OK";
}

export async function importReportRows(organizationId: string, importJobId: string) {
  const rows = await withOrganizationContext(organizationId, (tx) => tx.importRow.findMany({
    orderBy: { rowNumber: "asc" },
    where: { importJobId },
  }));
  return [
    ["rowNumber", "status", "action", "entityType", "entityId", "message", "warnings", "errors"],
    ...rows.map((row) => [
      row.rowNumber,
      row.status,
      row.resolutionAction ?? "",
      row.importedEntityType ?? row.matchedEntityType ?? "",
      row.importedEntityId ?? row.matchedEntityId ?? "",
      rowMessage(row),
      Array.isArray(row.warnings) ? row.warnings.join("; ") : "",
      Array.isArray(row.errors) ? row.errors.join("; ") : "",
    ]),
  ];
}

function normalizedData(row: { normalizedData: Prisma.JsonValue | null }) {
  return row.normalizedData && typeof row.normalizedData === "object" && !Array.isArray(row.normalizedData)
    ? (row.normalizedData as Record<string, unknown>)
    : {};
}

function stringField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function numberField(data: Record<string, unknown>, key: string, fallback: number) {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function processPlayerRow(tx: Prisma.TransactionClient, organizationId: string, row: { id: string; matchedEntityId: string | null; matchedEntityType: string | null; normalizedData: Prisma.JsonValue | null; resolutionAction: ImportResolutionAction | null }, userId: string) {
  const data = normalizedData(row);
  const action = row.resolutionAction ?? ImportResolutionAction.CREATE;
  if (action === ImportResolutionAction.SKIP || action === ImportResolutionAction.REJECT) {
    return { entityId: null, entityType: null, status: action === ImportResolutionAction.SKIP ? ImportRowStatus.SKIPPED : ImportRowStatus.FAILED };
  }

  const email = stringField(data, "email");
  let linkedUserId: string | null = null;
  let athleteId: string | null = null;
  if (row.matchedEntityType === "User") linkedUserId = row.matchedEntityId;
  if (row.matchedEntityType === "Athlete") athleteId = row.matchedEntityId;
  if (row.matchedEntityType === "Player" && row.matchedEntityId) {
    const player = await tx.player.findUnique({ where: { id: row.matchedEntityId }, select: { athleteId: true } });
    athleteId = player?.athleteId ?? null;
  }
  if (!linkedUserId && email) {
    const user = await tx.user.upsert({
      where: { email },
      update: { isActive: true },
      create: { email, isActive: true, name: `${stringField(data, "firstName")} ${stringField(data, "lastName")}`.trim(), role: UserRole.FAN },
      select: { id: true },
    });
    linkedUserId = user.id;
    await ensureFanRole(tx, organizationId, user.id, userId);
  }
  if (!athleteId && linkedUserId) {
    const existing = await tx.athlete.findUnique({ where: { userId: linkedUserId }, select: { id: true } });
    athleteId = existing?.id ?? null;
  }
  if (!athleteId) {
    const athlete = await tx.athlete.create({
      data: {
        organizationId,
        dateOfBirth: parseDate(stringField(data, "dateOfBirth")) ?? new Date("2000-01-01T00:00:00Z"),
        dominantHand: stringField(data, "dominantHand") || "RIGHT",
        email: email || null,
        firstName: stringField(data, "firstName"),
        gender: stringField(data, "gender") as AthleteGender,
        lastName: stringField(data, "lastName"),
        phone: stringField(data, "phone") || null,
        previousTeam: stringField(data, "previousTeam") || null,
        userId: linkedUserId,
      },
      select: { id: true },
    });
    athleteId = athlete.id;
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.ATHLETE,
      publicKey: athlete.id,
      organizationId,
      resourceId: athlete.id,
    });
  }

  const seasonId = stringField(data, "seasonId");
  const player = await tx.player.upsert({
    where: { athleteId_seasonId: { athleteId, seasonId } },
    update: {
      draftSelectionGroup: stringField(data, "draftSelectionGroup") as DraftSelectionGroup,
      heightCm: numberField(data, "heightCm", 180),
      position: stringField(data, "position") || "TBD",
      selectionNotes: stringField(data, "selectionNotes") || null,
      status: PlayerStatus.DRAFT_ELIGIBLE,
      tryoutNumber: stringField(data, "tryoutNumber"),
      tryoutScore: numberField(data, "tryoutScore", 0),
      weightKg: numberField(data, "weightKg", 75),
    },
    create: {
      organizationId,
      athleteId,
      draftSelectionGroup: stringField(data, "draftSelectionGroup") as DraftSelectionGroup,
      heightCm: numberField(data, "heightCm", 180),
      position: stringField(data, "position") || "TBD",
      seasonId,
      selectionNotes: stringField(data, "selectionNotes") || null,
      status: PlayerStatus.DRAFT_ELIGIBLE,
      tryoutNumber: stringField(data, "tryoutNumber"),
      tryoutScore: numberField(data, "tryoutScore", 0),
      weightKg: numberField(data, "weightKg", 75),
    },
    select: { id: true },
  });
  if (linkedUserId && stringField(data, "applicationStatus") === ApplicationStatus.APPROVED) {
    await ensureRole(tx, organizationId, linkedUserId, UserRole.PLAYER, userId);
    await tx.application.upsert({
      where: { id: `import-player-${player.id}` },
      update: { applicantUserId: linkedUserId, status: ApplicationStatus.APPROVED },
      create: {
        id: `import-player-${player.id}`,
        organizationId,
        applicantUserId: linkedUserId,
        reviewedAt: new Date(),
        reviewedById: userId,
        status: ApplicationStatus.APPROVED,
        submittedData: data as Prisma.InputJsonValue,
        type: ApplicationType.PLAYER,
      },
    });
  }
  return { entityId: player.id, entityType: "Player", status: ImportRowStatus.IMPORTED };
}

async function processCoachRow(tx: Prisma.TransactionClient, organizationId: string, row: { matchedEntityId: string | null; matchedEntityType: string | null; normalizedData: Prisma.JsonValue | null; resolutionAction: ImportResolutionAction | null }, userId: string) {
  const data = normalizedData(row);
  const action = row.resolutionAction ?? ImportResolutionAction.CREATE;
  if (action === ImportResolutionAction.SKIP || action === ImportResolutionAction.REJECT) {
    return { entityId: null, entityType: null, status: action === ImportResolutionAction.SKIP ? ImportRowStatus.SKIPPED : ImportRowStatus.FAILED };
  }
  const email = stringField(data, "email");
  const user = await tx.user.upsert({
    where: { email },
    update: { isActive: true, name: stringField(data, "fullName") },
    create: { email, isActive: true, name: stringField(data, "fullName"), role: UserRole.FAN },
    select: { id: true },
  });
  await ensureFanRole(tx, organizationId, user.id, userId);
  if (stringField(data, "applicationStatus") === ApplicationStatus.APPROVED) await ensureRole(tx, organizationId, user.id, UserRole.COACH, userId);
  const staff = await tx.staff.upsert({
    where: { userId: user.id },
    update: { email, name: stringField(data, "fullName"), phone: stringField(data, "phone") || null, role: StaffRole.HEAD_COACH },
    create: { organizationId, email, name: stringField(data, "fullName"), phone: stringField(data, "phone") || null, role: StaffRole.HEAD_COACH, userId: user.id },
    select: { id: true },
  });
  const assignmentRole = stringField(data, "assignmentRole");
  const seasonClubId = stringField(data, "seasonClubId");
  if (seasonClubId && (assignmentRole === "HEAD_COACH" || assignmentRole === "ASSISTANT_COACH")) {
    await tx.seasonClub.update({
      data: assignmentRole === "HEAD_COACH" ? { headCoachId: staff.id } : { assistantCoachId: staff.id },
      where: { id: seasonClubId },
    });
  }
  return { entityId: staff.id, entityType: "Staff", status: ImportRowStatus.IMPORTED };
}

async function processClubRow(tx: Prisma.TransactionClient, organizationId: string, row: { matchedEntityId: string | null; matchedEntityType: string | null; normalizedData: Prisma.JsonValue | null; resolutionAction: ImportResolutionAction | null }) {
  const data = normalizedData(row);
  const action = row.resolutionAction ?? ImportResolutionAction.CREATE;
  if (action === ImportResolutionAction.SKIP || action === ImportResolutionAction.REJECT) {
    return { entityId: null, entityType: null, status: action === ImportResolutionAction.SKIP ? ImportRowStatus.SKIPPED : ImportRowStatus.FAILED };
  }
  const club = row.matchedEntityType === "Club" && row.matchedEntityId
    ? await tx.club.update({
        data: {
          foundedYear: numberField(data, "foundedYear", 0) || null,
          logoUrl: stringField(data, "logoUrl") || null,
          name: stringField(data, "clubName"),
          primaryColor: stringField(data, "primaryColor") || null,
          secondaryColor: stringField(data, "secondaryColor") || null,
          shortName: stringField(data, "shortName"),
          status: stringField(data, "status") as ClubStatus,
          websiteUrl: stringField(data, "website") || null,
        },
        select: { id: true },
        where: { id: row.matchedEntityId },
      })
    : await tx.club.create({
        data: {
          organizationId,
          foundedYear: numberField(data, "foundedYear", 0) || null,
          logoUrl: stringField(data, "logoUrl") || null,
          name: stringField(data, "clubName"),
          primaryColor: stringField(data, "primaryColor") || null,
          secondaryColor: stringField(data, "secondaryColor") || null,
          shortName: stringField(data, "shortName"),
          sportId: stringField(data, "sportId"),
          status: stringField(data, "status") as ClubStatus,
          websiteUrl: stringField(data, "website") || null,
        },
        select: { id: true },
  });
  const seasonId = stringField(data, "seasonId");
  await upsertPublicResourceLocator(tx, {
    resourceType: PublicResourceLocatorType.CLUB,
    publicKey: club.id,
    organizationId,
    resourceId: club.id,
  });
  const divisionId = stringField(data, "divisionId");
  if (seasonId && divisionId) {
    const seasonClub = await tx.seasonClub.upsert({
      where: { seasonId_clubId_divisionId: { clubId: club.id, divisionId, seasonId } },
      update: {},
      create: { organizationId, clubId: club.id, divisionId, seasonId, status: SeasonClubStatus.ACTIVE },
      select: { id: true },
    });
    await tx.standing.upsert({
      where: { seasonClubId: seasonClub.id },
      update: {},
      create: { organizationId, seasonClubId: seasonClub.id, seasonId },
    });
  }
  return { entityId: club.id, entityType: "Club", status: ImportRowStatus.IMPORTED };
}

export async function confirmImportJob(organizationId: string, importJobId: string, userId: string) {
  // The lookup, every per-row transaction, and the final completion update all run inside this
  // same organization's context - a client-supplied importJobId belonging to a different
  // organization is invisible here (RLS), so "Import job not found" is the same clean result a
  // genuinely missing id gets, not a distinguishable signal.
  const job = await withOrganizationContext(organizationId, (tx) => tx.importJob.findUnique({
    include: { rows: { orderBy: { rowNumber: "asc" } } },
    where: { id: importJobId },
  }));
  if (!job) throw new Error("Import job not found.");
  const nonBlockingResolutionActions: ImportResolutionAction[] = [
    ImportResolutionAction.SKIP,
    ImportResolutionAction.REJECT,
  ];
  const unresolvedErrors = job.rows.filter(
    (row) =>
      row.status === ImportRowStatus.ERROR &&
      !nonBlockingResolutionActions.includes(row.resolutionAction as ImportResolutionAction),
  );
  if (unresolvedErrors.length > 0) throw new Error("Unresolved error rows must be skipped, rejected, or resolved before confirmation.");

  await withOrganizationContext(organizationId, (tx) => tx.importJob.update({ where: { id: importJobId }, data: { startedAt: new Date(), status: ImportStatus.PROCESSING } }));
  let importedRows = 0;
  let skippedRows = 0;
  let failedRows = 0;

  for (const row of job.rows) {
    try {
      await withOrganizationContext(organizationId, async (tx) => {
        let result: { entityId: string | null; entityType: string | null; status: ImportRowStatus };
        if (job.type === ImportType.PLAYER) result = await processPlayerRow(tx, organizationId, row, userId);
        else if (job.type === ImportType.COACH) result = await processCoachRow(tx, organizationId, row, userId);
        else result = await processClubRow(tx, organizationId, row);
        if (result.status === ImportRowStatus.IMPORTED) importedRows += 1;
        if (result.status === ImportRowStatus.SKIPPED) skippedRows += 1;
        if (result.status === ImportRowStatus.FAILED) failedRows += 1;
        await tx.importRow.update({
          data: { importedEntityId: result.entityId, importedEntityType: result.entityType, status: result.status },
          where: { id: row.id },
        });
        await writeAuditLog(tx, {
          organizationId,
          action: "IMPORT_ROW_PROCESSED",
          details: { importJobId, rowNumber: row.rowNumber, status: result.status, type: job.type },
          entityId: row.id,
          entityType: "ImportRow",
          userId,
        });
      });
    } catch (error) {
      failedRows += 1;
      await withOrganizationContext(organizationId, (tx) => tx.importRow.update({
        data: { errors: [error instanceof Error ? error.message : "Import row failed."], status: ImportRowStatus.FAILED },
        where: { id: row.id },
      }));
    }
  }

  const finalStatus = failedRows === 0 ? ImportStatus.COMPLETED : importedRows > 0 || skippedRows > 0 ? ImportStatus.PARTIALLY_COMPLETED : ImportStatus.FAILED;
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.importJob.update({
      data: { completedAt: new Date(), failedRows, importedRows, skippedRows, status: finalStatus },
      where: { id: importJobId },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "IMPORT_COMPLETED",
      details: { failedRows, importJobId, importedRows, skippedRows, status: finalStatus, type: job.type },
      entityId: importJobId,
      entityType: "ImportJob",
      userId,
    });
  });
}
