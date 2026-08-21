import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import {
  ApplicationProvisioningStatus,
  ApplicationStatus,
  ApplicationType,
  AthleteGender,
  CoachSeasonZeroSelectionStatus,
  DraftSelectionGroup,
  PlayerStatus,
  RecordOrigin,
  StaffRole,
  UserRole,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { approvedPlayerDuplicateGroups, duplicateResolutionSummary } from "@/lib/data-quality";
import { prisma } from "@/lib/prisma";
import { ensureAthletePublicId, ensureStaffPublicId } from "@/lib/public-ids";

type JsonObject = Record<string, unknown>;

export type InternalizationOptions = {
  apply?: boolean;
  actorUserId?: string;
  allowProductionWrite?: boolean;
  scope?: string;
};

export type InternalizationReport = {
  dryRun: boolean;
  applicationsScanned: number;
  usersLinked: number;
  usersCreated: number;
  athletesLinked: number;
  athletesCreated: number;
  playersCreated: number;
  playersUpdated: number;
  staffLinked: number;
  staffCreated: number;
  rolesGranted: number;
  publicIdsAssigned: number;
  ambiguousRecords: number;
  failedRecords: number;
  items: InternalizationItem[];
  scope?: string;
  allDuplicateGroups?: number;
  selectedCohortDuplicateGroups?: number;
  unrelatedDuplicateGroups?: number;
};

export type InternalizationItem = {
  applicationId: string;
  type: ApplicationType;
  status: "READY" | "WOULD_APPLY" | "APPLIED" | "WARNING" | "FAILED";
  actions: string[];
  warnings: string[];
};

export function normalizeEmail(value: unknown) {
  return typeof value === "string" && value.includes("@") ? value.trim().toLowerCase() : "";
}

export function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/[^\d+]/g, "") : "";
}

