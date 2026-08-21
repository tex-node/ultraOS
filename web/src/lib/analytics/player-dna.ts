import { percent } from "./normalization";
import { isShootingQualified, playerSampleQualification } from "./qualification";
import type { SeasonPlayerTotals } from "./league-analytics";
import type { QualificationState } from "./types";

// Deterministic player profile vs Season Zero league averages. Deliberately excludes 4PT,
// Ultra Time, clutch scoring, and shot-location tendencies for historical players — the
// imported box-score source never captured any of them, so there is nothing honest to
// normalize against. Only extend past these six dimensions when a source actually supports it.

export type PlayerDnaDimensionKey = "SCORING" | "SHOOTING" | "PLAYMAKING" | "REBOUNDING" | "DEFENSIVE_ACTIVITY" | "BALL_SECURITY";

export type PlayerDnaDimension = { key: PlayerDnaDimensionKey; label: string; index: number | null; playerValue: string; leagueAverage: string };

export type PlayerDna = {
  playerId: string;
  name: string;
  gamesPlayed: number;
  qualification: QualificationState;
  dimensions: PlayerDnaDimension[];
};

export const PLAYER_DNA_DIMENSION_LABEL: Record<PlayerDnaDimensionKey, string> = {
  SCORING: "Scoring",
  SHOOTING: "Shooting",
  PLAYMAKING: "Playmaking",
  REBOUNDING: "Rebounding",
  DEFENSIVE_ACTIVITY: "Defensive Activity",
  BALL_SECURITY: "Ball Security",
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0;
}

export function computeLeaguePlayerDna(players: SeasonPlayerTotals[]): Map<string, PlayerDna> {
  const qualified = players.filter((p) => p.gamesPlayed > 0);

  const leagueScoring = average(qualified.map((p) => perGame(p.points, p.gamesPlayed)));
  const leaguePlaymaking = average(qualified.map((p) => perGame(p.assists, p.gamesPlayed)));
  const leagueRebounding = average(qualified.map((p) => perGame(p.rebounds, p.gamesPlayed)));
  const leagueDefense = average(qualified.map((p) => perGame(p.steals + p.blocks, p.gamesPlayed)));
  const leagueBallSecurity = average(qualified.map((p) => perGame(p.turnovers, p.gamesPlayed)));
  // A single shot (make or miss) is not a shooting percentage — it's noise. Both the league
  // baseline and each player's own SHOOTING dimension below only ever use attempts that clear
  // the same floor already enforced on the public leaderboards, so a 1-for-1 player can't drag
  // the league average around or be shown a misleadingly extreme index of their own.
  const leagueShooting = average(
    qualified
      .filter((p) => isShootingQualified(p.fieldGoalsAttempted))
      .map((p) => percent(p.fieldGoalsMade, p.fieldGoalsAttempted))
      .filter((v): v is number => v != null),
  );

  const result = new Map<string, PlayerDna>();
  for (const p of qualified) {
    const qualification = playerSampleQualification(p.gamesPlayed);

    function dim(key: PlayerDnaDimensionKey, playerRate: number | null, leagueAvg: number | null, invert: boolean, fmt: (v: number) => string): PlayerDnaDimension {
      const raw = playerRate != null && leagueAvg != null && leagueAvg > 0
        ? (invert ? leagueAvg / Math.max(playerRate, 0.01) : playerRate / leagueAvg)
        : null;
      // A literal zero on an inverted (lower-is-better) stat — most commonly a single game with
      // zero turnovers — otherwise divides by the 0.01 epsilon guard and produces something like
      // index 50, i.e. "50x better than average," which is statistically absurd for a 1-game
      // sample. Capping at 3.0 keeps a real zero reading as a strong, meaningful signal without
      // letting it dominate archetypes/Emerging Performers as an outlier the underlying data
      // can't actually support.
      const index = raw != null ? Math.min(raw, 3) : null;
      return {
        key,
        label: PLAYER_DNA_DIMENSION_LABEL[key],
        index: index != null ? Math.round(index * 100) / 100 : null,
        playerValue: playerRate != null ? fmt(playerRate) : "—",
        leagueAverage: leagueAvg != null ? fmt(leagueAvg) : "—",
      };
    }

    const shootingPct = isShootingQualified(p.fieldGoalsAttempted) ? percent(p.fieldGoalsMade, p.fieldGoalsAttempted) : null;
    const dimensions: PlayerDnaDimension[] = [
      dim("SCORING", perGame(p.points, p.gamesPlayed), leagueScoring, false, (v) => v.toFixed(1)),
      dim("SHOOTING", shootingPct, leagueShooting, false, (v) => `${v.toFixed(1)}%`),
      dim("PLAYMAKING", perGame(p.assists, p.gamesPlayed), leaguePlaymaking, false, (v) => v.toFixed(1)),
      dim("REBOUNDING", perGame(p.rebounds, p.gamesPlayed), leagueRebounding, false, (v) => v.toFixed(1)),
      dim("DEFENSIVE_ACTIVITY", perGame(p.steals + p.blocks, p.gamesPlayed), leagueDefense, false, (v) => v.toFixed(1)),
      dim("BALL_SECURITY", perGame(p.turnovers, p.gamesPlayed), leagueBallSecurity, true, (v) => v.toFixed(1)),
    ];

    result.set(p.playerId, { playerId: p.playerId, name: p.name, gamesPlayed: p.gamesPlayed, qualification, dimensions });
  }
  return result;
}
