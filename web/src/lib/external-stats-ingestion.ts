// External stats ingestion (2026-09-22): a reusable pipeline for onboarding a real-world
// tournament/league whose games are scored outside ultraOS (paper/PDF FIBA-style box scores,
// e.g. from Genius Sports) and transcribed in after the fact. Every "ensure*" function is a
// find-or-create keyed on a natural identity within its own scope, so re-running an ingestion
// for a game already loaded is a safe no-op on the shared entities and an idempotent upsert on
// the game's own result (via game-result-import.ts). Nothing here ever falls back to the Stage
// 3a Neon Ultra organizationId default - every create stamps its real organizationId explicitly,
// and every read after organization creation runs inside withOrganizationContext.
//
// This intentionally does NOT do OCR/image parsing. The operator (or an agent reading the sheet)
// transcribes the box score into an IngestBoxScoreInput; this pipeline turns that into real,
// tenant-correct rows - Organization/Competition/Division/Season/Venue/Club/SeasonClub/Player
// creation-or-reuse, then the actual result via game-result-import.ts. That split keeps the
// error-prone part (reading a photographed sheet) a reviewable, human-legible JSON artifact
// rather than a black box.
import { Prisma } from "@/generated/prisma/client";
import type { AthleteGender, CompetitionFormat } from "@/generated/prisma/enums";
import { withOrganizationContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { recalculateStandings } from "@/lib/standings-recalculate";
import { registerVanityTournamentSlug } from "@/lib/vanity-tournament";
import {
  importGameResult,
  type GameResultImportInput,
  type GameResultImportReport,
  type ImportPeriodScore,
  type ImportPlayerLine,
  type ImportTeamAdvanced,
  type ImportTeamTotals,
} from "@/lib/game-result-import";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------
// Organization (outside any tenant context by necessity - see tenant-context.ts's own doc
// comment on why: an Organization must exist before it can BE an org context).
// ---------------------------------------------------------------------------

export type NewOrganizationInput = {
  name: string;
  slug: string;
  idPrefixAthlete: string;
  idPrefixStaff: string;
};

export async function ensureOrganizationForIngestion(
  input: { mode: "new"; organization: NewOrganizationInput } | { mode: "existing"; organizationId: string },
) {
  if (input.mode === "existing") {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
    if (org.status !== "ACTIVE") throw new Error(`Organization ${org.id} is not ACTIVE.`);
    return { organization: org, created: false as const };
  }
  const existing = await prisma.organization.findUnique({ where: { slug: input.organization.slug } });
  if (existing) return { organization: existing, created: false as const };
  const organization = await prisma.organization.create({ data: input.organization });
  return { organization, created: true as const };
}

// ---------------------------------------------------------------------------
// Everything below runs inside a real, resolved organization's own context.
// ---------------------------------------------------------------------------

export async function ensureCompetition(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { sportSlug: string; name: string; slug: string; format?: CompetitionFormat },
) {
  const existing = await tx.competition.findFirst({ where: { organizationId, slug: input.slug } });
  if (existing) return existing;
  const sport = await tx.sport.findUniqueOrThrow({ where: { slug: input.sportSlug } });
  return tx.competition.create({
    data: {
      organizationId,
      sportId: sport.id,
      name: input.name,
      slug: input.slug,
      format: input.format ?? "ROUND_ROBIN",
    },
  });
}

export async function ensureDivision(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { competitionId: string; name: string; slug: string },
) {
  const existing = await tx.division.findFirst({ where: { organizationId, competitionId: input.competitionId, slug: input.slug } });
  if (existing) return existing;
  return tx.division.create({ data: { organizationId, competitionId: input.competitionId, name: input.name, slug: input.slug, isActive: true } });
}

export async function ensureSeason(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { competitionId: string; name: string; startDate: Date; endDate: Date },
) {
  const existing = await tx.season.findFirst({ where: { organizationId, competitionId: input.competitionId, name: input.name } });
  if (existing) return existing;
  return tx.season.create({
    data: { organizationId, competitionId: input.competitionId, name: input.name, startDate: input.startDate, endDate: input.endDate, status: "ACTIVE" },
  });
}

export async function ensureVenue(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { name: string; address: string; city: string; capacity: number },
) {
  const existing = await tx.venue.findFirst({ where: { organizationId, name: input.name, city: input.city } });
  if (existing) return existing;
  return tx.venue.create({ data: { organizationId, ...input } });
}

export async function ensureClub(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { sportSlug: string; name: string; shortName: string },
) {
  const existing = await tx.club.findFirst({ where: { organizationId, name: input.name } });
  if (existing) return existing;
  const sport = await tx.sport.findUniqueOrThrow({ where: { slug: input.sportSlug } });
  return tx.club.create({
    data: {
      organizationId,
      sportId: sport.id,
      name: input.name,
      shortName: input.shortName,
      status: "ACTIVE",
      brandingStatus: "BRANDING_INCOMPLETE",
      recordOrigin: "IMPORT",
    },
  });
}

export async function ensureSeasonClub(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { seasonId: string; clubId: string; divisionId: string },
) {
  const existing = await tx.seasonClub.findFirst({ where: { organizationId, seasonId: input.seasonId, clubId: input.clubId } });
  if (existing) return existing;
  return tx.seasonClub.create({ data: { organizationId, seasonId: input.seasonId, clubId: input.clubId, divisionId: input.divisionId, status: "ACTIVE" } });
}

// Athlete/Player biographical fields (DOB, hand, height, weight, position) are NOT NULL in the
// schema but a FIBA box score never reports them - these placeholders are clearly-fake sentinels
// (a round placeholder date, 0 for numeric fields), never a plausible-looking invented real
// value, so downstream code and a human reviewer can both tell at a glance that they are
// unknown, not measured. Only the box score's own reported stat lines are ever treated as real
// data. `gender` is a required enum with no "unknown" option; it is inferred from the roster
// (documented per-ingestion, not silently assumed) rather than left to a schema default.
const UNKNOWN_DOB = new Date("2000-01-01T00:00:00.000Z");

export async function ensurePlayer(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { seasonId: string; seasonClubId: string; fullName: string; jerseyNumber: number | null; gender: AthleteGender },
) {
  const roster = await tx.player.findMany({
    where: { organizationId, seasonClubId: input.seasonClubId },
    select: { id: true, jerseyNumber: true, athlete: { select: { id: true, firstName: true, lastName: true } } },
  });
  const key = normalizeName(input.fullName);
  const match = roster.find((p) => normalizeName(`${p.athlete.firstName}${p.athlete.lastName}`) === key);
  if (match) return { playerId: match.id, created: false as const };

  const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;
  const athlete = await tx.athlete.create({
    data: {
      organizationId,
      firstName,
      lastName,
      gender: input.gender,
      dateOfBirth: UNKNOWN_DOB,
      dominantHand: "UNKNOWN",
      recordOrigin: "IMPORT",
    },
  });
  const player = await tx.player.create({
    data: {
      organizationId,
      athleteId: athlete.id,
      seasonId: input.seasonId,
      seasonClubId: input.seasonClubId,
      position: "Unknown",
      heightCm: 0,
      weightKg: 0,
      jerseyNumber: input.jerseyNumber,
      status: "REGISTERED",
      draftSelectionGroup: "NOT_SELECTED",
    },
  });
  return { playerId: player.id, created: true as const };
}

export async function ensureFixture(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { seasonId: string; divisionId: string; homeSeasonClubId: string; awaySeasonClubId: string; scheduledAt: Date; venueId: string },
) {
  const existing = await tx.fixture.findFirst({
    where: {
      organizationId,
      seasonId: input.seasonId,
      homeSeasonClubId: input.homeSeasonClubId,
      awaySeasonClubId: input.awaySeasonClubId,
      scheduledAt: input.scheduledAt,
    },
  });
  if (existing) return { fixtureId: existing.id, created: false as const };
  const fixture = await tx.fixture.create({
    data: {
      organizationId,
      seasonId: input.seasonId,
      divisionId: input.divisionId,
      homeSeasonClubId: input.homeSeasonClubId,
      awaySeasonClubId: input.awaySeasonClubId,
      scheduledAt: input.scheduledAt,
      venueId: input.venueId,
      status: "SCHEDULED",
      recordOrigin: "IMPORT",
    },
  });
  return { fixtureId: fixture.id, created: true as const };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator: one full box-score game, from raw transcription to a real,
// tenant-correct FINAL Fixture/Game/PlayerStat/TeamStat set.
// ---------------------------------------------------------------------------

export type IngestTeamPlayerLine = ImportPlayerLine & { fullName: string };
export type IngestTeamLine = {
  clubName: string;
  clubShortName: string;
  players: IngestTeamPlayerLine[];
  totals: ImportTeamTotals;
  advanced: ImportTeamAdvanced;
};

export type IngestBoxScoreInput = {
  tournament: { name: string; slug: string; sportSlug: string; vanitySlug?: string };
  division: { name: string; slug: string };
  season: { name: string; startDate: string; endDate: string };
  venue: { name: string; address: string; city: string; capacity: number };
  scheduledAt: string;
  home: IngestTeamLine;
  away: IngestTeamLine;
  homeScore: number;
  awayScore: number;
  periods: ImportPeriodScore[];
  sourceLabel: string;
  playerGender: AthleteGender;
};

export type IngestBoxScoreReport = {
  organizationId: string;
  competitionId: string;
  fixtureId: string;
  fixtureCreated: boolean;
  homeClubCreated: boolean;
  awayClubCreated: boolean;
  playersCreated: number;
  import: GameResultImportReport;
};

export async function ingestBoxScoreGame(
  orgResolution: { mode: "new"; organization: NewOrganizationInput } | { mode: "existing"; organizationId: string },
  input: IngestBoxScoreInput,
  actorId: string,
  options: { dryRun: boolean },
): Promise<IngestBoxScoreReport | { dryRun: true; wouldCreateOrganization: boolean }> {
  const { organization } = await ensureOrganizationForIngestion(orgResolution);

  if (options.dryRun) {
    // Dry run intentionally still resolves/creates the organization row itself (cheap, and
    // needed to open a context at all) but performs no further writes - matching this
    // codebase's established dry-run-by-default convention (see public-locators-backfill.ts).
    return { dryRun: true, wouldCreateOrganization: orgResolution.mode === "new" };
  }

  return withOrganizationContext(organization.id, async (tx) => {
    const competition = await ensureCompetition(tx, organization.id, input.tournament);
    if (input.tournament.vanitySlug) {
      await registerVanityTournamentSlug(tx, { organizationId: organization.id, competitionId: competition.id, vanitySlug: input.tournament.vanitySlug });
    }
    const division = await ensureDivision(tx, organization.id, { competitionId: competition.id, ...input.division });
    const season = await ensureSeason(tx, organization.id, {
      competitionId: competition.id,
      name: input.season.name,
      startDate: new Date(input.season.startDate),
      endDate: new Date(input.season.endDate),
    });
    const venue = await ensureVenue(tx, organization.id, input.venue);

    const homeClubBefore = await tx.club.findFirst({ where: { organizationId: organization.id, name: input.home.clubName } });
    const homeClub = await ensureClub(tx, organization.id, { sportSlug: input.tournament.sportSlug, name: input.home.clubName, shortName: input.home.clubShortName });
    const awayClubBefore = await tx.club.findFirst({ where: { organizationId: organization.id, name: input.away.clubName } });
    const awayClub = await ensureClub(tx, organization.id, { sportSlug: input.tournament.sportSlug, name: input.away.clubName, shortName: input.away.clubShortName });

    const homeSeasonClub = await ensureSeasonClub(tx, organization.id, { seasonId: season.id, clubId: homeClub.id, divisionId: division.id });
    const awaySeasonClub = await ensureSeasonClub(tx, organization.id, { seasonId: season.id, clubId: awayClub.id, divisionId: division.id });

    let playersCreated = 0;
    async function resolveTeam(line: IngestTeamLine, seasonClubId: string): Promise<ImportPlayerLine[]> {
      const resolved: ImportPlayerLine[] = [];
      for (const p of line.players) {
        const { created, ...rest } = await ensurePlayer(tx, organization.id, {
          seasonId: season.id,
          seasonClubId,
          fullName: p.fullName,
          jerseyNumber: p.jerseyNumber,
          gender: input.playerGender,
        });
        void rest;
        if (created) playersCreated += 1;
        resolved.push(p);
      }
      return resolved;
    }
    await resolveTeam(input.home, homeSeasonClub.id);
    await resolveTeam(input.away, awaySeasonClub.id);

    const { fixtureId, created: fixtureCreated } = await ensureFixture(tx, organization.id, {
      seasonId: season.id,
      divisionId: division.id,
      homeSeasonClubId: homeSeasonClub.id,
      awaySeasonClubId: awaySeasonClub.id,
      scheduledAt: new Date(input.scheduledAt),
      venueId: venue.id,
    });

    const importInput: GameResultImportInput = {
      fixtureId,
      homeShortName: homeClub.shortName,
      awayShortName: awayClub.shortName,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      periods: input.periods,
      home: { seasonClubShortName: homeClub.shortName, players: input.home.players, totals: input.home.totals, advanced: input.home.advanced },
      away: { seasonClubShortName: awayClub.shortName, players: input.away.players, totals: input.away.totals, advanced: input.away.advanced },
      sourceLabel: input.sourceLabel,
      statSource: "GENIUS_SPORTS_IMPORT",
    };
    const report = await importGameResult(organization.id, importInput, actorId, tx);
    if (report.status === "IMPORTED") {
      await recalculateStandings(tx, organization.id, season.id);
    }

    return {
      organizationId: organization.id,
      competitionId: competition.id,
      fixtureId,
      fixtureCreated,
      homeClubCreated: !homeClubBefore,
      awayClubCreated: !awayClubBefore,
      playersCreated,
      import: report,
    };
  });
}
