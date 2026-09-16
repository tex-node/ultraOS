// Single entry path for putting a team into a season division.
//
// Historically two paths existed and drifted: the competition's "new team" form created Club +
// SeasonClub + Entrant but no Standing, while the club's "add to season" form created SeasonClub +
// Standing but no Entrant. Since the multi-sport work, a fixture side and a standing are entrant
// keyed, so a team missing either half behaves as if it does not exist. This helper always produces
// all four rows and is idempotent, so both callers can use it safely.

import type { Prisma } from "@/generated/prisma/client";

export type SeasonClubEntryInput = {
  organizationId: string;
  competitionId: string;
  seasonId: string;
  divisionId: string;
  // Either point at an existing club, or give a name + short name to find-or-create one.
  clubId?: string;
  name?: string;
  shortName?: string;
  sportId?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type SeasonClubEntryResult = {
  clubId: string;
  seasonClubId: string;
  entrantId: string;
  standingId: string;
  created: { club: boolean; seasonClub: boolean; entrant: boolean; standing: boolean };
};

async function resolveClub(tx: Prisma.TransactionClient, input: SeasonClubEntryInput) {
  if (input.clubId) {
    return {
      club: await tx.club.findFirstOrThrow({
        where: { id: input.clubId, organizationId: input.organizationId },
        select: { id: true, name: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true },
      }),
      created: false,
    };
  }

  const shortName = (input.shortName ?? "").trim();
  const existing = await tx.club.findFirst({
    where: { organizationId: input.organizationId, shortName },
    select: { id: true, name: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true },
  });
  if (existing) return { club: existing, created: false };

  const sportId = input.sportId;
  if (!sportId) throw new Error("sportId is required when creating a club.");

  const club = await tx.club.create({
    data: {
      organizationId: input.organizationId,
      sportId,
      name: (input.name ?? "").trim(),
      shortName,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      secondaryColor: input.secondaryColor ?? null,
    },
    select: { id: true, name: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true },
  });
  return { club, created: true };
}

export async function ensureSeasonClubEntry(
  tx: Prisma.TransactionClient,
  input: SeasonClubEntryInput,
): Promise<SeasonClubEntryResult> {
  const created = { club: false, seasonClub: false, entrant: false, standing: false };

  const resolved = await resolveClub(tx, input);
  const club = resolved.club;
  created.club = resolved.created;

  let seasonClub = await tx.seasonClub.findFirst({
    where: { seasonId: input.seasonId, clubId: club.id, divisionId: input.divisionId },
    select: { id: true, status: true },
  });
  if (!seasonClub) {
    seasonClub = await tx.seasonClub.create({
      data: {
        organizationId: input.organizationId,
        seasonId: input.seasonId,
        clubId: club.id,
        divisionId: input.divisionId,
        status: "ACTIVE",
      },
      select: { id: true, status: true },
    });
    created.seasonClub = true;
  }

  let entrant = await tx.entrant.findFirst({ where: { seasonClubId: seasonClub.id }, select: { id: true } });
  if (!entrant) {
    entrant = await tx.entrant.create({
      data: {
        organizationId: input.organizationId,
        competitionId: input.competitionId,
        seasonId: input.seasonId,
        divisionId: input.divisionId,
        type: "TEAM",
        name: club.name,
        shortName: club.shortName,
        logoUrl: club.logoUrl,
        primaryColor: club.primaryColor,
        secondaryColor: club.secondaryColor,
        seasonClubId: seasonClub.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    created.entrant = true;
  }

  // A standing is unique by entrantId and by seasonClubId; match either so a partially-linked row
  // from an older path is reused rather than duplicated.
  let standing = await tx.standing.findFirst({
    where: {
      seasonId: input.seasonId,
      OR: [{ entrantId: entrant.id }, { seasonClubId: seasonClub.id }],
    },
    select: { id: true },
  });
  if (!standing) {
    standing = await tx.standing.create({
      data: {
        organizationId: input.organizationId,
        seasonId: input.seasonId,
        seasonClubId: seasonClub.id,
        entrantId: entrant.id,
      },
      select: { id: true },
    });
    created.standing = true;
  }

  return { clubId: club.id, seasonClubId: seasonClub.id, entrantId: entrant.id, standingId: standing.id, created };
}
