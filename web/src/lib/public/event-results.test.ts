import assert from "node:assert/strict";
import test from "node:test";
import { buildResultsBoard, parseEventResults, type EventResults } from "@/lib/public/event-results";

// v33: the results payload is published by an organiser and rendered by three surfaces, so the shape it
// accepts and the board it produces are pinned here. The GIESM flag race is the case that forced the
// change - it needed bibs, a per-gender grouping and an honest note about missing times.
const giesm: EventResults = {
  publishedAt: "2026-10-23T18:00:00.000Z",
  categories: [
    { key: "MALE_TEAM", kind: "TEAM", label: "Male category", sport: "VOLLEYBALL", placements: [{ rank: 2, name: "XSPORT" }, { rank: 1, name: "IVC" }, { rank: 3, name: "Victorious Academy" }] },
    { key: "FEMALE_TEAM", kind: "TEAM", label: "Female category", sport: "VOLLEYBALL", placements: [{ rank: 1, name: "IVC" }, { rank: 2, name: "TEN 15" }, { rank: 3, name: "LASUED" }] },
    { key: "MALE_FLAG_RACE", kind: "INDIVIDUAL", label: "Male flag race", sport: "FLAG_RACE", placements: [{ rank: 1, name: "Houndealo Felix", bib: "17" }, { rank: 2, name: "Ekechukwu Isaac", bib: "03" }, { rank: 3, name: "Onugwu Obina" }] },
    { key: "FEMALE_FLAG_RACE", kind: "INDIVIDUAL", label: "Female flag race", sport: "FLAG_RACE", placements: [{ rank: 1, name: "Rita Dickson", bib: "01" }, { rank: 2, name: "Sara Testimory", bib: "02" }] },
  ],
};

test("a published payload parses; anything that is not one does not", () => {
  assert.ok(parseEventResults(giesm));
  assert.equal(parseEventResults(null), null);
  assert.equal(parseEventResults({}), null);
  assert.equal(parseEventResults({ categories: [] }), null);
  assert.equal(parseEventResults("results"), null);
});

test("team standings and individual events are separated by kind", () => {
  const board = buildResultsBoard(giesm);
  assert.deepEqual(board.team.map((category) => category.key), ["MALE_TEAM", "FEMALE_TEAM"]);
  assert.deepEqual(board.individual.map((category) => category.key), ["MALE_FLAG_RACE", "FEMALE_FLAG_RACE"]);
});

test("a category without `kind` is classified by sport, so an older payload still lands in the right section", () => {
  const board = buildResultsBoard({
    categories: [
      { label: "Flag race", sport: "FLAG_RACE", placements: [{ rank: 1, name: "A" }] },
      { label: "Standings", sport: "VOLLEYBALL", placements: [{ rank: 1, name: "B" }] },
    ],
  });
  assert.equal(board.individual.length, 1);
  assert.equal(board.team.length, 1);
});

test("gender is read from the field, then inferred from the key or label, and never guessed when ambiguous", () => {
  const board = buildResultsBoard({
    categories: [
      { key: "MALE_FLAG_RACE", label: "Male flag race", kind: "INDIVIDUAL", placements: [] },
      { key: "FEMALE_TEAM", label: "Female category", kind: "TEAM", placements: [] },
      { key: "OPEN", label: "Open relay", kind: "INDIVIDUAL", placements: [] },
      { label: "Junior mixed", kind: "TEAM", placements: [], gender: "MIXED" },
    ],
  });
  assert.deepEqual(board.individual.map((category) => category.gender), ["MALE", "MIXED"]);
  assert.deepEqual(board.team.map((category) => category.gender), ["FEMALE", "MIXED"]);
});

test("placements are ordered by rank even when the payload lists them out of order", () => {
  const board = buildResultsBoard(giesm);
  const maleTeam = board.team.find((category) => category.key === "MALE_TEAM");
  assert.deepEqual(maleTeam?.placements.map((placement) => placement.name), ["IVC", "XSPORT", "Victorious Academy"]);
});

test("the top three carry medals and everyone else does not", () => {
  const board = buildResultsBoard({
    categories: [{ label: "Race", kind: "INDIVIDUAL", placements: [1, 2, 3, 4, 5].map((rank) => ({ rank, name: `Runner ${rank}` })) }],
  });
  assert.deepEqual(
    board.individual[0].placements.map((placement) => placement.medal),
    ["gold", "silver", "bronze", null, null],
  );
});

test("a placement without a published rank keeps list order instead of collapsing to rank 1", () => {
  const board = buildResultsBoard({ categories: [{ label: "Race", kind: "INDIVIDUAL", placements: [{ name: "A" }, { name: "B" }] }] });
  assert.deepEqual(board.individual[0].placements.map((placement) => placement.rank), [1, 2]);
});

test("the optional facts survive when present and are null when absent - nothing is invented", () => {
  const board = buildResultsBoard(giesm);
  const male = board.individual.find((category) => category.key === "MALE_FLAG_RACE");
  const houndealo = male?.placements.find((placement) => placement.name === "Houndealo Felix");
  const onugwu = male?.placements.find((placement) => placement.name === "Onugwu Obina");
  assert.equal(houndealo?.bib, "17");
  assert.equal(houndealo?.time, null);
  assert.equal(onugwu?.bib, null);
});

test("blank strings are treated as absent, so an empty field does not render as an empty label", () => {
  const board = buildResultsBoard({
    categories: [{ label: "Race", kind: "INDIVIDUAL", placements: [{ rank: 1, name: "A", bib: "  ", detail: "" }] }],
  });
  assert.equal(board.individual[0].placements[0].bib, null);
  assert.equal(board.individual[0].placements[0].detail, null);
});

test("a category with no placements still renders (a ladder awaiting results) and the board reports empty when nothing is placed", () => {
  const withEmpty = buildResultsBoard({ categories: [{ label: "Race", kind: "INDIVIDUAL", placements: [] }] });
  assert.equal(withEmpty.hasResults, false);
  assert.equal(withEmpty.individual.length, 1);
});
