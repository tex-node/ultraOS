"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildPlayerDevelopmentPlan } from "@/lib/coaching/player-development";
import { isAdoptablePlan } from "@/lib/coaching/plan-snapshot";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { adoptCoachingPlan } from "@/server/coaching/plans";

// Adopting the current plan for one player.
//
// The plan itself is NEVER accepted from the form: the client could otherwise submit any focus
// areas it liked and have them recorded as the engine's recommendation. The action rebuilds the
// plan from the same server-side data the page rendered, then freezes THAT snapshot. The only thing
// the form contributes is an optional note.
export type AdoptPlanState = { adopted?: boolean; superseded?: boolean; error?: string; fieldError?: string };

export async function adoptDevelopmentPlan(seasonClubId: string, playerId: string, _state: AdoptPlanState, formData: FormData): Promise<AdoptPlanState> {
  // Same guard as the page: flag, session, club access. Re-checked on every submit, never trusted
  // from the rendered page.
  const { scope, userId } = await requireCoachingClub(seasonClubId);
  if (!userId) notFound();

  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > 500) return { fieldError: "Keep the note under 500 characters." };

  try {
    const data = await loadClubCoachingData(scope);
    // Only players of this club: a player id from another club must not resolve here, exactly as
    // the page itself enforces.
    if (!data.roster.some((p) => p.playerId === playerId)) notFound();
    const plan = buildPlayerDevelopmentPlan(playerId, data.games, data.meta);
    if (!isAdoptablePlan(plan)) {
      return { error: "This player's plan has no focus areas yet - it needs more games or attempts before it can be adopted." };
    }

    const result = await withOrganizationContext(scope.organizationId, (tx) =>
      adoptCoachingPlan(tx, { organizationId: scope.organizationId, userId, seasonClubId, playerId, plan, note }),
    );
    if (!result.ok) {
      return {
        error:
          result.error === "PLAYER_NOT_ON_ROSTER"
            ? "That player is not on this club's roster. Nothing was changed."
            : "This plan cannot be adopted - it has no focus areas. Nothing was changed.",
      };
    }

    revalidatePath(`/coaching/${seasonClubId}/players/${playerId}`);
    revalidatePath(`/coaching/${seasonClubId}`, "layout");
    return { adopted: true, superseded: result.supersededPlanId != null };
  } catch {
    return { error: "The plan could not be adopted. Nothing was changed." };
  }
}
