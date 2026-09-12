"use server";

import { revalidatePath } from "next/cache";
import { addAllStarRosterMember, lockAllStarRoster, unlockAllStarRoster, updateAllStarPlayer, ALL_STAR_TEAM_SLUGS, type AllStarMemberKind, type AllStarTeamSlug } from "@/lib/all-star-teams";
import { requirePermissionWithOrganization } from "@/lib/authorization";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function requireTeamSlug(formData: FormData): AllStarTeamSlug {
  const slug = value(formData, "teamSlug");
  if (!ALL_STAR_TEAM_SLUGS.includes(slug as AllStarTeamSlug)) throw new Error("Select a valid all-star team.");
  return slug as AllStarTeamSlug;
}

export type AllStarRosterFormState = { error?: string };

export async function addAllStarMemberAction(_state: AllStarRosterFormState, formData: FormData): Promise<AllStarRosterFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const teamSlug = requireTeamSlug(formData);
  const selection = value(formData, "selection");
  const [kind, sourceId] = selection.split(":") as [AllStarMemberKind | undefined, string | undefined];
  if ((kind !== "PLAYER" && kind !== "COACH") || !sourceId) return { error: "Select a player or coach to add." };

  try {
    await addAllStarRosterMember(teamSlug, { kind, sourceId }, session.user.id, organizationId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add to roster." };
  }

  revalidatePath("/participants/all-star-roster");
  return {};
}

export async function updateAllStarPlayerAction(teamSlug: AllStarTeamSlug, playerId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const heightCm = value(formData, "heightCm");
  const weightKg = value(formData, "weightKg");
  await updateAllStarPlayer(
    teamSlug,
    playerId,
    {
      fullName: value(formData, "fullName") || undefined,
      phone: value(formData, "phone") || undefined,
      bio: value(formData, "bio"),
      position: value(formData, "position"),
      heightCm: heightCm ? Number(heightCm) : undefined,
      weightKg: weightKg ? Number(weightKg) : undefined,
      stats: value(formData, "stats"),
    },
    session.user.id,
    organizationId,
  );
  revalidatePath("/participants/all-star-roster");
}

export async function lockAllStarRosterAction(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const teamSlug = requireTeamSlug(formData);
  await lockAllStarRoster(teamSlug, session.user.id, organizationId);
  revalidatePath("/participants/all-star-roster");
}

export async function unlockAllStarRosterAction(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const teamSlug = requireTeamSlug(formData);
  await unlockAllStarRoster(teamSlug, session.user.id, value(formData, "reason"), organizationId);
  revalidatePath("/participants/all-star-roster");
}
