// Multi-sport Stage 9: schedule and bracket generation. Pure functions only; no database access.
//
// One generator serves every team sport: round-robin (single/double) for leagues, single-elimination
// knockout for cups, and group-stage (round-robin within seeded groups). Resolved in the architecture
// (Q1): round-robin first, knockout and group-stage added here. Tennis round-robin uses the same
// round-robin generator; brackets for tennis use the knockout generator.

export type GeneratedFixture = {
  round: number;
  homeEntrantId: string;
  awayEntrantId: string;
  group?: string;
  bracketPosition?: number;
};

export type FixtureFormat = "ROUND_ROBIN" | "KNOCKOUT" | "GROUP_STAGE" | "SWISS" | "DOUBLE_ELIMINATION" | "LADDER";

export type FixtureFormatOptions = {
  doubleRound?: boolean;
  groupCount?: number;
};

const BYE = "__BYE__";

// Circle method: one team is fixed and the rest rotate. Produces rounds of pairings; byes (odd
// team counts) are dropped from the output rather than emitted as matches.
function roundRobinRounds(entrantIds: string[]): Array<Array<[string, string]>> {
  const teams = [...entrantIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push(BYE);
  const size = teams.length;
  const rotation = [...teams];
  const rounds: Array<Array<[string, string]>> = [];

  for (let round = 0; round < size - 1; round += 1) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < size / 2; i += 1) {
      const home = rotation[i];
      const away = rotation[size - 1 - i];
      if (home !== BYE && away !== BYE) pairs.push([home, away]);
    }
    rounds.push(pairs);
    // Keep the first team fixed; move the last team to position 1.
    const last = rotation.pop()!;
    rotation.splice(1, 0, last);
  }
  return rounds;
}

export function generateRoundRobin(
  entrantIds: string[],
  options: { doubleRound?: boolean; startRound?: number; group?: string } = {},
): GeneratedFixture[] {
  const rounds = roundRobinRounds(entrantIds);
  const start = options.startRound ?? 1;
  const fixtures: GeneratedFixture[] = [];

  rounds.forEach((pairs, index) => {
    for (const [home, away] of pairs) {
      fixtures.push({
        round: start + index,
        homeEntrantId: home,
        awayEntrantId: away,
        ...(options.group ? { group: options.group } : {}),
      });
    }
  });

  if (options.doubleRound) {
    rounds.forEach((pairs, index) => {
      for (const [home, away] of pairs) {
        fixtures.push({
          round: start + rounds.length + index,
          homeEntrantId: away,
          awayEntrantId: home,
          ...(options.group ? { group: options.group } : {}),
        });
      }
    });
  }

  return fixtures;
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

// Standard bracket seeding order (1 v lowest seed, etc.) for a power-of-two bracket.
function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, sum - seed);
    }
    order = next;
  }
  return order;
}

export type KnockoutDraw = {
  size: number;
  rounds: number;
  firstRound: GeneratedFixture[];
  byes: string[];
  // Round-1 slots that hold a bye, keyed by bracketPosition. A bye auto-advances, so the bracket
  // advancement step needs the position (not just the entrant) to know which fixture feeds where.
  byePositions: Array<{ position: number; entrantId: string }>;
};

// First round of a single-elimination draw. Entrants are seeded in the given order; a non-power-of-two
// count produces byes that auto-advance. Later rounds are created as results arrive.
export function generateKnockout(entrantIds: string[]): KnockoutDraw {
  if (entrantIds.length < 2) {
    return { size: 0, rounds: 0, firstRound: [], byes: [...entrantIds], byePositions: [] };
  }
  const size = nextPowerOfTwo(entrantIds.length);
  const rounds = Math.round(Math.log2(size));
  const order = seedOrder(size);
  const firstRound: GeneratedFixture[] = [];
  const byes: string[] = [];
  const byePositions: Array<{ position: number; entrantId: string }> = [];

  for (let i = 0; i < order.length; i += 2) {
    const first = entrantIds[order[i] - 1];
    const second = entrantIds[order[i + 1] - 1];
    const bracketPosition = i / 2 + 1;
    if (first && second) {
      firstRound.push({ round: 1, homeEntrantId: first, awayEntrantId: second, bracketPosition });
    } else if (first) {
      byes.push(first);
      byePositions.push({ position: bracketPosition, entrantId: first });
    } else if (second) {
      byes.push(second);
      byePositions.push({ position: bracketPosition, entrantId: second });
    }
  }

  return { size, rounds, firstRound, byes, byePositions };
}

// Snake seeding so the strongest entrants are spread across groups.
export function splitIntoGroups(entrantIds: string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: Math.max(1, groupCount) }, () => []);
  entrantIds.forEach((entrantId, index) => {
    const row = Math.floor(index / groupCount);
    const column = index % groupCount;
    const target = row % 2 === 0 ? column : groupCount - 1 - column;
    groups[target].push(entrantId);
  });
  return groups;
}

export function generateGroupStage(
  entrantIds: string[],
  groupCount: number,
  options: { doubleRound?: boolean } = {},
): GeneratedFixture[] {
  const groups = splitIntoGroups(entrantIds, groupCount);
  const fixtures: GeneratedFixture[] = [];
  groups.forEach((groupEntrants, index) => {
    const label = String.fromCharCode(65 + index);
    fixtures.push(...generateRoundRobin(groupEntrants, { doubleRound: options.doubleRound, group: label }));
  });
  return fixtures;
}

