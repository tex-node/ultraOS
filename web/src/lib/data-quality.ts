import { prisma } from "@/lib/prisma";

const resolutionPrefix = "duplicate-resolution:";

export const duplicateResolutionActions = [
  "SAME_PERSON_LINK",
  "DISTINCT_PEOPLE",
  "KEEP_PRIMARY_AND_MERGE",
  "CORRECT_SOURCE_EMAIL",
  "EXCLUDE_FROM_CURRENT_COHORT",
  "EXCLUDE_FROM_INTERNALIZATION",
  "REQUIRES_MANUAL_INVESTIGATION",
] as const;

export type DuplicateResolutionAction = (typeof duplicateResolutionActions)[number];

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function fullName(data: Record<string, unknown>, fallback?: string | null) {
  const direct = String(data.fullName ?? "").trim();
  if (direct) return direct;
  const first = String(data.firstName ?? "").trim();
  const last = String(data.lastName ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || fallback || "";
}

export function maskEmail(email?: string | null) {
  const normalized = normalize(email);
  if (!normalized) return null;
  const [local, domain] = normalized.split("@");
  if (!domain) return "<invalid-email>";
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `***${digits.slice(-4)}`;
}

function safeSubmittedData(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

function formulaSafe(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = formulaSafe(value).replaceAll('"', '""');
  return `"${text}"`;
}

export type ApprovedPlayerDuplicateGroup = {
  id: string;
  matchKey: string;
  matchReason: string;
  currentResolution: string;
  applications: {
    applicationId: string;
    userId: string | null;
    maskedEmail: string | null;
    maskedPhone: string | null;
    fullName: string;
    dateOfBirth: string | null;
    gender: string | null;
    position: string | null;
    applicationTimestamp: Date;
    applicationStatus: string;
    existingAthleteLink: string | null;
    existingPlayerRegistration: string | null;
    conflictingFields: string[];
  }[];
};

export async function duplicateIdentityReport() {
  const [userEmails, athleteEmails, staffEmails, athleteNames, staffNames] = await Promise.all([
    prisma.$queryRaw<{ email: string; count: bigint }[]>`
      SELECT lower("email") AS email, COUNT(*) AS count FROM "User"
      GROUP BY lower("email") HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<{ email: string; count: bigint }[]>`
      SELECT lower("email") AS email, COUNT(*) AS count FROM "Athlete"
      WHERE "email" IS NOT NULL GROUP BY lower("email") HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<{ email: string; count: bigint }[]>`
      SELECT lower("email") AS email, COUNT(*) AS count FROM "Staff"
      WHERE "email" IS NOT NULL GROUP BY lower("email") HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<{ name: string; count: bigint }[]>`
      SELECT lower("firstName" || ' ' || "lastName") AS name, COUNT(*) AS count FROM "Athlete"
      GROUP BY lower("firstName" || ' ' || "lastName") HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<{ name: string; count: bigint }[]>`
      SELECT lower("name") AS name, COUNT(*) AS count FROM "Staff"
      GROUP BY lower("name") HAVING COUNT(*) > 1
    `,
  ]);

  return {
    userEmails: userEmails.map((row) => ({ email: row.email, count: Number(row.count) })),
    athleteEmails: athleteEmails.map((row) => ({ email: row.email, count: Number(row.count) })),
    staffEmails: staffEmails.map((row) => ({ email: row.email, count: Number(row.count) })),
    athleteNames: athleteNames.map((row) => ({ name: row.name, count: Number(row.count) })),
    staffNames: staffNames.map((row) => ({ name: row.name, count: Number(row.count) })),
  };
}

export async function approvedPlayerDuplicateGroups(): Promise<ApprovedPlayerDuplicateGroup[]> {
  const applications = await prisma.application.findMany({
    where: { type: "PLAYER", status: "APPROVED" },
    include: {
      applicantUser: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const emails = applications.map((application) => normalize(application.applicantUser?.email)).filter(Boolean);
  const athletes = await prisma.athlete.findMany({
    where: { email: { in: [...new Set(emails)] } },
    include: { registrations: { select: { id: true }, take: 1 } },
  });
  const athleteByEmail = new Map(athletes.map((athlete) => [normalize(athlete.email), athlete]));
  const grouped = new Map<string, typeof applications>();
  for (const application of applications) {
    const data = safeSubmittedData(application.submittedData);
    const key = normalize(application.applicantUser?.email) || normalize(fullName(data, application.applicantUser?.name));
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), application]);
  }
  const resolutions = await prisma.systemSetting.findMany({
    where: { key: { startsWith: resolutionPrefix } },
    select: { key: true, value: true },
  });
  const resolutionByGroupId = new Map(resolutions.map((resolution) => [resolution.key.replace(resolutionPrefix, ""), resolution.value]));

  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows], index) => {
      const groupId = `approved-player-${index + 1}-${Buffer.from(key).toString("base64url").slice(0, 10)}`;
      const resolution = resolutionByGroupId.get(groupId) as { action?: string } | undefined;
      const fields = rows.map((application) => {
        const data = safeSubmittedData(application.submittedData);
        const athlete = athleteByEmail.get(normalize(application.applicantUser?.email));
        return {
          applicationId: application.id,
          userId: application.applicantUserId,
          maskedEmail: maskEmail(application.applicantUser?.email),
          maskedPhone: maskPhone(String(data.phone ?? data.mobile ?? "")),
          fullName: fullName(data, application.applicantUser?.name),
          dateOfBirth: String(data.dateOfBirth ?? data.dob ?? "") || null,
          gender: String(data.gender ?? "") || null,
          position: String(data.position ?? "") || null,
          applicationTimestamp: application.createdAt,
          applicationStatus: application.status,
          existingAthleteLink: athlete?.id ?? null,
          existingPlayerRegistration: athlete?.registrations[0]?.id ?? null,
        };
      });
      const compareFields = ["fullName", "dateOfBirth", "gender", "position"] as const;
      const conflictingFields = compareFields.filter((field) => new Set(fields.map((item) => normalize(item[field]))).size > 1);
      return {
        id: groupId,
        matchKey: key.includes("@") ? maskEmail(key) ?? "masked-email" : key,
        matchReason: key.includes("@") ? "same applicant email on multiple approved player applications" : "same normalized name on multiple approved player applications",
        currentResolution: resolution?.action ?? "UNRESOLVED",
        applications: fields.map((field) => ({ ...field, conflictingFields })),
      };
    });
}

