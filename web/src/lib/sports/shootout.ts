// Penalty shootout rules. Pure functions only.
//
// Best-of-five kicks, then sudden death. Used by knockout football when extra time does not
// separate the sides.

export type ShootoutSide = "HOME" | "AWAY";
export type ShootoutKick = { side: ShootoutSide; scored: boolean };

export type ShootoutTally = { home: number; away: number; homeTaken: number; awayTaken: number };

export function shootoutTally(kicks: ShootoutKick[]): ShootoutTally {
  let home = 0;
  let away = 0;
  let homeTaken = 0;
  let awayTaken = 0;
  for (const kick of kicks) {
    if (kick.side === "HOME") {
      homeTaken += 1;
      if (kick.scored) home += 1;
    } else {
      awayTaken += 1;
      if (kick.scored) away += 1;
    }
  }
  return { home, away, homeTaken, awayTaken };
}

export function shootoutWinner(kicks: ShootoutKick[]): ShootoutSide | null {
  const { home, away, homeTaken, awayTaken } = shootoutTally(kicks);

  // Best-of-five: a side is decided once the other cannot catch up within its remaining kicks.
  if (homeTaken < 5 || awayTaken < 5) {
    const homeRemaining = Math.max(0, 5 - homeTaken);
    const awayRemaining = Math.max(0, 5 - awayTaken);
    if (home > away + awayRemaining) return "HOME";
    if (away > home + homeRemaining) return "AWAY";
    return null;
  }

  // Sudden death: decided only once both sides have taken the same number of kicks and the scores
  // differ (each pair is one kick per side).
  if (homeTaken === awayTaken && home !== away) return home > away ? "HOME" : "AWAY";
  return null;
}