export function generateFixtures(
  format: FixtureFormat,
  entrantIds: string[],
  options: FixtureFormatOptions = {},
): GeneratedFixture[] {
  switch (format) {
    case "ROUND_ROBIN":
      return generateRoundRobin(entrantIds, { doubleRound: options.doubleRound });
    case "KNOCKOUT":
      return generateKnockout(entrantIds).firstRound;
    case "GROUP_STAGE":
      return generateGroupStage(entrantIds, options.groupCount ?? 2, { doubleRound: options.doubleRound });
    case "SWISS":
      // Round one pairs seeds in order (everyone starts level); later rounds re-run
      // generateSwissRound on the live standings.
      return generateSwissRound(
        entrantIds.map((entrantId) => ({ entrantId, points: 0, opponents: [], hasHadBye: false })),
        1,
      ).fixtures;
    case "DOUBLE_ELIMINATION":
      return generateDoubleElimination(entrantIds).winnersFirstRound;
    case "LADDER":
      return generateLadderRound(entrantIds, 1);
  }
}

export type SwissStanding = {
  entrantId: string;
  points: number;
  opponents: string[];
  hasHadBye: boolean;
};

export type SwissRound = {
  round: number;
  fixtures: GeneratedFixture[];
  byes: string[];
};

// One Swiss round: entrants are grouped by points (strongest group first, input order breaking
// ties), and each entrant meets the highest-ranked opponent it has not faced yet. An odd count
// gives the lowest-ranked bye-virgin a bye. Later rounds re-run this on updated standings -
// nothing is precomputed, so withdrawals and corrections simply flow into the next pairing.
export function generateSwissRound(standings: SwissStanding[], round: number): SwissRound {
  const ordered = [...standings].sort((a, b) => b.points - a.points);
  const byes: string[] = [];
  const pool = [...ordered];

  if (pool.length % 2 === 1) {
    const byeIndex = [...pool].reverse().findIndex((entry) => !entry.hasHadBye);
    const bye = byeIndex === -1 ? pool.pop()! : pool.splice(pool.length - 1 - byeIndex, 1)[0];
    byes.push(bye.entrantId);
  }

  const fixtures: GeneratedFixture[] = [];
  let bracketPosition = 1;
  while (pool.length > 0) {
    const first = pool.shift()!;
    const faced = new Set(first.opponents);
    const opponentIndex = pool.findIndex((entry) => !faced.has(entry.entrantId));
    // Everyone left has met each other (tiny field, late rounds): take the nearest unconfronted
    // pairing rather than leaving a fixture unmade.
    const opponent = opponentIndex === -1 ? pool.shift()! : pool.splice(opponentIndex, 1)[0];
    fixtures.push({ round, homeEntrantId: first.entrantId, awayEntrantId: opponent.entrantId, bracketPosition });
    bracketPosition += 1;
  }

  return { round, fixtures, byes };
}

export type DoubleEliminationDraw = {
  size: number;
  rounds: number;
  winnersFirstRound: GeneratedFixture[];
  winnersByes: Array<{ position: number; entrantId: string }>;
};

// Double elimination, run the way tournaments actually run it: the winners bracket opens with a
// standard seeded round, and each losers round is paired on demand from the entrants that just
// dropped (see pairLosersRound). Auto-advancing a losers bracket up front would freeze wrong
// pairings the moment an upset lands, so later rounds are created as results arrive - the same
// philosophy as the single-elimination advancement.
export function generateDoubleElimination(entrantIds: string[]): DoubleEliminationDraw {
  const draw = generateKnockout(entrantIds);
  return {
    size: draw.size,
    rounds: draw.rounds,
    winnersFirstRound: draw.firstRound,
    winnersByes: draw.byePositions,
  };
}

// Pairs one losers-bracket round: entrants ordered as supplied (usually losers in bracket order),
// adjacent pairing, byes only when the count is odd. Round numbers continue the shared bracket
// count so winners and losers fixtures never collide on (round, bracketPosition).
export function pairLosersRound(
  entrants: string[],
  round: number,
  startPosition = 1,
): { round: number; fixtures: GeneratedFixture[]; byes: string[] } {
  const fixtures: GeneratedFixture[] = [];
  const pool = [...entrants];
  const byes: string[] = [];
  if (pool.length % 2 === 1) {
    byes.push(pool.pop()!);
  }
  let bracketPosition = startPosition;
  for (let i = 0; i < pool.length; i += 2) {
    fixtures.push({ round, homeEntrantId: pool[i], awayEntrantId: pool[i + 1], bracketPosition });
    bracketPosition += 1;
  }
  return { round, fixtures, byes };
}

export type LadderResult = { winnerId: string; loserId: string };

// Ranked ladder (strongest first): each round pairs adjacent rungs (1v2, 3v4, ...), leaving the
// bottom rung idle on an odd count. A lower-ranked winner climbs exactly to the loser's rung; a
// favourite holding serve changes nothing. Run round after round all season - the table IS the
// standings.
export function generateLadderRound(rankedIds: string[], round: number): GeneratedFixture[] {
  const fixtures: GeneratedFixture[] = [];
  let bracketPosition = 1;
  for (let i = 0; i + 1 < rankedIds.length; i += 2) {
    fixtures.push({ round, homeEntrantId: rankedIds[i], awayEntrantId: rankedIds[i + 1], bracketPosition });
    bracketPosition += 1;
  }
  return fixtures;
}

export function applyLadderResults(rankedIds: string[], results: LadderResult[]): string[] {
  const order = [...rankedIds];
  for (const { winnerId, loserId } of results) {
    const winnerIndex = order.indexOf(winnerId);
    const loserIndex = order.indexOf(loserId);
    if (winnerIndex === -1 || loserIndex === -1 || winnerIndex < loserIndex) continue;
    const [winner] = order.splice(winnerIndex, 1);
    order.splice(loserIndex, 0, winner);
  }
  return order;
}
