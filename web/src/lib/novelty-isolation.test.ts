import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

// Zenith/Pulse (and any future exhibition team) run on NoveltyTeam/NoveltyMatch/NoveltyGame,
// deliberately isolated from the competitive Club/SeasonClub/Fixture/Game/Standing tables so an
// exhibition score can never leak into league standings. This is a static guard on the source of
// novelty-matches/actions.ts: if a future edit ever imports recalculateStandings or writes to
// the competitive Fixture/Standing/SeasonClub tables from that file, this test fails the build.
const NOVELTY_ACTIONS_PATH = join(import.meta.dirname, "..", "app", "novelty-matches", "actions.ts");

const FORBIDDEN_PATTERNS = [
  /recalculateStandings/,
  /\.fixture\.(update|create|upsert|delete)/,
  /\.standing\.(update|create|upsert|delete)/,
  /\.seasonClub\.(update|create|upsert|delete)/,
];

test("novelty match scoring never touches competitive Fixture/Standing/SeasonClub tables", () => {
  const source = readFileSync(NOVELTY_ACTIONS_PATH, "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.equal(
      pattern.test(source),
      false,
      `novelty-matches/actions.ts must never reference ${pattern} - exhibition scoring must stay isolated from competitive standings`,
    );
  }
});