function dataObject(value: Prisma.JsonValue): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function text(data: JsonObject, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function numberValue(data: JsonObject, key: string, fallback: number) {
  const value = data[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function heightToCm(data: JsonObject) {
  // The applicant form collects height as "feet.inches" (e.g. "5.10" = 5'10", "6.2" = 6'2"),
  // not decimal feet — the inches digits must be read literally, not multiplied by 0.01.
  const raw = text(data, "heightFeet", "height", "heightInFeet").replace(/[^\d.]/g, "");
  const [feetPart, inchPart] = raw.split(".");
  const feet = Number(feetPart);
  if (Number.isFinite(feet) && feet > 0) {
    const inches = inchPart ? Number(inchPart.slice(0, 2)) : 0;
    if (Number.isFinite(inches) && inches <= 11) return Math.round(feet * 30.48 + inches * 2.54);
    return Math.round(feet * 30.48);
  }
  return numberValue(data, "heightCm", 183);
}

function splitName(data: JsonObject) {
  const fullName = text(data, "fullName", "name").replace(/\s+/g, " ").trim();
  if (!fullName) return { firstName: "Unknown", lastName: "Applicant", fullName: "Unknown Applicant" };
  const parts = fullName.split(" ");
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || "Applicant",
    fullName,
  };
}

function gender(data: JsonObject) {
  return text(data, "gender", "genderDivision").toLowerCase().includes("female") ? AthleteGender.FEMALE : AthleteGender.MALE;
}

function draftSelectionGroup(data: JsonObject) {
  const value = text(data, "draftSelectionGroup").toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
  return Object.values(DraftSelectionGroup).includes(value as DraftSelectionGroup) ? value as DraftSelectionGroup : DraftSelectionGroup.PENDING_SELECTION;
}

function decimalNumber(data: JsonObject, key: string) {
  const value = data[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSelectedDraftCohort(data: JsonObject) {
  return text(data, "draftCohort") === "SEASON_ZERO_DRAFT_COHORT";
}

export function roleForApplication(type: ApplicationType): UserRole | null {
  if (type === ApplicationType.PLAYER) return UserRole.PLAYER;
  if (type === ApplicationType.COACH) return UserRole.COACH;
  if (type === ApplicationType.SCOUT) return UserRole.SCOUT;
  if (type === ApplicationType.OFFICIAL) return UserRole.OFFICIAL;
  if (type === ApplicationType.VENDOR) return UserRole.VENDOR;
  if (type === ApplicationType.MEDIA) return UserRole.MEDIA;
  if (type === ApplicationType.VOLUNTEER) return UserRole.VOLUNTEER;
  return null;
}

export function staffRoleForApplication(type: ApplicationType): StaffRole {
  if (type === ApplicationType.SCOUT) return StaffRole.SCOUT;
  if (type === ApplicationType.OFFICIAL) return StaffRole.OFFICIAL;
  if (type === ApplicationType.VOLUNTEER) return StaffRole.VOLUNTEER;
  return StaffRole.HEAD_COACH;
}

export function isStaffApplication(type: ApplicationType) {
  return type === ApplicationType.COACH || type === ApplicationType.SCOUT || type === ApplicationType.OFFICIAL || type === ApplicationType.VOLUNTEER;
}

function isProfileOnlyApplication(type: ApplicationType) {
  return type === ApplicationType.VENDOR || type === ApplicationType.MEDIA;
}

async function grantRole(tx: Prisma.TransactionClient, userId: string, role: UserRole, grantedById?: string) {
  await tx.userRoleAssignment.upsert({
    where: { userId_role: { userId, role } },
    update: { revokedAt: null, grantedById, grantedAt: new Date() },
    create: { userId, role, grantedById },
  });
}

async function ensureUser(tx: Prisma.TransactionClient, data: JsonObject, applicationUserId: string | null) {
  const email = normalizeEmail(data.email);
  if (applicationUserId) {
    return { user: await tx.user.findUniqueOrThrow({ where: { id: applicationUserId } }), created: false };
  }
  if (!email) throw new Error("Approved application has no usable email.");
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) return { user: existing, created: false };
  const { fullName } = splitName(data);
  const user = await tx.user.create({
    data: {
      email,
      name: fullName,
      passwordHash: await hash(randomUUID(), 12),
      role: UserRole.FAN,
      recordOrigin: RecordOrigin.APPLICATION,
      roles: { create: { role: UserRole.FAN } },
    },
  });
  return { user, created: true };
}

export async function internalizeApprovedApplications(options: InternalizationOptions = {}): Promise<InternalizationReport> {
  if (options.apply && process.env.NODE_ENV === "production" && !options.allowProductionWrite && process.env.CONFIRM_PARTICIPANT_INTERNALIZE !== "YES") {
    throw new Error("Refusing production participant internalization without CONFIRM_PARTICIPANT_INTERNALIZE=YES.");
  }

  const allApplications = await prisma.application.findMany({
    where: { status: ApplicationStatus.APPROVED },
    orderBy: { createdAt: "asc" },
  });
  const applications = options.scope === "season-zero-draft-cohort"
    ? allApplications.filter((application) => application.type === ApplicationType.PLAYER && isSelectedDraftCohort(dataObject(application.submittedData)))
    : options.scope === "season-zero-approved-coaches"
      ? allApplications.filter((application) => application.type === ApplicationType.COACH && application.coachSeasonZeroSelectionStatus === CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED)
      : allApplications;
  const report: InternalizationReport = {
    dryRun: !options.apply,
    applicationsScanned: applications.length,
    usersLinked: 0,
    usersCreated: 0,
    athletesLinked: 0,
    athletesCreated: 0,
    playersCreated: 0,
    playersUpdated: 0,
    staffLinked: 0,
    staffCreated: 0,
    rolesGranted: 0,
    publicIdsAssigned: 0,
    ambiguousRecords: 0,
    failedRecords: 0,
    items: [],
    scope: options.scope,
  };

  const duplicateGroups = await approvedPlayerDuplicateGroups();
  const scopedApplicationIds = new Set(applications.map((application) => application.id));
  const scopedDuplicateGroups = duplicateGroups.filter((group) => group.applications.some((application) => scopedApplicationIds.has(application.applicationId)));
  const unresolvedScopedDuplicateGroups = scopedDuplicateGroups.filter((group) => group.currentResolution === "UNRESOLVED");
  report.allDuplicateGroups = duplicateGroups.length;
  report.selectedCohortDuplicateGroups = scopedDuplicateGroups.length;
  report.unrelatedDuplicateGroups = duplicateGroups.length - scopedDuplicateGroups.length;
  if (options.scope === "season-zero-draft-cohort" && unresolvedScopedDuplicateGroups.length > 0) {
    report.ambiguousRecords = unresolvedScopedDuplicateGroups.length;
    report.items.push({
      applicationId: "duplicate-identity-review",
      type: ApplicationType.PLAYER,
      status: "WARNING",
      actions: [],
      warnings: [`${unresolvedScopedDuplicateGroups.length} selected-cohort duplicate identity group(s) remain unresolved. Resolve /data-quality/duplicates?filter=draft-cohort before scoped internalization apply.`],
    });
    return report;
  }
  if (options.scope === "season-zero-approved-coaches") {
    const unresolvedDivisionCoaches = applications.filter((application) => !application.coachSeasonZeroDivision);
    if (unresolvedDivisionCoaches.length > 0) {
      report.ambiguousRecords = unresolvedDivisionCoaches.length;
      report.items.push({
        applicationId: "coach-division-review",
        type: ApplicationType.COACH,
        status: "WARNING",
        actions: [],
        warnings: [`${unresolvedDivisionCoaches.length} Season Zero selected coach(es) have no MEN/WOMEN draft division assigned: ${unresolvedDivisionCoaches.map((application) => application.id).join(", ")}. Assign a division at /coaches/season-zero-selection before internalization apply.`],
      });
      return report;
    }
  }
  if (!options.scope) {
    const duplicateSummary = await duplicateResolutionSummary();
    if (duplicateSummary.unresolved > 0) {
      report.ambiguousRecords = duplicateSummary.unresolved;
      report.items.push({
        applicationId: "duplicate-identity-review",
        type: ApplicationType.PLAYER,
        status: "WARNING",
        actions: [],
        warnings: [`${duplicateSummary.unresolved} approved-player duplicate identity groups remain unresolved. Resolve /data-quality/duplicates before full internalization apply.`],
      });
      return report;
    }
  }

  for (const application of applications) {
    const data = dataObject(application.submittedData);
    const item: InternalizationItem = { applicationId: application.id, type: application.type, status: options.apply ? "APPLIED" : "WOULD_APPLY", actions: [], warnings: [] };
    try {
      const email = normalizeEmail(data.email);
      if (!email && !application.applicantUserId) {
        item.status = "WARNING";
        item.warnings.push("Missing email and applicant user.");
        report.ambiguousRecords += 1;
        report.items.push(item);
        continue;
      }
      const duplicateUsers = email ? await prisma.user.count({ where: { email } }) : 0;
      if (duplicateUsers > 1) {
        item.status = "WARNING";
        item.warnings.push("Duplicate user email candidates.");
        report.ambiguousRecords += 1;
        report.items.push(item);
        continue;
      }

      if (!options.apply) {
        if (application.provisionedUserId && (application.type !== ApplicationType.PLAYER || application.provisionedAthleteId) && (application.type !== ApplicationType.PLAYER || application.provisionedPlayerId)) {
          item.status = "READY";
          item.actions.push("Already internalized.");
          report.items.push(item);
          continue;
        }
        item.actions.push("Would link or create User and preserve FAN capability.");
        if (application.type === ApplicationType.PLAYER) item.actions.push("Would link/create Athlete, assign Ultra Athlete ID, and upsert Player registration.");
        if (isStaffApplication(application.type)) item.actions.push("Would link/create Staff and assign Ultra Staff ID.");
        if (isProfileOnlyApplication(application.type)) item.actions.push("Would create or update role-specific profile.");
        report.items.push(item);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const { user, created } = await ensureUser(tx, data, application.applicantUserId);
        if (created) report.usersCreated += 1;
        else report.usersLinked += 1;
        await grantRole(tx, user.id, UserRole.FAN, options.actorUserId);

        const appRole = roleForApplication(application.type);
        if (appRole) {
          await grantRole(tx, user.id, appRole, options.actorUserId);
          report.rolesGranted += 1;
        }

        let athleteId: string | undefined;
        let playerId: string | undefined;
        let staffId: string | undefined;
        let provisioningStatus: ApplicationProvisioningStatus = ApplicationProvisioningStatus.ROLE_GRANTED;

        if (application.type === ApplicationType.PLAYER) {
          const name = splitName(data);
          const existingAthlete = await tx.athlete.findFirst({
            where: { OR: [{ userId: user.id }, ...(email ? [{ email }] : [])] },
          });
          const athlete = existingAthlete
            ? await tx.athlete.update({
                where: { id: existingAthlete.id },
                data: {
                  userId: user.id,
                  firstName: name.firstName,
                  lastName: name.lastName,
                  phone: normalizePhone(data.phone) || null,
                  email: email || undefined,
                  photoUrl: text(data, "profilePhotoUrl", "photoUrl") || undefined,
                  previousTeam: text(data, "academyTeam", "previousTeam") || null,
                },
              })
            : await tx.athlete.create({
                data: {
                  userId: user.id,
                  firstName: name.firstName,
                  lastName: name.lastName,
                  gender: gender(data),
                  dateOfBirth: text(data, "dateOfBirth") ? new Date(text(data, "dateOfBirth")) : new Date("2000-01-01T00:00:00Z"),
                  dominantHand: text(data, "dominantHand", "RIGHT") || "RIGHT",
                  phone: normalizePhone(data.phone) || null,
                  email: email || null,
                  previousTeam: text(data, "academyTeam", "previousTeam") || null,
                  photoUrl: text(data, "profilePhotoUrl", "photoUrl") || null,
                  recordOrigin: RecordOrigin.APPLICATION,
                },
              });
          if (existingAthlete) report.athletesLinked += 1;
          else report.athletesCreated += 1;
          if (!athlete.ultraAthleteId) report.publicIdsAssigned += 1;
          await ensureAthletePublicId(tx, athlete.id);
          athleteId = athlete.id;
          const season = await tx.season.findFirst({ where: { status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: { startDate: "desc" } });
          if (season) {
            const existingPlayer = await tx.player.findUnique({ where: { athleteId_seasonId: { athleteId: athlete.id, seasonId: season.id } } });
            const player = await tx.player.upsert({
              where: { athleteId_seasonId: { athleteId: athlete.id, seasonId: season.id } },
              update: {
                position: text(data, "position", "TBD"),
                heightCm: heightToCm(data),
                weightKg: numberValue(data, "weightKg", 75),
                tryoutNumber: text(data, "tryoutNumber") || undefined,
                tryoutScore: decimalNumber(data, "tryoutScore"),
                draftSelectionGroup: draftSelectionGroup(data),
                selectionNotes: text(data, "selectionNotes") || undefined,
                status: PlayerStatus.DRAFT_ELIGIBLE,
              },
              create: {
                athleteId: athlete.id,
                seasonId: season.id,
                position: text(data, "position", "TBD"),
                heightCm: heightToCm(data),
                weightKg: numberValue(data, "weightKg", 75),
                tryoutNumber: text(data, "tryoutNumber") || null,
                tryoutScore: decimalNumber(data, "tryoutScore"),
                selectionNotes: text(data, "selectionNotes") || null,
                status: PlayerStatus.DRAFT_ELIGIBLE,
                draftSelectionGroup: draftSelectionGroup(data),
              },
            });
            playerId = player.id;
            if (existingPlayer) report.playersUpdated += 1;
            else report.playersCreated += 1;
            provisioningStatus = ApplicationProvisioningStatus.SEASON_REGISTRATION_CREATED;
          } else {
            provisioningStatus = ApplicationProvisioningStatus.PROFILE_PROVISIONED;
          }
        } else if (isStaffApplication(application.type)) {
          const existingStaff = await tx.staff.findFirst({ where: { OR: [{ userId: user.id }, ...(email ? [{ email }] : [])] } });
          const staff = existingStaff
            ? await tx.staff.update({
                where: { id: existingStaff.id },
                data: { userId: user.id, name: splitName(data).fullName, email: email || undefined, phone: normalizePhone(data.phone) || null, role: staffRoleForApplication(application.type) },
              })
            : await tx.staff.create({
                data: { userId: user.id, name: splitName(data).fullName, email: email || null, phone: normalizePhone(data.phone) || null, role: staffRoleForApplication(application.type), recordOrigin: RecordOrigin.APPLICATION },
              });
          if (existingStaff) report.staffLinked += 1;
          else report.staffCreated += 1;
          if (!staff.ultraStaffId) report.publicIdsAssigned += 1;
          await ensureStaffPublicId(tx, staff.id);
          staffId = staff.id;
          provisioningStatus = ApplicationProvisioningStatus.PROFILE_PROVISIONED;
        }

        await tx.application.update({
          where: { id: application.id },
          data: {
            applicantUserId: user.id,
            provisionedUserId: user.id,
            provisionedAthleteId: athleteId,
            provisionedPlayerId: playerId,
            provisionedStaffId: staffId,
            provisionedAt: new Date(),
            provisioningStatus,
          },
        });
        if (options.actorUserId) {
          await writeAuditLog(tx, {
            userId: options.actorUserId,
            action: "APPLICATION_INTERNALIZED",
            entityType: "Application",
            entityId: application.id,
            details: { type: application.type, provisioningStatus },
          });
        }
      });
      item.actions.push("Internalized approved application.");
    } catch (error) {
      item.status = "FAILED";
      item.warnings.push(error instanceof Error ? error.message : "Unknown failure.");
      report.failedRecords += 1;
    }
    report.items.push(item);
  }

  return report;
}
