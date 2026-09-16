// Knockout bracket advancement. Pure functions only; the caller persists the planned fixtures.
//
// Round 1 of a draw has S slots (S is a power of two from generateKnockout) paired into S/2
// positions. A bye occupies a position with no fixture. Once every fixture in round r is FINAL, the
// winners - plus any round-1 byes - fill round r+1: winners of positions 2k-1 and 2k meet at
// position k.

export type BracketParticipant = { seasonClubId: string | null; entrantId: string | null };

export type BracketMatch = {
  round: number;
  bracketPosition: number;
  status: string;
  winner: BracketParticipant | null;
};

export type PlannedFixture = {
  round: number;
  bracketPosition: number;
  home: BracketParticipant;
  away: BracketParticipant;
};

export type AdvancePlan =
  | { status: "final" } // the completed round was the final - the bracket is done
  | { status: "waiting" } // a fixture in the round is not decided yet
  | { status: "ready"; fixtures: PlannedFixture[] }; // next-round pairings, all participants known

export function isPowerOfTwo(value: number): boolean {
  return value >= 1 && (value & (value - 1)) === 0;
}

// Full bracket size (round-1 slots) from the round-1 fixtures plus byes. The number of round-1
// positions (fixtures + byes) must be a power of two - generateKnockout guarantees this. Returns null
// on inconsistent data so callers can bail safely.
export function bracketSize(roundOneFixtureCount: number, byeCount: number): number | null {
  const positions = roundOneFixtureCount + byeCount;
  if (!isPowerOfTwo(positions)) return null;
  return positions * 2;
}

export function planNextRound(input: {
  round: number;
  size: number;
  matches: BracketMatch[];
  byes: Record<string, BracketParticipant>;
}): AdvancePlan {
  const { round, size, matches, byes } = input;
  if (round < 1 || size < 2) return { status: "waiting" };

  // Number of positions (fixtures) in the current round: S/2^r.
  const positions = size / 2 ** round;
  if (positions <= 1) return { status: "final" }; // this round was the final

  const byPosition = new Map<number, BracketMatch>();
  for (const match of matches) {
    if (match.round === round) byPosition.set(match.bracketPosition, match);
  }

  // Resolve each position in the current round to the participant that advances.
  const participant = new Map<number, BracketParticipant>();
  for (let position = 1; position <= positions; position += 1) {
    const bye = round === 1 ? byes[String(position)] : undefined;
    if (bye) {
      participant.set(position, bye);
      continue;
    }
    const match = byPosition.get(position);
    if (!match || match.status !== "FINAL" || !match.winner) return { status: "waiting" };
    participant.set(position, match.winner);
  }

  const fixtures: PlannedFixture[] = [];
  for (let position = 1; position <= positions / 2; position += 1) {
    fixtures.push({
      round: round + 1,
      bracketPosition: position,
      home: participant.get(position * 2 - 1)!,
      away: participant.get(position * 2)!,
    });
  }
  return { status: "ready", fixtures };
}
