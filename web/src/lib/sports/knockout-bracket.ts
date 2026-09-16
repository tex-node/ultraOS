// Knockout bracket advancement against the database. Called from the game finalize paths inside the
// same transaction, so a finalized result and its next-round fixture land atomically.
//
// The bracket shape comes from generateKnockout (round 1 = S slots, S a power of two, byes recorded
// on the division). Once every fixture in a round is FINAL, the winners - plus any round-1 byes -
// fill the next round.

import type { Prisma } from "@/generated/prisma/client";
import { bracketSize, planNextRound, type BracketMatch, type BracketParticipant } from "./knockout-advance";

export type BracketFixtureRef = {
  id: string;
  divisionId: string;
  seasonId: string;
  round: number | null;
  scheduledAt: Date;
  venueId: string;
};

const ONE_DAY_MS = 86_400_000;

// Creates any next-round fixtures that the just-finished round makes known. Returns the ids of the
// fixtures created (empty when the round is incomplete, the draw is a league, or nothing changed).
export async function advanceKnockoutBracket(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fixture: BracketFixtureRef,
): Promise<string[]> {
  if (fixture.round == null) return []; // not a bracket fixture (round-robin league row)

  const division = await tx.division.findUniqueOrThrow({
    where: { id: fixture.divisionId },
    select: { knockoutByes: true, competition: { select: { format: true } } },
  });
  if (division.competition.format !== "KNOCKOUT") return [];

  const all = await tx.fixture.findMany({
    where: {
      divisionId: fixture.divisionId,
      seasonId: fixture.seasonId, // a division is reused across seasons; brackets are per season
      round: { not: null },
      status: { not: "CANCELLED" },
    },
    select: {
      round: true,
      bracketPosition: true,
      status: true,
      winnerSeasonClubId: true,
      winnerEntrantId: true,
      scheduledAt: true,
    },
  });

  const byes = (division.knockoutByes ?? {}) as Record<string, BracketParticipant>;
  const roundOneCount = all.filter((row) => row.round === 1).length;
  const size = bracketSize(roundOneCount, Object.keys(byes).length);
  if (size == null) return []; // draw data is inconsistent - never guess at a bracket shape

  const matches: BracketMatch[] = [];
  for (const row of all) {
    if (row.round == null || row.bracketPosition == null) continue;
    matches.push({
      round: row.round,
      bracketPosition: row.bracketPosition,
      status: row.status,
      winner:
        row.winnerSeasonClubId || row.winnerEntrantId
          ? { seasonClubId: row.winnerSeasonClubId, entrantId: row.winnerEntrantId }
          : null,
    });
  }

  const plan = planNextRound({ round: fixture.round, size, matches, byes });
  if (plan.status !== "ready") return [];

  const created: string[] = [];
  for (const planned of plan.fixtures) {
    const already = all.some(
      (row) => row.round === planned.round && row.bracketPosition === planned.bracketPosition,
    );
    if (already) continue;

    const latest = all
      .filter((row) => row.round === planned.round - 1)
      .reduce<Date | null>((max, row) => (!max || row.scheduledAt > max ? row.scheduledAt : max), null);
    let scheduledAt = new Date((latest ?? fixture.scheduledAt).getTime() + ONE_DAY_MS);

    // Step forward until the venue and both sides are free at the candidate slot.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const or: Prisma.FixtureWhereInput[] = [{ venueId: fixture.venueId, scheduledAt }];
      for (const side of [planned.home.seasonClubId, planned.away.seasonClubId]) {
        if (side) or.push({ homeSeasonClubId: side, scheduledAt }, { awaySeasonClubId: side, scheduledAt });
      }
      for (const side of [planned.home.entrantId, planned.away.entrantId]) {
        if (side) or.push({ homeEntrantId: side, scheduledAt }, { awayEntrantId: side, scheduledAt });
      }
      const clash = await tx.fixture.findFirst({
        where: { seasonId: fixture.seasonId, status: { not: "CANCELLED" }, OR: or },
        select: { id: true },
      });
      if (!clash) break;
      scheduledAt = new Date(scheduledAt.getTime() + ONE_DAY_MS);
    }

    const next = await tx.fixture.create({
      data: {
        organizationId,
        seasonId: fixture.seasonId,
        divisionId: fixture.divisionId,
        round: planned.round,
        bracketPosition: planned.bracketPosition,
        homeSeasonClubId: planned.home.seasonClubId,
        awaySeasonClubId: planned.away.seasonClubId,
        homeEntrantId: planned.home.entrantId,
        awayEntrantId: planned.away.entrantId,
        scheduledAt,
        venueId: fixture.venueId,
        status: "SCHEDULED",
      },
      select: { id: true },
    });
    created.push(next.id);
  }
  return created;
}
