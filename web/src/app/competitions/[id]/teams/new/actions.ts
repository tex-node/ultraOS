"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { ensureSeasonClubEntry } from "@/lib/season-club-entry";
import { withOrganizationContext } from "@/lib/tenant-context";

export type TeamFormState = { error?: string; ok?: boolean; name?: string };

const schema = z.object({
  competitionId: z.string().min(1),
  seasonId: z.string().min(1),
  divisionId: z.string().min(1),
  name: z.string().trim().min(2, "Team name must be at least 2 characters.").max(80),
  shortName: z.string().trim().min(1, "Short name is required.").max(12).transform((value) => value.toUpperCase()),
  primaryColor: z.string().trim().max(20).optional(),
  secondaryColor: z.string().trim().max(20).optional(),
});

// In-app team onboarding: creates/reuses the Club, its SeasonClub in the chosen competition
// season/division, the matching TEAM Entrant and its Standing (one call into ensureSeasonClubEntry,
// so an in-app team is indistinguishable from one added via the club's season form). Roster
// management continues on the SeasonClub roster page.
export async function createTeam(_previous: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const parsed = schema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const input = parsed.data;

  const result = await withOrganizationContext(organizationId, async (tx) => {
    const competition = await tx.competition.findFirst({
      where: { id: input.competitionId, organizationId },
      select: { id: true, sportId: true },
    });
    if (!competition) return { error: "Competition not found." } as TeamFormState;

    const season = await tx.season.findFirst({ where: { id: input.seasonId, competitionId: competition.id }, select: { id: true } });
    const division = await tx.division.findFirst({ where: { id: input.divisionId, competitionId: competition.id }, select: { id: true } });
    if (!season || !division) return { error: "Season or division not found for this competition." } as TeamFormState;

    const entry = await ensureSeasonClubEntry(tx, {
      organizationId,
      competitionId: competition.id,
      seasonId: season.id,
      divisionId: division.id,
      name: input.name,
      shortName: input.shortName,
      sportId: competition.sportId,
      primaryColor: input.primaryColor || null,
      secondaryColor: input.secondaryColor || null,
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "TEAM_ONBOARDED",
      entityType: "SeasonClub",
      entityId: entry.seasonClubId,
      details: {
        competitionId: competition.id,
        seasonId: season.id,
        divisionId: division.id,
        clubId: entry.clubId,
        entrantId: entry.entrantId,
        standingId: entry.standingId,
        created: entry.created,
      },
    });

    return { ok: true, name: input.name.trim() } as TeamFormState;
  });

  revalidatePath(`/competitions/${input.competitionId}/teams`);
  revalidatePath(`/competitions/${input.competitionId}`);
  revalidatePath("/clubs");
  return result;
}

// Removes a team from a division. Withdrawing (rather than deleting) keeps its fixtures, results and
// history intact while taking it out of future schedule generation (which reads ACTIVE only).
export async function withdrawTeam(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const parsed = z
    .object({ competitionId: z.string().min(1), seasonClubId: z.string().min(1) })
    .parse(formDataToRecord(formData));

  await withOrganizationContext(organizationId, async (tx) => {
    const seasonClub = await tx.seasonClub.findFirstOrThrow({
      where: { id: parsed.seasonClubId, organizationId },
      select: { id: true, seasonId: true, divisionId: true, clubId: true },
    });
    await tx.seasonClub.update({ where: { id: seasonClub.id }, data: { status: "WITHDRAWN" } });
    await tx.entrant.updateMany({ where: { seasonClubId: seasonClub.id }, data: { status: "WITHDRAWN" } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "TEAM_WITHDRAWN",
      entityType: "SeasonClub",
      entityId: seasonClub.id,
      details: { seasonId: seasonClub.seasonId, divisionId: seasonClub.divisionId, clubId: seasonClub.clubId },
    });
  });

  revalidatePath(`/competitions/${parsed.competitionId}/teams`);
  revalidatePath(`/competitions/${parsed.competitionId}`);
}
