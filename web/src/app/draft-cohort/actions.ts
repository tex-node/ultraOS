"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import {
  cohortApplicationReviewActions,
  cohortRowResolutionActions,
  saveDraftCohortApplicationReview,
  saveDraftCohortRowResolution,
  type CohortApplicationReviewAction,
  type CohortRowResolutionAction,
} from "@/lib/draft-cohort";

export async function resolveDraftCohortRow(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("application:review");
  const worksheet = String(formData.get("worksheet") ?? "");
  const rowNumber = Number(formData.get("rowNumber") ?? 0);
  const action = String(formData.get("action") ?? "") as CohortRowResolutionAction;
  const reason = String(formData.get("reason") ?? "");
  const applicationId = String(formData.get("applicationId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!worksheet || !Number.isFinite(rowNumber) || rowNumber <= 0) throw new Error("Valid worksheet and row number are required.");
  if (!cohortRowResolutionActions.includes(action)) throw new Error("Invalid resolution action.");
  await saveDraftCohortRowResolution({
    worksheet,
    rowNumber,
    action,
    reason,
    applicationId,
    userId,
    actorUserId: session.user.id,
    organizationId,
  });
  revalidatePath("/draft-cohort");
  redirect(`/draft-cohort?filter=${action === "EXCLUDE_FROM_CURRENT_COHORT" ? "Excluded" : "All"}`);
}

export async function reviewDraftCohortApplication(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("application:review");
  const worksheet = String(formData.get("worksheet") ?? "");
  const rowNumber = Number(formData.get("rowNumber") ?? 0);
  const applicationId = String(formData.get("applicationId") ?? "");
  const action = String(formData.get("applicationReviewAction") ?? "") as CohortApplicationReviewAction;
  const reason = String(formData.get("reason") ?? "");
  if (!worksheet || !Number.isFinite(rowNumber) || rowNumber <= 0 || !applicationId) throw new Error("Worksheet, row number, and application are required.");
  if (!cohortApplicationReviewActions.includes(action)) throw new Error("Invalid application review action.");
  await saveDraftCohortApplicationReview({
    worksheet,
    rowNumber,
    applicationId,
    action,
    reason,
    actorUserId: session.user.id,
    organizationId,
  });
  revalidatePath("/draft-cohort");
  redirect("/draft-cohort?filter=Pending%20Approval");
}