export async function duplicateGroup(groupId: string) {
  const groups = await approvedPlayerDuplicateGroups();
  return groups.find((group) => group.id === groupId) ?? null;
}

export async function duplicateResolutionSummary() {
  const groups = await approvedPlayerDuplicateGroups();
  const counts = groups.reduce<Record<string, number>>((acc, group) => {
    acc[group.currentResolution] = (acc[group.currentResolution] ?? 0) + 1;
    return acc;
  }, {});
  return { totalGroups: groups.length, unresolved: groups.filter((group) => group.currentResolution === "UNRESOLVED").length, counts };
}

export async function saveDuplicateResolution(input: {
  groupId: string;
  action: DuplicateResolutionAction;
  reason: string;
  primaryApplicationId?: string;
  secondaryApplicationIds: string[];
  actorUserId: string;
}) {
  if (!duplicateResolutionActions.includes(input.action)) {
    throw new Error("Invalid duplicate resolution action.");
  }
  if (!input.reason.trim()) {
    throw new Error("Resolution reason is required.");
  }
  const group = await duplicateGroup(input.groupId);
  if (!group) throw new Error("Duplicate group not found.");
  const before = await prisma.systemSetting.findUnique({ where: { key: `${resolutionPrefix}${input.groupId}` } });
  const value = {
    action: input.action,
    reason: input.reason.trim(),
    primaryApplicationId: input.primaryApplicationId || null,
    secondaryApplicationIds: input.secondaryApplicationIds,
    resolvedById: input.actorUserId,
    resolvedAt: new Date().toISOString(),
    before: before?.value ?? null,
    applicationIds: group.applications.map((application) => application.applicationId),
  };
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: `${resolutionPrefix}${input.groupId}` },
      update: { value, description: "Approved player duplicate identity resolution", category: "data-quality" },
      create: { key: `${resolutionPrefix}${input.groupId}`, value, description: "Approved player duplicate identity resolution", category: "data-quality" },
    });
    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        action: "DUPLICATE_IDENTITY_RESOLVED",
        entityType: "DuplicateIdentityGroup",
        entityId: input.groupId,
        details: value,
      },
    });
  });
}

export async function duplicateReviewExports() {
  const groups = await approvedPlayerDuplicateGroups();
  const safeJson = { generatedAt: new Date().toISOString(), groups };
  const csvRows = [
    ["groupId", "applications", "matchReason", "currentResolution", "outstandingAction", "safeMaskedReferences"],
    ...groups.map((group) => [
      group.id,
      group.applications.map((application) => application.applicationId).join(";"),
      group.matchReason,
      group.currentResolution,
      group.currentResolution === "UNRESOLVED" ? "Review and record resolution" : "None",
      group.applications.map((application) => `${application.applicationId}:${application.maskedEmail ?? application.fullName}`).join(";"),
    ]),
  ];
  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\n");
  const markdown = [
    "# Duplicate Resolution Summary",
    "",
    `Generated: ${safeJson.generatedAt}`,
    "",
    `Total groups: ${groups.length}`,
    `Unresolved groups: ${groups.filter((group) => group.currentResolution === "UNRESOLVED").length}`,
    "",
    "| Group | Applications | Resolution | Outstanding action |",
    "| --- | ---: | --- | --- |",
    ...groups.map((group) => `| ${group.id} | ${group.applications.length} | ${group.currentResolution} | ${group.currentResolution === "UNRESOLVED" ? "Review required" : "None"} |`),
  ].join("\n");
  return { csv, safeJson, markdown };
}
