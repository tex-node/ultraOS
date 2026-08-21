// Live Game Pulse (G.19, Part VIII-IX). Pure reducer over the game's canonical scoring
// chronology (ordered ACTIVE, made, score-changing GameEvent rows - see
// live-game-snapshot-v2.ts's `scoringChronology`). No Prisma access, no possession-level
// inference: only lead changes, ties, largest lead, and scoring runs, all derivable directly
// from the persisted running score after each made shot. For BOX_SCORE_ONLY historical games
// (no event ledger at all) this has nothing to reduce over and is simply never called - those
// pages keep using the existing historical pulse/story implementation unchanged.
export type ScoringPoint = {
  sequence: number;
  period: number;
  clockSeconds: number;
  homeScore: number;
  awayScore: number;
  scoringTeam: "HOME" | "AWAY";
  basePointValue: number;
  multiplier: number;
  isUltraTime: boolean;
};

export type PulsePoint = ScoringPoint & { leader: "HOME" | "AWAY" | "TIE" };

export type ScoringRun = { team: "HOME" | "AWAY"; points: number; startSequence: number; endSequence: number };

export type LiveGamePulse = {
  points: PulsePoint[];
  leadChanges: number;
  ties: number;
  largestLead: { team: "HOME" | "AWAY"; margin: number } | null;
  largestRun: ScoringRun | null;
  currentRun: ScoringRun | null;
  ultraTimeStart: { period: number; clockSeconds: number } | null;
};

function leaderOf(homeScore: number, awayScore: number): "HOME" | "AWAY" | "TIE" {
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  return "TIE";
}

export function computeGamePulse(chronology: ScoringPoint[]): LiveGamePulse {
  const points: PulsePoint[] = chronology.map((p) => ({ ...p, leader: leaderOf(p.homeScore, p.awayScore) }));

  let leadChanges = 0;
  let ties = 0;
  let largestLead: LiveGamePulse["largestLead"] = null;
  let priorLeader: "HOME" | "AWAY" | "TIE" | null = null;
  // Standard basketball convention: a "lead change" is any point the team holding the lead
  // switches, INCLUDING a team taking the lead right out of a tie - only two ties in a row, or a
  // tie followed by the same team re-extending its own lead, are not lead changes. Tracking only
  // the immediately-prior point (as an earlier version of this function did) missed exactly the
  // TIE -> HOME transition, undercounting real lead changes - found by the G.19 rehearsal, which
  // built a real 0-6 away start, a comeback to a 6-6 tie, then a 9-6 home lead and got 0 lead
  // changes back instead of the expected 1.
  let lastNonTieLeader: "HOME" | "AWAY" | null = null;
  let ultraTimeStart: LiveGamePulse["ultraTimeStart"] = null;

  // Scoring runs: consecutive made baskets by the same team, uninterrupted by the other team
  // scoring (a run "breaks" the instant the opponent scores, restarting at 0 for them).
  const runs: ScoringRun[] = [];

  for (const point of points) {
    if (point.leader === "TIE") {
      if (priorLeader !== null && priorLeader !== "TIE") ties += 1;
    } else {
      if (lastNonTieLeader !== null && lastNonTieLeader !== point.leader) leadChanges += 1;
      lastNonTieLeader = point.leader;
    }
    priorLeader = point.leader;

    const margin = Math.abs(point.homeScore - point.awayScore);
    if (margin > 0 && (largestLead === null || margin > largestLead.margin)) {
      largestLead = { team: point.homeScore > point.awayScore ? "HOME" : "AWAY", margin };
    }

    if (point.isUltraTime && ultraTimeStart === null) {
      ultraTimeStart = { period: point.period, clockSeconds: point.clockSeconds };
    }

    const runPoints = point.basePointValue * point.multiplier;
    const last = runs.at(-1);
    if (last !== undefined && last.team === point.scoringTeam) {
      last.points += runPoints;
      last.endSequence = point.sequence;
    } else {
      runs.push({ team: point.scoringTeam, points: runPoints, startSequence: point.sequence, endSequence: point.sequence });
    }
  }

  const largestRun = runs.length > 0 ? runs.reduce((a, b) => (b.points > a.points ? b : a)) : null;
  const currentRun = runs.length > 0 ? runs[runs.length - 1] : null;

  return { points, leadChanges, ties, largestLead, largestRun, currentRun, ultraTimeStart };
}
