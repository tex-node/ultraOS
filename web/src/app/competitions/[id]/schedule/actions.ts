"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { generateRoundRobin } from "@/lib/sports/fixtures";
import { withOrganizationContext } from "@/lib/tenant-context";

export type ScheduleFormState = { error?: string; created?: number; conflicts?: number; detail?: string };

const schema = z.object({
  seasonId: z.string().min(1, "Choose a season."),
  divisionId: z.string().min(1, "Choose a division."),
  venueId: z.string().min(1, "Choose a venue."),
  startDate: z.string().min(1, "Choose a start date."),
  intervalDays: z.coerce.number().int().min(0).max(30),
  doubleRound: z.string().optional(),
});

// Generates a single round-robin schedule for a season division from its active SeasonClubs.
// Detects venue-slot and team double-booking clashes against existing fixtures and skips those
// slots rather than overwriting. Nothing is recalculated silently - the caller gets the counts.
export async function generateSchedule(
  _previous: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("fixture:manage");
  const parsed = schema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const input = parsed.data;
  const doubleRound = input.doubleRound === "on" || input.doubleRound === "true";

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return { error: "Invalid start date." };

  const result = await withOrganizationContext(organizationId, async (tx) => {
    const season = await tx.season.findFirst({
      where: { id: input.seasonId, organizationId, competition: { divisions: { some: { id: input.divisionId } } } },
      select: { id: true },
    });
    if (!season) return { error: "Season or division not found." } as ScheduleFormState;
    const venue = await tx.venue.findFirst({ where: { id: input.venueId, organizationId }, select: { id: true } });
    if (!venue) return { error: "Venue not found." } as ScheduleFormState;

    const seasonClubs = await tx.seasonClub.findMany({
      where: { seasonId: season.id, divisionId: input.divisionId, status: "ACTIVE" },
      select: { id: true, entrant: { select: { id: true } }, club: { select: { shortName: true } } },
    });
    if (seasonClubs.length < 2) return { error: "At least two active teams are required in this division." } as ScheduleFormState;

    const entrantBySeasonClub = new Map(seasonClubs.map((seasonClub) => [seasonClub.id, seasonClub.entrant?.id ?? null]));
    const teamIds = seasonClubs.map((seasonClub) => seasonClub.id);
    const pairs = generateRoundRobin(teamIds, { doubleRound });

    // Existing fixtures for the season, for clash detection.
    const existing = await tx.fixture.findMany({
      where: { seasonId: season.id, status: { not: "CANCELLED" } },
      select: { venueId: true, scheduledAt: true, homeSeasonClubId: true, awaySeasonClubId: true },
    });
    const venueSlots = new Set(existing.map((fixture) => `${fixture.venueId}|${fixture.scheduledAt.toISOString()}`));
    const teamSlots = new Set<string>();
    for (const fixture of existing) {
      const iso = fixture.scheduledAt.toISOString();
      teamSlots.add(`${fixture.homeSeasonClubId}|${iso}`);
      teamSlots.add(`${fixture.awaySeasonClubId}|${iso}`);
    }

    let created = 0;
    let conflicts = 0;
    for (const pair of pairs) {
      const scheduledAt = new Date(start.getTime() + (pair.round - 1) * input.intervalDays * 86_400_000);
      const iso = scheduledAt.toISOString();
      const venueKey = `${venue.id}|${iso}`;
      const homeKey = `${pair.homeEntrantId}|${iso}`;
      const awayKey = `${pair.awayEntrantId}|${iso}`;
      if (venueSlots.has(venueKey) || teamSlots.has(homeKey) || teamSlots.has(awayKey)) {
        conflicts += 1;
        continue;
      }
      await tx.fixture.create({
        data: {
          organizationId,
          seasonId: season.id,
          divisionId: input.divisionId,
          homeSeasonClubId: pair.homeEntrantId,
          awaySeasonClubId: pair.awayEntrantId,
          homeEntrantId: entrantBySeasonClub.get(pair.homeEntrantId) ?? null,
          awayEntrantId: entrantBySeasonClub.get(pair.awayEntrantId) ?? null,
          scheduledAt,
          venueId: venue.id,
          status: "SCHEDULED",
        },
      });
      venueSlots.add(venueKey);
      teamSlots.add(homeKey);
      teamSlots.add(awayKey);
      created += 1;
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SCHEDULE_GENERATED",
      entityType: "Season",
      entityId: season.id,
      details: { divisionId: input.divisionId, venueId: venue.id, doubleRound, created, conflicts, teams: seasonClubs.length },
    });

    return { created, conflicts } as ScheduleFormState;
  });

  revalidatePath(`/competitions/${(formData.get("competitionId") as string) ?? ""}`);
  revalidatePath("/fixtures");
  return result;
}
