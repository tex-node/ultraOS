import type { Prisma } from "@/generated/prisma/client";
import { assertWithinPlan } from "@/lib/plans";
import { allocateOrganizationPrefixes } from "@/lib/organization-prefixes";
import { getSportDefinition } from "@/lib/sports/registry";
import { isIndividualSport } from "@/lib/sports/fixture-sides";

// League onboarding in one transaction (streak v15, Prompt 3).
//
// Until now, standing up a league meant scripts: an Organization, a Competition, a Division, a Season, the teams or
// entrants, and the fixture list - each created by hand, in the right order, with the right tenant columns. This is the
// one place that does all of it, so the wizard and any future CLI share exactly one implementation.
//
// Rules it enforces, because getting them wrong is silent:
//   * a team sport gets Clubs + SeasonClubs; an individual sport gets Entrants - never both (the fixture CHECK rejects
//     a mixed side);
//   * at least two participants, or no fixture can exist;
//   * a round robin produces every pairing once (or twice with gamesPerPairing = 2); a knockout pads to a power of two
//     with byes so round one is a real bracket;
//   * every row carries the organization, and the whole thing is one transaction: a half-created league is worse than
//     no league, so a failure anywhere rolls all of it back.
export type LeagueFormat = "ROUND_ROBIN" | "KNOCKOUT";

export type CreateLeagueInput = {
  organizationId?: string | null;
  organizationName: string;
  organizationSlug: string;
  sportSlug: string;
  competitionName: string;
  entrantNames: string[];
  format: LeagueFormat;
  gamesPerPairing: 1 | 2;
  startDate: Date;
  matchDayOffsetDays: number;
};

export type CreateLeagueResult = {
  organizationId: string;
  competitionId: string;
  seasonId: string;
  slug: string;
  participants: number;
  fixtures: number;
  kind: "team" | "individual";
};

/** Every unordered pairing (or both home/away legs), spread over consecutive match days. */
export function roundRobinPairs(count: number, gamesPerPairing: 1 | 2): { home: number; away: number; round: number }[] {
  const pairs: { home: number; away: number; round: number }[] = [];
  let round = 1;
  for (let home = 0; home < count; home += 1) {
    for (let away = home + 1; away < count; away += 1) {
      pairs.push({ home, away, round });
      if (gamesPerPairing === 2) pairs.push({ home: away, away: home, round });
      round += 1;
    }
  }
  return pairs;
}

/** Round one of a knockout, padding to the next power of two; a null side is a bye. */
export function knockoutPairs(count: number): { home: number | null; away: number | null; round: number }[] {
  let size = 2;
  while (size < count) size *= 2;
  const slots: (number | null)[] = Array.from({ length: size }, (_, index) => (index < count ? index : null));
  const pairs: { home: number | null; away: number | null; round: number }[] = [];
  for (let index = 0; index < slots.length; index += 2) {
    pairs.push({ home: slots[index], away: slots[index + 1], round: 1 });
  }
  return pairs;
}

