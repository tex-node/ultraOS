"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SeasonStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { getBasketballPreset } from "@/lib/sports/basketball-formats";
import { upsertSeasonRuleSet } from "@/lib/sports/rule-set-store";
import { requireSportDefinition } from "@/lib/sports/registry";
import { withOrganizationContext } from "@/lib/tenant-context";

export type TournamentFormState = { error?: string };

const tournamentSchema = z.object({
  sportSlug: z.string().trim().min(1, "Choose a sport."),
  competitionName: z.string().trim().min(3, "Tournament name must be at least 3 characters.").max(120),
  seasonName: z.string().trim().min(2, "Season name must be at least 2 characters.").max(120),
  startDate: z.string().min(1, "Choose a start date."),
  endDate: z.string().min(1, "Choose an end date."),
  divisions: z.string().trim().min(1, "Add at least one division."),
  format: z.enum(["ROUND_ROBIN", "KNOCKOUT", "GROUP_STAGE"]).optional(),
  basketballPreset: z.string().optional(),
});

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "competition";
}

// Tournament onboarding (product roadmap P1): creates a competition, its first season, and its
// divisions in one guided step. The sport comes from the code registry, so the picked sport's
// structure/capabilities are known immediately; the Sport catalog row is upserted by slug so a
// sport that was never seeded still becomes selectable.
export async function createTournament(
  _previous: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("competition:manage");

  const parsed = tournamentSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;

  const definition = requireSportDefinition(input.sportSlug);

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Enter valid season dates." };
  }
  if (endDate < startDate) {
    return { error: "Season end date must be on or after the start date." };
  }
  const divisionNames = [...new Set(input.divisions.split(",").map((name) => name.trim()).filter(Boolean))];
  if (divisionNames.length === 0) {
    return { error: "Add at least one division." };
  }

  const competitionId = await withOrganizationContext(organizationId, async (tx) => {
    const sport = await tx.sport.upsert({
      where: { slug: definition.slug },
      update: { name: definition.name, isActive: true },
      create: { name: definition.name, slug: definition.slug },
    });

    const baseSlug = slugify(input.competitionName);
    let slug = baseSlug;
    let attempt = 2;
    while (await tx.competition.findFirst({ where: { organizationId, slug }, select: { id: true } })) {
      slug = `${baseSlug}-${attempt}`;
      attempt += 1;
    }

    const competition = await tx.competition.create({
      data: { organizationId, sportId: sport.id, name: input.competitionName, slug, format: input.format ?? "ROUND_ROBIN" },
    });

    const season = await tx.season.create({
      data: {
        organizationId,
        competitionId: competition.id,
        name: input.seasonName,
        startDate,
        endDate,
        status: SeasonStatus.DRAFT,
      },
    });

    // Basketball picks its playing format up front (Ultra / FIBA 4x10 / NBA 4x12); stored as this
    // season's rule set so the clock, periods and shot clock follow it. Editable later on the
    // competition's Format page.
    const basketballPreset = getBasketballPreset(input.basketballPreset);
    if (basketballPreset && definition.key === "BASKETBALL") {
      await upsertSeasonRuleSet(tx, {
        organizationId,
        seasonId: season.id,
        sportId: sport.id,
        name: `${basketballPreset.label} · ${season.name}`,
        ruleValues: basketballPreset.ruleValues,
      });
    }

    for (const divisionName of divisionNames) {
      const divisionSlug = slugify(divisionName);
      const existing = await tx.division.findFirst({
        where: { competitionId: competition.id, slug: divisionSlug },
        select: { id: true },
      });
      if (existing) continue;
      await tx.division.create({
        data: { organizationId, competitionId: competition.id, name: divisionName, slug: divisionSlug },
      });
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "COMPETITION_CREATED",
      entityType: "Competition",
      entityId: competition.id,
      details: {
        sport: definition.key,
        competition: input.competitionName,
        season: input.seasonName,
        seasonId: season.id,
        divisions: divisionNames,
      },
    });

    return competition.id;
  });

  revalidatePath("/competitions");
  redirect(`/competitions/${competitionId}`);
}
