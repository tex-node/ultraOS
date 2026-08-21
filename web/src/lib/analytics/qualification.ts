import { qualificationConfig } from "./config";
import type { QualificationState } from "./types";

// Never rank a 1/1 shooter as a league-leading percentage — every rate-stat leaderboard entry
// must clear a minimum attempts/games floor first.

export function isShootingQualified(attempts: number | null): boolean {
  return attempts != null && attempts >= qualificationConfig.shootingMinimumAttempts;
}

export function isFourPointQualified(attempts: number | null): boolean {
  return attempts != null && attempts >= qualificationConfig.fourPointMinimumAttempts;
}

export function playerSampleQualification(gamesPlayed: number): QualificationState {
  if (gamesPlayed >= qualificationConfig.playerMinimumGamesForLeaderboard) return "QUALIFIED";
  if (gamesPlayed >= qualificationConfig.playerDevelopingMinimumGames) return "DEVELOPING_PROFILE";
  return "INSUFFICIENT_SAMPLE";
}

export function teamSampleQualification(gamesPlayed: number): QualificationState {
  if (gamesPlayed >= qualificationConfig.teamMinimumGamesForDNA) return "QUALIFIED";
  if (gamesPlayed >= 1) return "DEVELOPING_PROFILE";
  return "INSUFFICIENT_SAMPLE";
}

// Plain-language sample-reliability label — deterministic, games-count-only, not a fake AI
// confidence score. Used anywhere a DNA/leaderboard result should tell the reader how much to
// trust it without a wall of caveats.
export const SAMPLE_CONFIDENCE_LABEL: Record<QualificationState, string> = {
  INSUFFICIENT_SAMPLE: "Limited sample",
  DEVELOPING_PROFILE: "Developing sample",
  QUALIFIED: "Established sample",
};
