import { computeLeagueTeamDna, TEAM_DNA_TAG_LABEL, type TeamDnaTag } from "./team-dna";
import { percent, round1 } from "./normalization";
import type { GameCore } from "./types";

// Coaching scouting reports for every OTHER team in a season, built from the exact same
// GameCore/PlayerLine data every other analytics view uses - no separate data source, no
// fabricated commentary. Every threat/weakness note traces back to an explicit numeric
// threshold (same discipline as team-dna.ts): a team either cleared the bar or it didn't.

export type OpponentTopScorer = {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  gamesPlayed: number;
  ppg: number;
  fgPct: number | null;
  threePct: number | null;
  ftPct: number | null;
  threeRate: number | null;
};

export type OpponentNote = { label: string; detail: string };

export type HeadToHead = {
  gamesPlayed: number;
  focusWins: number;
  focusLosses: number;
  results: { scheduledAt: Date; focusScore: number; opponentScore: number }[];
};

export type OpponentScoutingReport = {
  seasonClubId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsForPerGame: number;
  pointsAgainstPerGame: number;
  turnoversPerGame: number;
  reboundsPerGame: number;
  fgPct: number | null;
  threePct: number | null;
  ftPct: number | null;
  dnaTags: TeamDnaTag[];
  topScorers: OpponentTopScorer[];
  threats: OpponentNote[];
  weaknesses: OpponentNote[];
  headToHead: HeadToHead;
  gamePlan: string;
};

