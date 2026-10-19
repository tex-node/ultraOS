import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// P15 I6 (v1): the athlete passport as a READ MODEL. Nothing here writes. It answers one question -
// "what do we know about this player, and where did each number come from?" - by assembling the four
// sources the roadmap names: live/imported box scores, OCR-reviewed history, training logs, and the
// coaching plans that were adopted for them.
//
// Provenance is the point of the feature. Every aggregate carries the set of sources it was built
// from, and every game row carries its own badge, so a reader can tell a live-scored stat line from a
// hand-transcribed import. A number whose provenance cannot be established is reported as UNKNOWN
// rather than guessed.

export type Provenance = "LIVE" | "LIVE_STATISTICIAN" | "OCR_REVIEWED" | "IMPORTED" | "MANUAL" | "UNKNOWN";

export type PassportGameRow = {
  fixtureId: string;
  gameId: string;
  playedAt: Date;
  seasonName: string;
  /** The sport this game belongs to (streak v8, Prompt 3): a passport can span basketball and volleyball. */
  sportSlug: string;
  sportName: string;
  opponentName: string;
  isHome: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  provenance: Provenance;
};

export type PassportSportStats = {
  sportSlug: string;
  sportName: string;
  games: number;
  metrics: { key: string; label: string; value: number; perGame: number }[];
};

export type PassportTotals = {
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
};

export type PassportTrainingRow = {
  sessionId: string;
  title: string;
  occurredAt: Date;
  completedAt: Date | null;
  focus: string | null;
  metrics: { key: string; name: string; unit: string | null; value: number }[];
};

export type PassportPlanRow = {
  id: string;
  status: string;
  adoptedAt: Date;
  focusAreas: { label: string; metricKey: string; metricLabel: string; targetLabel: string }[];
  sessions: number;
};

export type AthletePassport = {
  playerId: string;
  athleteId: string;
  // Whether the organization publishes this athlete's passport to the public site.
  published: boolean;
  name: string;
  jerseyNumber: number | null;
  position: string | null;
  seasons: { seasonName: string; clubName: string; startDate: Date }[];
  games: PassportGameRow[];
  totals: PassportTotals;
  provenance: { source: Provenance; games: number }[];
  training: PassportTrainingRow[];
  /** Definition-driven stats per sport (streak v8, Prompt 3). Empty until metric rows exist. */
  sportStats: PassportSportStats[];
  plans: PassportPlanRow[];
};

