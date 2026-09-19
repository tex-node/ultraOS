import assert from "node:assert/strict";
import test from "node:test";
import { AMERICAN_FOOTBALL } from "@/lib/sports/american-football";
import { getSportDefinition } from "@/lib/sports/registry";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";

test("registered under key and slug", () => {
  assert.equal(getSportDefinition("AMERICAN_FOOTBALL")?.slug, "american-football");
  assert.equal(getSportDefinition("american-football")?.key, "AMERICAN_FOOTBALL");
});

test("four quarters with a stopped clock", () => {
  assert.equal(AMERICAN_FOOTBALL.structure.periodType, "QUARTER");
  assert.equal(AMERICAN_FOOTBALL.structure.periodCount, 4);
  assert.equal(AMERICAN_FOOTBALL.structure.clock, "STOPPAGE");
});

test("scoring values cover every way to score", () => {
  assert.deepEqual([...AMERICAN_FOOTBALL.scoring.values].sort((a, b) => a - b), [1, 2, 3, 6]);
  assert.equal(AMERICAN_FOOTBALL.scoring.drawsAllowed, true);
});

test("exactly one scoring event per touchdown - a TD can never count twice", () => {
  const td = (key: string) => AMERICAN_FOOTBALL.events.find((e) => e.key === key)!;
  assert.equal(td("TOUCHDOWN_RUSH").scores, true);
  assert.equal(td("TOUCHDOWN_RECEPTION").scores, true);
  assert.equal(td("TOUCHDOWN_RETURN").scores, true);
  assert.equal(td("PASSING_TOUCHDOWN").scores ?? false, false);
});

test("every metric references a real event", () => {
  const keys = new Set(AMERICAN_FOOTBALL.events.map((e) => e.key));
  for (const metric of AMERICAN_FOOTBALL.metrics) {
    for (const eventKey of metric.derivedFromEventKeys ?? []) {
      assert.ok(keys.has(eventKey), `${metric.key} references unknown event ${eventKey}`);
    }
  }
});

test("standings start on league points with head-to-head before name", () => {
  assert.deepEqual(AMERICAN_FOOTBALL.standings.tiebreak.slice(0, 2), ["LEAGUE_POINTS", "WINS"]);
  assert.ok(AMERICAN_FOOTBALL.standings.tiebreak.includes("HEAD_TO_HEAD"));
});

test("no scoring module claims it yet - capture arrives in P8.2", () => {
  assert.equal(resolveScoringModule(AMERICAN_FOOTBALL), null);
});