type TeamAgg = {
  seasonClubId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  opponentPoints: number;
  turnovers: number;
  rebounds: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

type PlayerAgg = {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  gamesPlayed: number;
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

// Numeric thresholds a coach would actually plan around - explicit and tuned to this league's
// scale (grassroots ~200-min games), not borrowed from a pro-basketball reference.
const THREE_RATE_HIGH = 30; // % of FGA that are three-point attempts
const THREE_PCT_STRONG = 32; // makes the volume a real outside threat, not just chucking
const TURNOVER_PER_GAME_HIGH = 14; // worth pressing/trapping
const FT_PCT_WEAK = 60; // foul-late candidate instead of letting them get a shot off
const MIN_FTA_PER_GAME_FOR_FT_NOTE = 5; // don't flag FT% off a tiny sample
const USAGE_SHARE_HIGH = 0.28; // one player carrying >=28% of the team's season scoring

export function buildOpponentScoutingReports(games: GameCore[], focusSeasonClubId: string): OpponentScoutingReport[] {
  const dnaByTeam = computeLeagueTeamDna(games);
  const teamAgg = new Map<string, TeamAgg>();
  const playerAggByTeam = new Map<string, Map<string, PlayerAgg>>();
  const headToHead = new Map<string, HeadToHead>();

  for (const game of games) {
    const sides = [
      [game.home, game.away] as const,
      [game.away, game.home] as const,
    ];
    for (const [side, opponent] of sides) {
      if (side.seasonClubId === focusSeasonClubId) continue;
      const agg: TeamAgg = teamAgg.get(side.seasonClubId) ?? {
        seasonClubId: side.seasonClubId, name: side.name, shortName: side.shortName,
        logoUrl: side.logoUrl, primaryColor: side.primaryColor,
        gamesPlayed: 0, wins: 0, losses: 0, points: 0, opponentPoints: 0, turnovers: 0, rebounds: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      };
      agg.gamesPlayed += 1;
      if (side.score > opponent.score) agg.wins += 1;
      else if (side.score < opponent.score) agg.losses += 1;
      agg.points += side.score;
      agg.opponentPoints += opponent.score;
      agg.turnovers += side.turnovers;
      if (side.offensiveRebounds != null && side.defensiveRebounds != null) agg.rebounds += side.offensiveRebounds + side.defensiveRebounds;
      if (side.fieldGoalsMade != null) agg.fgm += side.fieldGoalsMade;
      if (side.fieldGoalsAttempted != null) agg.fga += side.fieldGoalsAttempted;
      if (side.threePointsMade != null) agg.tpm += side.threePointsMade;
      if (side.threePointsAttempted != null) agg.tpa += side.threePointsAttempted;
      if (side.freeThrowsMade != null) agg.ftm += side.freeThrowsMade;
      if (side.freeThrowsAttempted != null) agg.fta += side.freeThrowsAttempted;
      teamAgg.set(side.seasonClubId, agg);

      if (opponent.seasonClubId === focusSeasonClubId) {
        const h2h: HeadToHead = headToHead.get(side.seasonClubId) ?? { gamesPlayed: 0, focusWins: 0, focusLosses: 0, results: [] };
        h2h.gamesPlayed += 1;
        if (opponent.score > side.score) h2h.focusWins += 1;
        else if (opponent.score < side.score) h2h.focusLosses += 1;
        h2h.results.push({ scheduledAt: game.scheduledAt, focusScore: opponent.score, opponentScore: side.score });
        headToHead.set(side.seasonClubId, h2h);
      }
    }

    for (const p of game.players) {
      if (p.didNotPlay || p.seasonClubId === focusSeasonClubId) continue;
      const teamMap = playerAggByTeam.get(p.seasonClubId) ?? new Map<string, PlayerAgg>();
      const existing: PlayerAgg = teamMap.get(p.playerId) ?? {
        playerId: p.playerId, name: p.name, jerseyNumber: p.jerseyNumber,
        gamesPlayed: 0, points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      };
      existing.gamesPlayed += 1;
      existing.points += p.points;
      existing.fgm += p.fieldGoalsMade ?? 0;
      existing.fga += p.fieldGoalsAttempted ?? 0;
      existing.tpm += p.threePointsMade ?? 0;
      existing.tpa += p.threePointsAttempted ?? 0;
      existing.ftm += p.freeThrowsMade ?? 0;
      existing.fta += p.freeThrowsAttempted ?? 0;
      teamMap.set(p.playerId, existing);
      playerAggByTeam.set(p.seasonClubId, teamMap);
    }
  }

  const reports: OpponentScoutingReport[] = [];
  for (const [seasonClubId, agg] of teamAgg) {
    if (agg.gamesPlayed === 0) continue;
    const pointsForPerGame = round1(agg.points / agg.gamesPlayed);
    const pointsAgainstPerGame = round1(agg.opponentPoints / agg.gamesPlayed);
    const turnoversPerGame = round1(agg.turnovers / agg.gamesPlayed);
    const reboundsPerGame = round1(agg.rebounds / agg.gamesPlayed);
    const fgPct = percent(agg.fgm, agg.fga);
    const threePct = percent(agg.tpm, agg.tpa);
    const ftPct = percent(agg.ftm, agg.fta);
    const threeRate = agg.fga > 0 ? (agg.tpa / agg.fga) * 100 : null;

    const rankedPlayers = [...(playerAggByTeam.get(seasonClubId)?.values() ?? [])].sort((a, b) => b.points - a.points);
    const topScorers: OpponentTopScorer[] = rankedPlayers.slice(0, 3).map((p) => ({
      playerId: p.playerId,
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      gamesPlayed: p.gamesPlayed,
      ppg: round1(p.points / p.gamesPlayed),
      fgPct: percent(p.fgm, p.fga),
      threePct: percent(p.tpm, p.tpa),
      ftPct: percent(p.ftm, p.fta),
      threeRate: p.fga > 0 ? (p.tpa / p.fga) * 100 : null,
    }));

    const dnaTags = dnaByTeam.get(seasonClubId)?.tags ?? [];
    const threats: OpponentNote[] = [];
    const weaknesses: OpponentNote[] = [];

    const primaryScorer = rankedPlayers[0];
    if (primaryScorer && agg.points > 0 && primaryScorer.points / agg.points >= USAGE_SHARE_HIGH) {
      threats.push({
        label: `${primaryScorer.name} is the focal point`,
        detail: `${round1((primaryScorer.points / agg.points) * 100)}% of the team's season points (${round1(primaryScorer.points / primaryScorer.gamesPlayed)} PPG) - take him away and the offense has to find a second option.`,
      });
    }
    if (threeRate != null && threeRate >= THREE_RATE_HIGH) {
      if (threePct != null && threePct >= THREE_PCT_STRONG) {
        threats.push({ label: "Lives from three", detail: `${round1(threeRate)}% of field goal attempts are threes at ${round1(threePct)}% - a real outside threat, close out hard.` });
      } else {
        weaknesses.push({ label: "High-volume, low-efficiency three-point shooting", detail: `${round1(threeRate)}% of attempts are threes but only ${threePct != null ? round1(threePct) : "—"}% go in - live with the open three rather than helping off shooters.` });
      }
    }
    if (turnoversPerGame >= TURNOVER_PER_GAME_HIGH) {
      weaknesses.push({ label: "Turnover prone", detail: `${turnoversPerGame} turnovers per game - full-court pressure and trapping in the corners should pay off.` });
    }
    if (ftPct != null && ftPct < FT_PCT_WEAK && agg.fta / agg.gamesPlayed >= MIN_FTA_PER_GAME_FOR_FT_NOTE) {
      weaknesses.push({ label: "Poor free-throw shooting", detail: `${round1(ftPct)}% from the line - fouling late beats letting them get a shot up.` });
    }
    const dnaThreatCopy: Partial<Record<TeamDnaTag, string>> = {
      REBOUNDING_TEAM: `${reboundsPerGame} rebounds per game, above league average - box out early and limit second-chance points.`,
      TRANSITION_THREAT: "Above-average fast break scoring - get back on defense before crashing the offensive glass.",
      BALL_MOVEMENT: "Above-average assist rate - shares the ball, so isolated man defense is more exploitable than a help-heavy scheme.",
      BENCH_DEPTH: "Above-average bench scoring - the starters resting doesn't create the usual drop-off.",
      LOW_TURNOVER: "Takes care of the ball better than league average - full-court pressure is lower value here.",
      PAINT_HEAVY: "Scores heavily in the paint - rim protection and early post help matter more than perimeter closeouts.",
      HIGH_PACE_SCORING: `${pointsForPerGame} points per game, above league average - control tempo rather than trading possessions.`,
    };
    for (const tag of dnaTags) {
      const copy = dnaThreatCopy[tag];
      if (copy) threats.push({ label: TEAM_DNA_TAG_LABEL[tag], detail: copy });
    }

    const h2h: HeadToHead = headToHead.get(seasonClubId) ?? { gamesPlayed: 0, focusWins: 0, focusLosses: 0, results: [] };

    const gamePlanParts: string[] = [];
    if (primaryScorer) {
      const scorerFgPct = percent(primaryScorer.fgm, primaryScorer.fga);
      gamePlanParts.push(`${primaryScorer.name} (${round1(primaryScorer.points / primaryScorer.gamesPlayed)} PPG${scorerFgPct != null ? `, ${round1(scorerFgPct)}% FG` : ""}) leads their scoring.`);
    }
    if (threats.length > 0) gamePlanParts.push(`Watch for: ${threats.slice(0, 2).map((t) => t.label.toLowerCase()).join("; ")}.`);
    if (weaknesses.length > 0) gamePlanParts.push(`Exploit: ${weaknesses.slice(0, 2).map((w) => w.label.toLowerCase()).join("; ")}.`);
    if (h2h.gamesPlayed > 0) gamePlanParts.push(`Head-to-head this season: ${h2h.focusWins}-${h2h.focusLosses}.`);

    reports.push({
      seasonClubId, name: agg.name, shortName: agg.shortName, logoUrl: agg.logoUrl, primaryColor: agg.primaryColor,
      gamesPlayed: agg.gamesPlayed, wins: agg.wins, losses: agg.losses,
      pointsForPerGame, pointsAgainstPerGame, turnoversPerGame, reboundsPerGame,
      fgPct, threePct, ftPct, dnaTags, topScorers, threats, weaknesses,
      headToHead: h2h, gamePlan: gamePlanParts.join(" "),
    });
  }

  return reports.sort((a, b) => a.name.localeCompare(b.name));
}
