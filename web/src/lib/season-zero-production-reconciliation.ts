import { ApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { maskEmail, maskPhone } from "@/lib/data-quality";
import { prisma } from "@/lib/prisma";
import selectedPlayers from "@/data/season-zero-selected-players.json";

const resolutionPrefix = "season-zero-player-resolution:";

// The authoritative Season Zero selected cohort (58 players), matched to
// their canonical production Application ID via the "Application ID" column
// in TryOutsPlayers.xlsx — never inferred from email/phone, which is what
// produced false "duplicate" ambiguity before this was discovered. Deliberately
// contains no PII (email/phone) in source control; live values are read from
// the database at request time.
export type SelectedPlayer = {
  applicationId: string;
  name: string;
  division: "MEN" | "WOMEN";
  draftSelectionGroup: "MAIN_DRAFT" | "SECONDARY_DRAFT";
  mainDraftGroupNumber: number | null;
};

export const SEASON_ZERO_SELECTED_PLAYERS: SelectedPlayer[] = selectedPlayers as SelectedPlayer[];

export const seasonZeroPlayerResolutionActions = [
  "USE_AS_CANONICAL_SEASON_ZERO_APPLICATION",
  "KEEP_AS_HISTORICAL_DUPLICATE",
  "INVESTIGATE",
  "APPROVE_FOR_SEASON_ZERO_OVERRIDE",
  "KEEP_REJECTED_EXCLUDE_FROM_CURRENT_COHORT",
  "APPROVE_SELECTED_SEASON_ZERO_COHORT",
] as const;
export type SeasonZeroPlayerResolutionAction = (typeof seasonZeroPlayerResolutionActions)[number];

export type SeasonZeroPlayerRow = SelectedPlayer & {
  productionApplicationStatus: "APPROVED" | "SUBMITTED" | "REJECTED" | "WITHDRAWN" | "UNDER_REVIEW" | "MISSING";
  applicantUserId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  resolutionStatus: "READY" | "SUBMITTED_REQUIRES_APPROVAL" | "REJECTED_REQUIRES_OVERRIDE" | "MISSING" | "RESOLVED";
  resolution: { action: string; reason: string; resolvedById: string; resolvedAt: string } | null;
};

export async function seasonZeroProductionReconciliation(): Promise<SeasonZeroPlayerRow[]> {
  const ids = SEASON_ZERO_SELECTED_PLAYERS.map((p) => p.applicationId);
  const [applications, resolutions] = await Promise.all([
    prisma.application.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, applicantUserId: true, reviewedAt: true, notes: true },
    }),
    prisma.systemSetting.findMany({ where: { key: { startsWith: resolutionPrefix } }, select: { key: true, value: true } }),
  ]);
  const byId = new Map(applications.map((a) => [a.id, a]));
  const resolutionById = new Map(resolutions.map((r) => [r.key.replace(resolutionPrefix, ""), r.value as { action: string; reason: string; resolvedById: string; resolvedAt: string }]));

  return SEASON_ZERO_SELECTED_PLAYERS.map((player) => {
    const app = byId.get(player.applicationId);
    const resolution = resolutionById.get(player.applicationId) ?? null;
    const status = app?.status ?? "MISSING";
    const resolutionStatus = resolution
      ? "RESOLVED"
      : status === ApplicationStatus.APPROVED
        ? "READY"
        : status === ApplicationStatus.SUBMITTED
          ? "SUBMITTED_REQUIRES_APPROVAL"
          : status === ApplicationStatus.REJECTED
            ? "REJECTED_REQUIRES_OVERRIDE"
            : "MISSING";
    return {
      ...player,
      applicantUserId: app?.applicantUserId ?? null,
      productionApplicationStatus: status as SeasonZeroPlayerRow["productionApplicationStatus"],
      resolution,
      resolutionStatus,
      reviewedAt: app?.reviewedAt ?? null,
      reviewNotes: app?.notes ?? null,
    };
  });
}

