"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import {
  saveSeasonZeroPlayerResolution,
  seasonZeroPlayerResolutionActions,
  type SeasonZeroPlayerResolutionAction,
} from "@/lib/season-zero-production-reconciliation";

export async function recordSeasonZeroPlayerResolutionAction(applicationId: string, formData: FormData) {
  const session = await requirePermission("data:readiness");
  const action = String(formData.get("action") ?? "") as SeasonZeroPlayerResolutionAction;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!seasonZeroPlayerResolutionActions.includes(action)) throw new Error("Select a valid resolution action.");
  await saveSeasonZeroPlayerResolution({ action, actorUserId: session.user.id, applicationId, reason });
  revalidatePath("/data-quality/season-zero-production");
}
