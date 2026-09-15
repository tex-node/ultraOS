"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
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

// In-app team onboarding (product P2): finds-or-creates a Club, its SeasonClub in the chosen
// competition season/division, and the matching TEAM Entrant, so a team can be added to a
// tournament without the public registration form. Roster management continues on the SeasonClub
// roster page.
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

    let club = await tx.club.findFirst({
      where: { organizationId, shortName: input.shortName },
      select: { id: true, name: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true },
    });
    if (!club) {
      club = await tx.club.create({
        data: {
          organizationId,
          sportId: competition.sportId,
          name: input.name,
          shortName: input.shortName,
          primaryColor: input.primaryColor || null,
          secondaryColor: input.secondaryColor || null,
        },
        select: { id: true, name: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true },
      });
    }

    let seasonClub = await tx.seasonClub.findFirst({
      where: { seasonId: season.id, clubId: club.id, divisionId: division.id },
      select: { id: true },
    });
    if (!seasonClub) {
      seasonClub = await tx.seasonClub.create({
        data: { organizationId, seasonId: season.id, clubId: club.id, divisionId: division.id },
        select: { id: true },
      });
    }

    const entrant = await tx.entrant.findFirst({ where: { seasonClubId: seasonClub.id }, select: { id: true } });
    if (!entrant) {
      await tx.entrant.create({
        data: {
          organizationId,
          competitionId: competition.id,
          seasonId: season.id,
          divisionId: division.id,
          seasonClubId: seasonClub.id,
          type: "TEAM",
          name: club.name,
          shortName: club.shortName,
          logoUrl: club.logoUrl,
          primaryColor: club.primaryColor,
          secondaryColor: club.secondaryColor,
        },
      });
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "TEAM_ONBOARDED",
      entityType: "SeasonClub",
      entityId: seasonClub.id,
      details: { competitionId: competition.id, seasonId: season.id, divisionId: division.id, clubId: club.id, replayed: Boolean(entrant) },
    });

    return { ok: true, name: club.name } as TeamFormState;
  });

  revalidatePath(`/competitions/${input.competitionId}`);
  revalidatePath("/clubs");
  return result;
}