// For a canonical Application, find every OTHER Application sharing its
// applicant email — the full duplicate-candidate list an administrator needs
// to see before picking a canonical record. Never auto-resolved.
export async function duplicateCandidatesForApplication(applicationId: string) {
  const canonical = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  const data = canonical.submittedData as Record<string, unknown> | null;
  const email = String(data?.email ?? "").trim().toLowerCase();
  if (!email) return [];
  const candidates = await prisma.application.findMany({
    where: { submittedData: { path: ["email"], string_contains: email } },
    orderBy: { createdAt: "asc" },
  });
  // Exact case-insensitive match only — string_contains is a coarse pre-filter.
  return candidates
    .filter((c) => String((c.submittedData as Record<string, unknown> | null)?.email ?? "").trim().toLowerCase() === email)
    .map((c) => {
      const cd = c.submittedData as Record<string, unknown> | null;
      return {
        applicationId: c.id,
        status: c.status,
        userId: c.applicantUserId,
        normalizedName: String(cd?.fullName ?? cd?.name ?? ""),
        maskedEmail: maskEmail(String(cd?.email ?? "")),
        maskedPhone: maskPhone(String(cd?.phone ?? "")),
        submittedAt: c.createdAt,
        reviewedAt: c.reviewedAt,
        reviewNotes: c.notes,
        isCanonical: c.id === applicationId,
      };
    });
}

export async function saveSeasonZeroPlayerResolution(input: {
  applicationId: string;
  action: SeasonZeroPlayerResolutionAction;
  reason: string;
  actorUserId: string;
}) {
  if (!seasonZeroPlayerResolutionActions.includes(input.action)) throw new Error("Invalid resolution action.");
  if (!input.reason.trim()) throw new Error("A resolution reason is required.");
  if (!SEASON_ZERO_SELECTED_PLAYERS.some((p) => p.applicationId === input.applicationId)) {
    throw new Error("Application is not part of the authoritative Season Zero selected cohort.");
  }
  const value = {
    action: input.action,
    reason: input.reason.trim(),
    resolvedById: input.actorUserId,
    resolvedAt: new Date().toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: `${resolutionPrefix}${input.applicationId}` },
      update: { value, description: "Season Zero production player reconciliation decision", category: "data-quality" },
      create: { key: `${resolutionPrefix}${input.applicationId}`, value, description: "Season Zero production player reconciliation decision", category: "data-quality" },
    });
    await writeAuditLog(tx, {
      action: "SEASON_ZERO_PLAYER_RESOLUTION_RECORDED",
      details: value,
      entityId: input.applicationId,
      entityType: "Application",
      userId: input.actorUserId,
    });
  });
}

// Actually flips Application.status for a recorded resolution. Deliberately
// separate from saveSeasonZeroPlayerResolution() — recording a decision and
// applying it are two distinct, independently-audited steps. Not invoked
// anywhere yet; this exists so applying a decision later is a one-function
// call once an administrator has actually recorded one.
export async function applySeasonZeroPlayerApproval(applicationId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const resolution = await tx.systemSetting.findUnique({ where: { key: `${resolutionPrefix}${applicationId}` } });
    if (!resolution) throw new Error("No recorded resolution for this Application — record a decision before applying it.");
    const value = resolution.value as { action: string; reason: string };
    if (value.action !== "APPROVE_FOR_SEASON_ZERO_OVERRIDE" && value.action !== "APPROVE_SELECTED_SEASON_ZERO_COHORT") {
      throw new Error(`Recorded resolution action "${value.action}" does not authorize an approval write.`);
    }
    const application = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    const oldStatus = application.status;
    await tx.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.APPROVED, reviewedAt: new Date(), reviewedById: actorUserId },
    });
    await writeAuditLog(tx, {
      action: "SEASON_ZERO_PLAYER_APPLICATION_APPROVED",
      details: { newStatus: "APPROVED", oldStatus, reason: value.reason, resolutionAction: value.action },
      entityId: applicationId,
      entityType: "Application",
      userId: actorUserId,
    });
  });
}