export async function createLeague(
  tx: Prisma.TransactionClient,
  input: CreateLeagueInput,
): Promise<CreateLeagueResult> {
  const definition = getSportDefinition(input.sportSlug);
  if (!definition) throw new Error(`Unknown sport: ${input.sportSlug}`);
  const names = input.entrantNames.map((name) => name.trim()).filter(Boolean);
  if (names.length < 2) throw new Error("A league needs at least two participants.");
  if (input.entrantNames.length > 64) throw new Error("That is a lot of participants for one wizard run (max 64).");

  // Plan enforcement (streak v16, Prompt 3): a FREE organization may run exactly one competition. Checked before
  // anything is created so a refused wizard leaves no rows behind.
  if (input.organizationId) await assertWithinPlan(tx, input.organizationId, "competitions");

  const sport = await tx.sport.findFirst({ where: { slug: definition.slug }, select: { id: true } });
  if (!sport) throw new Error(`The sport ${definition.slug} is not seeded in this database.`);

  // 1. Organization: reuse an existing one, or create it. A slug must be unique, so the caller supplies it.
  let organizationId = input.organizationId ?? null;
  if (!organizationId) {
    const existing = await tx.organization.findFirst({ where: { slug: input.organizationSlug }, select: { id: true } });
    organizationId = existing?.id ?? (await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: input.organizationSlug,
        // Without these, the SECOND organization on a database fails on the global @unique default ("UBA"): the
        // public-id prefix is per-tenant but its uniqueness is platform-wide, so it has to be allocated, not defaulted.
        ...(await allocateOrganizationPrefixes(tx, input.organizationSlug)),
      },
      select: { id: true },
    })).id;
  }
  const slug = `${input.competitionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;

  // 2. Competition + division + season.
  const competition = await tx.competition.create({
    data: { organizationId, sportId: sport.id, name: input.competitionName, slug },
    select: { id: true },
  });
  const division = await tx.division.create({
    data: { organizationId, competitionId: competition.id, name: "League", slug: "league" },
    select: { id: true },
  });
  const season = await tx.season.create({
    data: {
      organizationId,
      competitionId: competition.id,
      name: `${input.competitionName} ${input.startDate.getUTCFullYear()}`,
      startDate: input.startDate,
      endDate: new Date(input.startDate.getTime() + 180 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });

  // 3. Participants: clubs + season clubs for a team sport, entrants for an individual one.
  const individual = isIndividualSport(definition);
  const sides: { seasonClubId: string | null; entrantId: string | null }[] = [];
  if (individual) {
    for (const name of names) {
      const entrant = await tx.entrant.create({
        data: { organizationId, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name },
        select: { id: true },
      });
      sides.push({ seasonClubId: null, entrantId: entrant.id });
    }
  } else {
    for (const name of names) {
      const club = await tx.club.create({
        data: {
          organizationId,
          sportId: sport.id,
          name,
          // shortName is unique per organization, and deriving it from the first four characters makes collisions
          // ordinary ("Admin A" and "Admin B" both became "ADMI", and the whole league failed on the constraint). The
          // base is still that derivation; a suffix is added only when it is already taken.
          shortName: await uniqueShortName(tx, organizationId, name),
        },
        select: { id: true },
      });
      const seasonClub = await tx.seasonClub.create({
        data: { organizationId, seasonId: season.id, clubId: club.id, divisionId: division.id },
        select: { id: true },
      });
      sides.push({ seasonClubId: seasonClub.id, entrantId: null });
    }
  }

  // 4. Fixtures.
  const venue = await tx.venue.findFirst({ where: { organizationId }, select: { id: true } })
    ?? await tx.venue.create({
      // Venue requires address/city/capacity, so a newly onboarded league gets a real placeholder it can edit rather
      // than a null venue (which Fixture refuses).
      data: { organizationId, name: "Main Venue", address: "To be confirmed", city: "To be confirmed", capacity: 0 },
      select: { id: true },
    });
  const pairs = input.format === "KNOCKOUT" ? knockoutPairs(sides.length) : roundRobinPairs(sides.length, input.gamesPerPairing);

  let created = 0;
  for (const [index, pair] of pairs.entries()) {
    // A bye has one side: it is not a fixture, so it is skipped rather than written with a null opponent.
    if (pair.home === null || pair.away === null) continue;
    const home = sides[pair.home];
    const away = sides[pair.away];
    const scheduledAt = new Date(input.startDate.getTime() + (pair.round - 1) * input.matchDayOffsetDays * 24 * 60 * 60 * 1000 + index * 60 * 60 * 1000);
    await tx.fixture.create({
      data: {
        organizationId,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        scheduledAt,
        status: "SCHEDULED",
        round: pair.round,
        ...(home.seasonClubId
          ? { homeSeasonClubId: home.seasonClubId, awaySeasonClubId: away.seasonClubId }
          : { homeEntrantId: home.entrantId, awayEntrantId: away.entrantId }),
      },
    });
    created += 1;
  }

  return {
    organizationId,
    competitionId: competition.id,
    seasonId: season.id,
    slug,
    participants: sides.length,
    fixtures: created,
    kind: individual ? "individual" : "team",
  };
}

/** A 4-character short name that is unique within the organization, with a numeric suffix if the base is taken. */
async function uniqueShortName(tx: Prisma.TransactionClient, organizationId: string, name: string): Promise<string> {
  const base = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "TEAM";
  const taken = new Set(
    (await tx.club.findMany({ where: { organizationId, shortName: { startsWith: base.slice(0, 3) } }, select: { shortName: true } }))
      .map((club) => club.shortName),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 3)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free short name for "${name}".`);
}