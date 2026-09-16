"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { generateFixtures, generateKnockout, type GeneratedFixture } from "@/lib/sports/fixtures";
import { sideSeasonClubId } from "@/lib/sports/fixture-sides";
import { resolveFormat } from "@/lib/sports/format";
import { allocateSlot, parseGameDays, playDatesForRound } from "@/lib/sports/schedule-slots";
import { withOrganizationContext } from "@/lib/tenant-context";

export type ScheduleFormState = { error?: string; created?: number; conflicts?: number; detail?: string };

const schema = z.object({
  seasonId: z.string().min(1, "Choose a season."),
  divisionId: z.string().min(1, "Choose a division."),
  venueId: z.string().min(1, "Choose a venue."),
  startDate: z.string().min(1, "Choose a start date."),
  intervalDays: z.coerce.number().int().min(0).max(30),
  slotHours: z.coerce.number().int().min(1).max(12).optional(),
  eventId: z.string().optional(),
  doubleRound: z.string().optional(),
});

// Generates a schedule for a season division from its active SeasonClubs. Formats: round-robin league,
// single-elimination knockout (with byes) or group stage. Within a round, matches take consecutive
// time slots at the chosen venue, so a venue can host several matches on the same day. Fixtures that
// cannot be placed after stepping through the search window are counted as conflicts, never silently
// overwritten. Nothing is recalculated silently - the caller gets the counts.
export async function generateSchedule(
  _previous: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("fixture:manage");
  const parsed = schema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const input = parsed.data;
  const doubleRound = input.doubleRound === "on" || input.doubleRound === "true";
  const slotHours = input.slotHours ?? 2;
  const slotMs = slotHours * 3_600_000;
  // Multi-value checkbox: read directly rather than through the single-value record from the schema.
  const gameDays = parseGameDays(formData.getAll("gameDays").map(String));
  const spreadGameDays = formData.get("spreadGameDays") === "on" || formData.get("spreadGameDays") === "true";

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return { error: "Invalid start date." };

  const result = await withOrganizationContext(organizationId, async (tx) => {
    const season = await tx.season.findFirst({
      where: { id: input.seasonId, organizationId, competition: { divisions: { some: { id: input.divisionId } } } },
      select: { id: true, competition: { select: { format: true, groupCount: true } } },
    });
    if (!season) return { error: "Season or division not found." } as ScheduleFormState;
    const venue = await tx.venue.findFirst({ where: { id: input.venueId, organizationId }, select: { id: true } });
    if (!venue) return { error: "Venue not found." } as ScheduleFormState;

    // Optional: attach the generated fixtures to an event (a match day). This is what lets
    // event-scoped game staff operate these games - see lib/event-staff.ts.
    const eventId = input.eventId?.trim() ? input.eventId.trim() : null;
    if (eventId) {
      const event = await tx.event.findFirst({ where: { id: eventId, seasonId: season.id }, select: { id: true } });
      if (!event) return { error: "Event not found in the selected season." } as ScheduleFormState;
    }

    const seasonClubs = await tx.seasonClub.findMany({
      where: { seasonId: season.id, divisionId: input.divisionId, status: "ACTIVE" },
      select: { id: true, entrant: { select: { id: true } }, club: { select: { shortName: true } } },
    });
    if (seasonClubs.length < 2) return { error: "At least two active teams are required in this division." } as ScheduleFormState;

    const entrantBySeasonClub = new Map(seasonClubs.map((seasonClub) => [seasonClub.id, seasonClub.entrant?.id ?? null]));
    const teamIds = seasonClubs.map((seasonClub) => seasonClub.id);

    // The division may override the competition's format/group count; resolve through one helper so
    // the schedule always matches what the bracket/knockout code will later assume.
    const division = await tx.division.findFirstOrThrow({
      where: { id: input.divisionId },
      select: { format: true, groupCount: true },
    });
    const { format, groupCount } = resolveFormat({
      divisionFormat: division.format,
      competitionFormat: season.competition.format,
      divisionGroupCount: division.groupCount,
      competitionGroupCount: season.competition.groupCount,
    });

    // Knockout draws carry byes - round-1 positions with no fixture whose entrant auto-advances.
    // They are persisted on the division so the bracket can be advanced as results arrive.
    let pairs: GeneratedFixture[];
    let knockoutByes: Record<string, { seasonClubId: string | null; entrantId: string | null }> | null = null;
    if (format === "KNOCKOUT") {
      const draw = generateKnockout(teamIds);
      pairs = draw.firstRound;
      knockoutByes = Object.fromEntries(
        draw.byePositions.map((bye) => [
          String(bye.position),
          { seasonClubId: bye.entrantId, entrantId: entrantBySeasonClub.get(bye.entrantId) ?? null },
        ]),
      );
    } else {
      pairs = generateFixtures(format, teamIds, { doubleRound, groupCount });
    }

    // Existing fixtures for the season, for clash detection.
    const existing = await tx.fixture.findMany({
      where: { seasonId: season.id, status: { not: "CANCELLED" } },
      select: { venueId: true, scheduledAt: true, homeSeasonClubId: true, awaySeasonClubId: true, homeEntrantId: true, awayEntrantId: true },
    });
    const venueSlots = new Set(existing.map((fixture) => `${fixture.venueId}|${fixture.scheduledAt.toISOString()}`));
    const teamSlots = new Set<string>();
    for (const fixture of existing) {
      const iso = fixture.scheduledAt.toISOString();
      // A side is a SeasonClub (team sports) or an Entrant (individual sports) - only team sides
      // can clash with the SeasonClub-based generator.
      for (const side of ["HOME", "AWAY"] as const) {
        const seasonClubId = sideSeasonClubId(fixture, side);
        if (seasonClubId) teamSlots.add(`${seasonClubId}|${iso}`);
      }
    }

    let created = 0;
    let conflicts = 0;
    // Matches within a round are counted so that, when spreading across game days, they alternate
    // between the allowed days (e.g. Saturday, Sunday, Saturday...).
    const roundCounters = new Map<number, number>();
    for (const pair of pairs) {
      const roundNominal = new Date(start.getTime() + (pair.round - 1) * input.intervalDays * 86_400_000);
      // With game days selected a round only lands on those weekdays (weekends-only leagues, etc.);
      // otherwise the round keeps its nominal day.
      const playDates = playDatesForRound({ nominal: roundNominal, gameDays, windowDays: Math.max(1, input.intervalDays) });
      const indexInRound = roundCounters.get(pair.round) ?? 0;
      roundCounters.set(pair.round, indexInRound + 1);

      const isTaken = (candidate: Date) => {
        const candidateIso = candidate.toISOString();
        return (
          venueSlots.has(`${venue.id}|${candidateIso}`) ||
          teamSlots.has(`${pair.homeEntrantId}|${candidateIso}`) ||
          teamSlots.has(`${pair.awayEntrantId}|${candidateIso}`)
        );
      };

      // Each match starts on its preferred day and falls through the rest of the round's play dates
      // if that day is full.
      const preferred = spreadGameDays ? indexInRound % playDates.length : 0;
      let allocation = { scheduledAt: roundNominal, conflict: true };
      for (let attempt = 0; attempt < playDates.length; attempt += 1) {
        const day = playDates[(preferred + attempt) % playDates.length];
        const candidate = allocateSlot({ base: day, stepMs: slotMs, isTaken });
        if (!candidate.conflict) {
          allocation = candidate;
          break;
        }
      }
      if (allocation.conflict) {
        conflicts += 1;
        continue;
      }
      const scheduledAt = allocation.scheduledAt;
      const iso = scheduledAt.toISOString();
      await tx.fixture.create({
        data: {
          organizationId,
          seasonId: season.id,
          divisionId: input.divisionId,
          eventId,
          homeSeasonClubId: pair.homeEntrantId,
          awaySeasonClubId: pair.awayEntrantId,
          homeEntrantId: entrantBySeasonClub.get(pair.homeEntrantId) ?? null,
          awayEntrantId: entrantBySeasonClub.get(pair.awayEntrantId) ?? null,
          scheduledAt,
          venueId: venue.id,
          status: "SCHEDULED",
          round: pair.round,
          bracketPosition: pair.bracketPosition ?? null,
          groupLabel: pair.group ?? null,
        },
      });
      venueSlots.add(`${venue.id}|${iso}`);
      teamSlots.add(`${pair.homeEntrantId}|${iso}`);
      teamSlots.add(`${pair.awayEntrantId}|${iso}`);
      created += 1;
    }

    if (knockoutByes) {
      await tx.division.update({ where: { id: input.divisionId }, data: { knockoutByes } });
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SCHEDULE_GENERATED",
      entityType: "Season",
      entityId: season.id,
      details: { divisionId: input.divisionId, venueId: venue.id, format, doubleRound, slotHours, gameDays, spreadGameDays, created, conflicts, teams: seasonClubs.length, byes: knockoutByes ? Object.keys(knockoutByes).length : 0 },
    });

    return { created, conflicts } as ScheduleFormState;
  });

  revalidatePath(`/competitions/${(formData.get("competitionId") as string) ?? ""}`);
  revalidatePath("/fixtures");
  return result;
}

