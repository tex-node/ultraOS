"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCoachingClub } from "@/server/coaching/guard";
import { applySquadSetup } from "@/server/coaching/squad-setup";
import { withOrganizationContext } from "@/lib/tenant-context";
import type { SquadSetupState } from "../../../_components/squad-setup-form";

// Access is re-checked on every submit (same guard as the pages: flag, session, club access); the
// write itself is applySquadSetup, which only touches this club's roster and audits each change.
export async function saveSquadSetup(seasonClubId: string, _state: SquadSetupState, formData: FormData): Promise<SquadSetupState> {
  const { scope, userId } = await requireCoachingClub(seasonClubId);
  if (!userId) notFound();

  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;

  try {
    const result = await withOrganizationContext(scope.organizationId, (tx) =>
      applySquadSetup(tx, { organizationId: scope.organizationId, seasonClubId, userId, values }),
    );
    if (!result.ok) return { errors: result.errors };
    revalidatePath(`/coaching/${seasonClubId}`, "layout");
    return { saved: result.changed };
  } catch {
    return { error: "The squad could not be saved. Nothing was changed." };
  }
}
