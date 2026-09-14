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

export type FixtureFormat = "ROUND_ROBIN" | "KNOCKOUT" | "GROUP_STAGE";

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
};

// First round of a single-elimination draw. Entrants are seeded in the given order; a non-power-of-two
// count produces byes that auto-advance. Later rounds are created as results arrive.
export function generateKnockout(entrantIds: string[]): KnockoutDraw {
  if (entrantIds.length < 2) {
    return { size: 0, rounds: 0, firstRound: [], byes: [...entrantIds] };
  }
  const size = nextPowerOfTwo(entrantIds.length);
  const rounds = Math.round(Math.log2(size));
  const order = seedOrder(size);
  const firstRound: GeneratedFixture[] = [];
  const byes: string[] = [];

  for (let i = 0; i < order.length; i += 2) {
    const first = entrantIds[order[i] - 1];
    const second = entrantIds[order[i + 1] - 1];
    const bracketPosition = i / 2 + 1;
    if (first && second) {
      firstRound.push({ round: 1, homeEntrantId: first, awayEntrantId: second, bracketPosition });
    } else if (first) {
      byes.push(first);
    } else if (second) {
      byes.push(second);
    }
  }

  return { size, rounds, firstRound, byes };
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
  }
}
