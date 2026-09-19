import assert from "node:assert/strict";
import test from "node:test";
import { compareScores, verificationSummary } from "@/lib/sports/score-verify";

test("three matching scores verify clean", () => {
  const score = { home: 42, away: 39 };
  const result = compareScores(score, score, score);
  assert.equal(result.allMatch, true);
  assert.equal(result.officialMatchesStatistician, true);
  assert.equal(result.officialMatchesVenue, true);
  assert.equal(result.statisticianMatchesVenue, true);
  assert.ok(verificationSummary(score, score, score, result).endsWith("all match"));
});

test("a wrong venue board is a mismatch, not a scoring error", () => {
  const result = compareScores({ home: 42, away: 39 }, { home: 42, away: 39 }, { home: 42, away: 37 });
  assert.equal(result.allMatch, false);
  assert.equal(result.officialMatchesStatistician, true);
  assert.equal(result.officialMatchesVenue, false);
  assert.ok(verificationSummary({ home: 42, away: 39 }, { home: 42, away: 39 }, { home: 42, away: 37 }, result).includes("MISMATCH"));
});

test("a statistician ledger behind the official score is a mismatch", () => {
  const result = compareScores({ home: 42, away: 39 }, { home: 40, away: 39 }, { home: 42, away: 39 });
  assert.equal(result.allMatch, false);
  assert.equal(result.officialMatchesStatistician, false);
  assert.equal(result.officialMatchesVenue, true);
  assert.equal(result.statisticianMatchesVenue, false);
});