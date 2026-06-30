import { ApplicationStatus, ApplicationType } from "@/generated/prisma/enums";

type SummaryApplication = {
  type: ApplicationType;
  status: ApplicationStatus;
  submittedData: unknown;
};

export type ApplicationSummary = {
  total: number;
  submitted: number;
  underReview: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  male: number;
  female: number;
  unspecifiedGender: number;
};

export const emptyApplicationSummary = (): ApplicationSummary => ({
  total: 0,
  submitted: 0,
  underReview: 0,
  approved: 0,
  rejected: 0,
  withdrawn: 0,
  male: 0,
  female: 0,
  unspecifiedGender: 0,
});

function genderFromSubmittedData(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const gender = (data as Record<string, unknown>).gender;
  if (typeof gender !== "string") {
    return null;
  }

  const normalized = gender.trim().toLowerCase();
  if (normalized === "male") return "male";
  if (normalized === "female") return "female";
  return null;
}

function addApplicationToSummary(summary: ApplicationSummary, application: SummaryApplication) {
  summary.total += 1;

  if (application.status === ApplicationStatus.SUBMITTED) summary.submitted += 1;
  if (application.status === ApplicationStatus.UNDER_REVIEW) summary.underReview += 1;
  if (application.status === ApplicationStatus.APPROVED) summary.approved += 1;
  if (application.status === ApplicationStatus.REJECTED) summary.rejected += 1;
  if (application.status === ApplicationStatus.WITHDRAWN) summary.withdrawn += 1;

  const gender = genderFromSubmittedData(application.submittedData);
  if (gender === "male") {
    summary.male += 1;
  } else if (gender === "female") {
    summary.female += 1;
  } else {
    summary.unspecifiedGender += 1;
  }
}

export function summarizeApplications(applications: SummaryApplication[]) {
  const summary = emptyApplicationSummary();
  for (const application of applications) {
    addApplicationToSummary(summary, application);
  }
  return summary;
}

export function summarizeApplicationsByType(applications: SummaryApplication[]) {
  const summaries = new Map<ApplicationType, ApplicationSummary>();

  for (const application of applications) {
    const summary = summaries.get(application.type) ?? emptyApplicationSummary();
    addApplicationToSummary(summary, application);
    summaries.set(application.type, summary);
  }

  return summaries;
}
