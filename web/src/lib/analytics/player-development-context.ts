import type { PlayerDna, PlayerDnaDimensionKey } from "./player-dna";
import { playerDevelopingAreas } from "./player-statistical-identity";

// Statistical Development Context — a restrained, neutral presentation layer built directly on
// top of playerDevelopingAreas() (G.12). This file adds no new calculation: it only maps the
// same below-average dimensions to a plain descriptive sentence per dimension. Never call this
// "Weaknesses" in the UI. Never give prescriptive coaching advice — describe the number, not what
// to do about it.

const NEUTRAL_SENTENCE: Record<PlayerDnaDimensionKey, (playerValue: string, leagueAverage: string) => string> = {
  SCORING: (p, l) => `Scoring output (${p} per game) currently sits below the Season Zero average (${l} per game).`,
  SHOOTING: (p, l) => `Qualified shooting percentage (${p}) currently sits below the Season Zero benchmark (${l}).`,
  PLAYMAKING: (p, l) => `Playmaking rate (${p} per game) currently sits below the Season Zero average (${l} per game).`,
  REBOUNDING: (p, l) => `Rebounding rate (${p} per game) currently sits below the Season Zero average (${l} per game).`,
  DEFENSIVE_ACTIVITY: (p, l) => `Defensive activity — steals plus blocks (${p} per game) — currently sits below the Season Zero average (${l} per game).`,
  // Ball Security's index is inverted (fewer turnovers = higher index), so a below-average index
  // is described in its natural raw-stat direction: turnovers, not an abstract "security" score.
  BALL_SECURITY: (p, l) => `Turnover rate (${p} per game) currently sits above the Season Zero average (${l} per game).`,
};

export type DevelopmentContextEntry = { dimension: PlayerDnaDimensionKey; label: string; sentence: string };

export type PlayerDevelopmentContext =
  | { status: "GATED" }
  | { status: "NONE_BELOW_AVERAGE" }
  | { status: "OK"; entries: DevelopmentContextEntry[] };

export function buildPlayerDevelopmentContext(dna: PlayerDna): PlayerDevelopmentContext {
  if (dna.qualification !== "QUALIFIED") return { status: "GATED" };
  const areas = playerDevelopingAreas(dna, 3);
  if (areas.length === 0) return { status: "NONE_BELOW_AVERAGE" };
  return {
    status: "OK",
    entries: areas.map((a) => ({ dimension: a.dimension, label: a.label, sentence: NEUTRAL_SENTENCE[a.dimension](a.playerValue, a.leagueAverage) })),
  };
}