// Maps the stored stat-source catalogue onto the four badges a reader can act on. Deliberately
// conservative: anything not recognised is UNKNOWN, never silently labelled LIVE.
function provenanceFor(statSource: string | null, ocrReviewedFixtureIds: Set<string>, fixtureId: string): Provenance {
  if (statSource === "ULTRA_NATIVE_LIVE_SCORER") return "LIVE";
  if (statSource === "ULTRA_NATIVE_LIVE_STATISTICIAN" || statSource === "ULTRA_NATIVE_DERIVED_FROM_VERIFIED_EVENTS") return "LIVE_STATISTICIAN";
  if (ocrReviewedFixtureIds.has(fixtureId)) return "OCR_REVIEWED";
  if (statSource === "FIBA_LIVESTATS_PDF_IMPORT" || statSource === "GENIUS_SPORTS_IMPORT" || statSource === "CSV_IMPORT" || statSource === "EXTERNAL_PROVIDER") return "IMPORTED";
  if (statSource === "MANUAL_ADMIN_ENTRY") return "MANUAL";
  return "UNKNOWN";
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export async function loadAthletePassport(tx: Prisma.TransactionClient, organizationId: string, playerId: string): Promise<AthletePassport | null> {
  const player = await tx.player.findFirst({
    where: { id: playerId, organizationId },
    select: {
      id: true,
      athleteId: true,
      jerseyNumber: true,
      position: true,
      seasonClubId: true,
      season: { select: { name: true, startDate: true } },
      seasonClub: { select: { club: { select: { name: true } } } },
      athlete: { select: { firstName: true, lastName: true, passportPublished: true } },
    },
  });
  if (!player) return null;

  // Every stat line for this player, with the game/fixture/season needed for the timeline.
  const stats = await tx.playerStat.findMany({
    where: { playerId, organizationId },
    orderBy: { game: { fixture: { scheduledAt: "desc" } } },
    select: {
      statSource: true,
      minutesPlayed: true,
      points: true,
      rebounds: true,
      assists: true,
      steals: true,
      blocks: true,
      turnovers: true,
      fouls: true,
      gameId: true,
      game: {
        select: {
          fixtureId: true,
          fixture: {
            select: {
              scheduledAt: true,
              homeSeasonClubId: true,
              awaySeasonClubId: true,
              homeSeasonClub: { select: { club: { select: { name: true } } } },
              awaySeasonClub: { select: { club: { select: { name: true } } } },
              season: { select: { name: true, competition: { select: { sport: { select: { slug: true, name: true } } } } } },
            },
          },
        },
      },
    },
  });

  // A game that came through the OCR pipeline is recognised by a distinct signal: an INGESTED
  // ScoresheetImport pointing at its fixture. That is the only honest way to badge it OCR_REVIEWED -
  // the imported stat row itself looks identical to a hand-transcribed one.
  const fixtureIds = [...new Set(stats.map((stat) => stat.game.fixtureId))];
  const ocrImports = fixtureIds.length
    ? await tx.scoresheetImport.findMany({ where: { organizationId, fixtureId: { in: fixtureIds }, status: "INGESTED" }, select: { fixtureId: true } })
    : [];
  const ocrReviewed = new Set(ocrImports.map((row) => row.fixtureId).filter((id): id is string => Boolean(id)));

  const games: PassportGameRow[] = stats.map((stat) => {
    const fixture = stat.game.fixture;
    return {
      fixtureId: stat.game.fixtureId,
      gameId: stat.gameId,
      playedAt: fixture.scheduledAt,
      seasonName: fixture.season.name,
      sportSlug: fixture.season.competition.sport.slug,
      sportName: fixture.season.competition.sport.name,
      opponentName: "unknown",
      isHome: false,
      minutes: stat.minutesPlayed,
      points: stat.points,
      rebounds: stat.rebounds,
      assists: stat.assists,
      steals: stat.steals,
      blocks: stat.blocks,
      turnovers: stat.turnovers,
      fouls: stat.fouls,
      provenance: provenanceFor(stat.statSource, ocrReviewed, stat.game.fixtureId),
    };
  });

  // Resolve opponent/home per fixture with ONE query rather than per game. The player's own season
  // club decides which side of the fixture he was on - the stat row does not carry a side.
  const fixtures = await tx.fixture.findMany({
    where: { id: { in: fixtureIds }, organizationId },
    select: { id: true, homeSeasonClubId: true, awaySeasonClubId: true, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } } },
  });
  const byFixture = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const game of games) {
    const fixture = byFixture.get(game.fixtureId);
    if (!fixture) continue;
    const isHome = fixture.homeSeasonClubId === player.seasonClubId;
    game.isHome = isHome;
    game.opponentName = (isHome ? fixture.awaySeasonClub?.club.name : fixture.homeSeasonClub?.club.name) ?? "Opponent";
  }

  const totals: PassportTotals = {
    games: games.length,
    minutes: sum(games.map((g) => g.minutes)),
    points: sum(games.map((g) => g.points)),
    rebounds: sum(games.map((g) => g.rebounds)),
    assists: sum(games.map((g) => g.assists)),
    steals: sum(games.map((g) => g.steals)),
    blocks: sum(games.map((g) => g.blocks)),
    turnovers: sum(games.map((g) => g.turnovers)),
    fouls: sum(games.map((g) => g.fouls)),
    pointsPerGame: games.length ? round1(sum(games.map((g) => g.points)) / games.length) : 0,
    reboundsPerGame: games.length ? round1(sum(games.map((g) => g.rebounds)) / games.length) : 0,
    assistsPerGame: games.length ? round1(sum(games.map((g) => g.assists)) / games.length) : 0,
  };

  // Definition-driven stats per sport (streak v8, Prompt 3). PlayerStat rows are basketball-shaped, so a
  // volleyball player's kills/aces/blocks live only in GameMetricValue. Those rows also give the passport
  // games that PlayerStat has no row for (a metric-ingested volleyball match), which is why they are merged
  // into the timeline below instead of being shown as a disconnected panel.
  const metricRows = await tx.gameMetricValue.findMany({
    where: { organizationId, playerId },
    select: {
      value: true,
      gameId: true,
      metricDefinition: { select: { key: true, label: true, sport: { select: { slug: true, name: true } } } },
      game: { select: { fixture: { select: { scheduledAt: true, season: { select: { name: true } }, homeSeasonClubId: true, awaySeasonClubId: true, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } } } } } },
    },
  });
  const sportAggregates = new Map<string, { sportName: string; games: Set<string>; metrics: Map<string, { label: string; value: number }> }>();
  for (const row of metricRows) {
    const sport = row.metricDefinition.sport;
    const aggregate = sportAggregates.get(sport.slug) ?? { sportName: sport.name, games: new Set<string>(), metrics: new Map<string, { label: string; value: number }>() };
    aggregate.games.add(row.gameId);
    const metric = aggregate.metrics.get(row.metricDefinition.key) ?? { label: row.metricDefinition.label, value: 0 };
    metric.value += Number(row.value);
    aggregate.metrics.set(row.metricDefinition.key, metric);
    sportAggregates.set(sport.slug, aggregate);
  }
  const sportStats: PassportSportStats[] = [...sportAggregates.entries()].map(([sportSlug, aggregate]) => ({
    sportSlug,
    sportName: aggregate.sportName,
    games: aggregate.games.size,
    metrics: [...aggregate.metrics.entries()]
      .map(([key, metric]) => ({ key, label: metric.label, value: round1(metric.value), perGame: aggregate.games.size ? round1(metric.value / aggregate.games.size) : 0 }))
      .sort((a, b) => b.value - a.value),
  }));

  // A metric-backed game with no PlayerStat row still belongs on the timeline; it is a game the athlete
  // played, and hiding it would make the passport look like they sat it out.
  const statGameIds = new Set(games.map((game) => game.gameId));
  for (const row of metricRows) {
    if (statGameIds.has(row.gameId)) continue;
    statGameIds.add(row.gameId);
    const fixture = row.game.fixture;
    const isHome = fixture.homeSeasonClubId === player.seasonClubId;
    games.push({
      fixtureId: "",
      gameId: row.gameId,
      playedAt: fixture.scheduledAt,
      seasonName: fixture.season.name,
      sportSlug: row.metricDefinition.sport.slug,
      sportName: row.metricDefinition.sport.name,
      opponentName: (isHome ? fixture.awaySeasonClub?.club.name : fixture.homeSeasonClub?.club.name) ?? "Opponent",
      isHome,
      minutes: 0,
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      provenance: "UNKNOWN",
    });
  }
  games.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const provenanceCounts = new Map<Provenance, number>();
  for (const game of games) provenanceCounts.set(game.provenance, (provenanceCounts.get(game.provenance) ?? 0) + 1);

  // Training history (private surface, filtered by the page, not here).
  const records = await tx.athleteTrainingRecord.findMany({
    where: { organizationId, athleteId: player.athleteId },
    orderBy: { trainingSession: { occurredAt: "desc" } },
    take: 30,
    select: {
      developmentFocus: true,
      trainingSessionId: true,
      trainingSession: { select: { title: true, occurredAt: true, completedAt: true } },
      metrics: { select: { numericValue: true, metricDefinition: { select: { key: true, name: true, unit: true } } } },
    },
  });
  const training: PassportTrainingRow[] = records.map((record) => ({
    sessionId: record.trainingSessionId,
    title: record.trainingSession.title,
    occurredAt: record.trainingSession.occurredAt,
    completedAt: record.trainingSession.completedAt,
    focus: record.developmentFocus,
    metrics: record.metrics
      .filter((metric) => metric.numericValue !== null)
      .map((metric) => ({ key: metric.metricDefinition.key, name: metric.metricDefinition.name, unit: metric.metricDefinition.unit, value: Number(metric.numericValue) })),
  }));

  const plans = await tx.coachingPlan.findMany({
    where: { organizationId, playerId },
    orderBy: { adoptedAt: "desc" },
    select: { id: true, status: true, adoptedAt: true, focusAreas: true, _count: { select: { sessions: true } } },
  });
  const planRows: PassportPlanRow[] = plans.map((plan) => {
    const snapshot = plan.focusAreas as unknown as { focusAreas?: { label: string; metricKey: string; metricLabel: string; target: { label: string } }[] } | null;
    return {
      id: plan.id,
      status: plan.status,
      adoptedAt: plan.adoptedAt,
      focusAreas: (snapshot?.focusAreas ?? []).map((area) => ({ label: area.label, metricKey: area.metricKey, metricLabel: area.metricLabel, targetLabel: area.target.label })),
      sessions: plan._count.sessions,
    };
  });

  return {
    playerId: player.id,
    athleteId: player.athleteId,
    published: player.athlete.passportPublished,
    name: `${player.athlete.firstName} ${player.athlete.lastName}`,
    jerseyNumber: player.jerseyNumber,
    position: player.position,
    seasons: [{ seasonName: player.season.name, clubName: player.seasonClub?.club.name ?? "Unattached", startDate: player.season.startDate }],
    games,
    totals,
    sportStats,
    provenance: [...provenanceCounts.entries()].map(([source, count]) => ({ source, games: count })),
    training,
    plans: planRows,
  };
}
