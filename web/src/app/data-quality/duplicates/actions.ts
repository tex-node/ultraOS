"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { duplicateResolutionActions, saveDuplicateResolution, type DuplicateResolutionAction } from "@/lib/data-quality";

export async function resolveDuplicateGroup(groupId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("data:readiness");
  const action = String(formData.get("action") ?? "") as DuplicateResolutionAction;
  const reason = String(formData.get("reason") ?? "");
  const primaryApplicationId = String(formData.get("primaryApplicationId") ?? "");
  const secondaryApplicationIds = formData.getAll("secondaryApplicationIds").map(String).filter(Boolean);
  if (!duplicateResolutionActions.includes(action)) {
    throw new Error("Invalid duplicate resolution action.");
  }
  await saveDuplicateResolution({
    groupId,
    action,
    reason,
    primaryApplicationId,
    secondaryApplicationIds,
    actorUserId: session.user.id,
    organizationId,
  });
  revalidatePath("/data-quality/duplicates");
  revalidatePath(`/data-quality/duplicates/${groupId}`);
  redirect(`/data-quality/duplicates/${groupId}`);
}
