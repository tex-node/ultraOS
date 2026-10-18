import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndividualStandings, formatRatio, type IndividualStandingInput } from "./individual-standings";

// The public table must agree with the engine's decision, not re-decide it. These tests pin the two ways a
// table usually lies: a 0/0 ratio rendered as "0.000", and an "undefeated with nothing against" ratio
// rendered as Infinity.

function row(overrides: Partial<IndividualStandingInput> & { entrantId: string; name: string }): IndividualStandingInput {
  return {
    played: 3,
    won: 2,
    lost: 1,
    drawn: 0,
    leaguePoints: 2,
    rank: null,
    rankTiebreak: null,
    metrics: [],
    gamesWon: 0,
    gamesLost: 0,
    ...overrides,
  };
}

test("sets come from the engine's metrics, games from the period scores", () => {
  const [standing] = buildIndividualStandings([
    row({
      entrantId: "e1",
      name: "Ada",
      metrics: [
        { metricKey: "SETS_WON", value: 5 },
        { metricKey: "SETS_LOST", value: 4 },
      ],
      gamesWon: 41,
      gamesLost: 38,
    }),
  ]);
  assert.equal(standing.setsWon, 5);
  assert.equal(standing.setsLost, 4);
  assert.equal(standing.setRatio, 1.25);
  assert.equal(standing.gamesWon, 41);
  assert.equal(standing.gamesLost, 38);
});

test("the engine's rank wins over the fallback ordering", () => {
  const rows = buildIndividualStandings([
    row({ entrantId: "e1", name: "Ada", won: 3, rank: 2 }),
    row({ entrantId: "e2", name: "Bea", won: 1, rank: 1 }),
  ]);
  assert.deepEqual(rows.map((entry) => entry.name), ["Bea", "Ada"]);
});

test("without ranks the order is wins, then set ratio, then game ratio", () => {
  const rows = buildIndividualStandings([
    row({ entrantId: "e1", name: "Ada", won: 2, metrics: [{ metricKey: "SETS_WON", value: 4 }, { metricKey: "SETS_LOST", value: 4 }], gamesWon: 30, gamesLost: 30 }),
    row({ entrantId: "e2", name: "Bea", won: 2, metrics: [{ metricKey: "SETS_WON", value: 5 }, { metricKey: "SETS_LOST", value: 4 }], gamesWon: 9, gamesLost: 9 }),
    row({ entrantId: "e3", name: "Cora", won: 1 }),
  ]);
  assert.deepEqual(rows.map((entry) => entry.name), ["Bea", "Ada", "Cora"]);
});

test("a 0/0 ratio is null (a dash), never 0.000 and never Infinity", () => {
  const [unplayed] = buildIndividualStandings([row({ entrantId: "e1", name: "Ada", played: 0, won: 0, lost: 0 })]);
  assert.equal(unplayed.setRatio, null);
  assert.equal(unplayed.gameRatio, null);
  assert.equal(formatRatio(unplayed.setRatio), "–");

  const [undefeated] = buildIndividualStandings([
    row({ entrantId: "e2", name: "Bea", metrics: [{ metricKey: "SETS_WON", value: 6 }], gamesWon: 36, gamesLost: 0 }),
  ]);
  assert.equal(undefeated.setRatio, null);
  assert.equal(undefeated.gameRatio, null);
  assert.equal(formatRatio(undefeated.setRatio), "–");
});

test("ratios render to three decimals", () => {
  assert.equal(formatRatio(1.25), "1.250");
  assert.equal(formatRatio(0.8), "0.800");
});

test("names break a full tie so the table is stable", () => {
  const rows = buildIndividualStandings([
    row({ entrantId: "e1", name: "Zed", won: 1 }),
    row({ entrantId: "e2", name: "Ada", won: 1 }),
  ]);
  assert.deepEqual(rows.map((entry) => entry.name), ["Ada", "Zed"]);
});
