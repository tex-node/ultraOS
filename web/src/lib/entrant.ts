// Multi-sport Stage 2 (Entrant) domain helpers. Pure functions only; no database access.
// See documentation/architecture/MULTI_SPORT_ARCHITECTURE.md, Section 5.2.

// Mirrors the Prisma EntrantType enum. Declared locally so this module (and its tests) do not
// depend on the generated client.
export type EntrantTypeValue = "TEAM" | "INDIVIDUAL" | "PAIR" | "RELAY";

export const ENTRANT_TYPE_LABELS: Record<EntrantTypeValue, string> = {
  TEAM: "Team",
  INDIVIDUAL: "Individual",
  PAIR: "Pair",
  RELAY: "Relay",
};

export type EntrantCardinality = { min: number; max: number | null };

// How many members each entrant type must hold. max: null means no upper bound.
export function entrantMemberRule(type: EntrantTypeValue): EntrantCardinality {
  switch (type) {
    case "INDIVIDUAL":
      return { min: 1, max: 1 };
    case "PAIR":
      return { min: 2, max: 2 };
    case "RELAY":
      return { min: 2, max: null };
    case "TEAM":
      return { min: 1, max: null };
  }
}

export function isMemberCountValid(type: EntrantTypeValue, count: number): boolean {
  const { min, max } = entrantMemberRule(type);
  return count >= min && (max === null || count <= max);
}

export type TeamEntrantSource = {
  organizationId: string;
  competitionId: string;
  seasonId: string;
  divisionId: string;
  seasonClubId: string;
  club: {
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
  };
};

// Builds the fields for the one TEAM Entrant that represents a SeasonClub. Branding is copied
// from the Club (the permanent brand), so an entrant can render without a join once resolved.
export function buildTeamEntrantFields(source: TeamEntrantSource) {
  return {
    organizationId: source.organizationId,
    competitionId: source.competitionId,
    seasonId: source.seasonId,
    divisionId: source.divisionId,
    seasonClubId: source.seasonClubId,
    type: "TEAM" as const,
    name: source.club.name,
    shortName: source.club.shortName,
    logoUrl: source.club.logoUrl,
    primaryColor: source.club.primaryColor,
    secondaryColor: source.club.secondaryColor,
    status: "ACTIVE" as const,
  };
}

export function entrantLabel(entrant: { name: string; shortName?: string | null }): string {
  const short = entrant.shortName?.trim();
  return short && short.length > 0 ? short : entrant.name;
}
