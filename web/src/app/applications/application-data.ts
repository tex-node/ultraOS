import { ApplicationStatus, ApplicationType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export const exportableApplicationTypes = [
  ApplicationType.PLAYER,
  ApplicationType.COACH,
  ApplicationType.SCOUT,
  ApplicationType.VENDOR,
] as const;

export type ExportableApplicationType = (typeof exportableApplicationTypes)[number];

export const exportableTypeLabels: Record<ExportableApplicationType, string> = {
  PLAYER: "Players",
  COACH: "Coaches",
  SCOUT: "Scouts",
  VENDOR: "Vendors",
};

export const emailStatusOptions = [
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.SUBMITTED,
] as const;

export type EmailStatusFilter = (typeof emailStatusOptions)[number];

export function parseExportableTypes(value: string | null) {
  if (!value || value === "ALL") {
    return [...exportableApplicationTypes];
  }

  const requested = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is ExportableApplicationType =>
      exportableApplicationTypes.includes(item as ExportableApplicationType),
    );

  return requested.length > 0 ? requested : [...exportableApplicationTypes];
}

export function isExportableApplicationType(type: ApplicationType): type is ExportableApplicationType {
  return exportableApplicationTypes.includes(type as ExportableApplicationType);
}

export function parseEmailStatusFilter(value: string | null) {
  if (!value || value === "ALL") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return emailStatusOptions.includes(normalized as EmailStatusFilter)
    ? (normalized as EmailStatusFilter)
    : null;
}

export async function getApplicationData(
  types: ExportableApplicationType[],
  status?: EmailStatusFilter | null,
) {
  return prisma.application.findMany({
    where: {
      type: { in: types },
      ...(status ? { status } : {}),
    },
    include: {
      applicantUser: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
  });
}

function submittedRecord(data: unknown) {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export function submittedText(data: unknown, key: string) {
  const value = submittedRecord(data)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function applicantDisplayName(application: Awaited<ReturnType<typeof getApplicationData>>[number]) {
  return (
    submittedText(application.submittedData, "fullName") ||
    submittedText(application.submittedData, "name") ||
    submittedText(application.submittedData, "contactName") ||
    submittedText(application.submittedData, "businessName") ||
    application.applicantUser?.name ||
    "Applicant"
  );
}

export function applicantEmail(application: Awaited<ReturnType<typeof getApplicationData>>[number]) {
  return (
    submittedText(application.submittedData, "email") ||
    application.applicantUser?.email ||
    ""
  ).toLowerCase();
}

export function applicationRecipients(applications: Awaited<ReturnType<typeof getApplicationData>>) {
  const recipients = new Map<string, { email: string; name: string }>();

  for (const application of applications) {
    const email = applicantEmail(application);
    if (!isValidEmail(email)) {
      continue;
    }
    recipients.set(email, { email, name: applicantDisplayName(application) });
  }

  return [...recipients.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function applicationExportRows(applications: Awaited<ReturnType<typeof getApplicationData>>) {
  const dataKeys = new Set<string>();
  for (const application of applications) {
    for (const key of Object.keys(submittedRecord(application.submittedData))) {
      dataKeys.add(key);
    }
  }

  const submittedKeys = [...dataKeys].sort((a, b) => a.localeCompare(b));
  const baseColumns = [
    "Application ID",
    "Type",
    "Status",
    "Submitted At",
    "Reviewed At",
    "Applicant Name",
    "Applicant Email",
    "Linked User Name",
    "Linked User Email",
    "Reviewer Name",
    "Reviewer Email",
    "Notes",
  ];
  const columns = [...baseColumns, ...submittedKeys.map(formatColumnName)];

  const rows = applications.map((application) => {
    const data = submittedRecord(application.submittedData);
    return [
      application.id,
      application.type,
      application.status,
      application.createdAt.toISOString(),
      application.reviewedAt?.toISOString() ?? "",
      applicantDisplayName(application),
      applicantEmail(application),
      application.applicantUser?.name ?? "",
      application.applicantUser?.email ?? "",
      application.reviewedBy?.name ?? "",
      application.reviewedBy?.email ?? "",
      application.notes ?? "",
      ...submittedKeys.map((key) => exportCellValue(data[key])),
    ];
  });

  return { columns, rows };
}

function formatColumnName(key: string) {
  return key
    .replaceAll(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function exportCellValue(value: unknown) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value;
  if (typeof value === "string") return safeSpreadsheetText(value);
  return safeSpreadsheetText(JSON.stringify(value));
}

export function safeSpreadsheetText(value: string) {
  const trimmedStart = value.trimStart();
  return /^[=+\-@]/.test(trimmedStart) ? `'${value}` : value;
}
