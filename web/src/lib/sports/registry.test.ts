import assert from "node:assert/strict";
import test from "node:test";
import { ULTRA_RULES } from "@/lib/game-rules";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { BASKETBALL } from "@/lib/sports/basketball";
import {
  SPORT_DEFINITION_LIST,
  capabilityEnabled,
  describeSport,
  getSportDefinition,
  ruleValue,
  validateSportDefinition,
} from "@/lib/sports/registry";

test("basketball definition is parity-equal to the legacy Ultra rules", () => {
  assert.equal(BASKETBALL.key, "BASKETBALL");
  assert.equal(BASKETBALL.slug, "basketball");
  assert.equal(BASKETBALL.structure.periodType, "HALF");
  assert.equal(BASKETBALL.structure.periodCount, ULTRA_RULES.halves);
  assert.equal(BASKETBALL.structure.periodDurationSeconds, ULTRA_RULES.halfSeconds);
  assert.equal(BASKETBALL.structure.shotClockSeconds, ULTRA_RULES.shotClockSeconds);

  assert.equal(ruleValue(BASKETBALL, "ULTRA_TIME_THRESHOLD_SECONDS"), ULTRA_RULES.ultraTimeThresholdSeconds);
  assert.equal(ruleValue(BASKETBALL, "ULTRA_TIME_MULTIPLIER"), ULTRA_RULES.ultraTimeMultiplier);

  assert.equal(capabilityEnabled(BASKETBALL, "SHOT_CLOCK"), true);
  assert.equal(capabilityEnabled(BASKETBALL, "ULTRA_TIME"), true);
  assert.equal(capabilityEnabled(BASKETBALL, "FOUR_POINT"), true);

  assert.deepEqual(BASKETBALL.scoring.values, [1, 2, 3, 4]);
  assert.equal(BASKETBALL.scoring.drawsAllowed, false);

  const primary = BASKETBALL.standings.primaryPoints;
  assert.equal(primary.model, "WIN_DRAW_LOSS");
  if (primary.model === "WIN_DRAW_LOSS") {
    assert.equal(primary.win, 3);
    assert.equal(primary.loss, 0);
  }
  assert.deepEqual(BASKETBALL.standings.tiebreak, [
    "LEAGUE_POINTS",
    "WINS",
    "POINT_DIFFERENCE",
    "POINTS_FOR",
    "NAME",
  ]);
  assert.deepEqual(BASKETBALL.roster?.positions, [
    "Point guard",
    "Shooting guard",
    "Small forward",
    "Power forward",
    "Center",
  ]);
});

test("every registered sport definition is structurally valid and unique", () => {
  const keys = new Set<string>();
  const slugs = new Set<string>();
  for (const definition of SPORT_DEFINITION_LIST) {
    assert.deepEqual(validateSportDefinition(definition), [], `invalid definition: ${definition.key}`);
    assert.equal(keys.has(definition.key), false, `duplicate key: ${definition.key}`);
    assert.equal(slugs.has(definition.slug), false, `duplicate slug: ${definition.slug}`);
    keys.add(definition.key);
    slugs.add(definition.slug);
  }
  assert.ok(SPORT_DEFINITION_LIST.length >= 5);
});

test("validation catches duplicate events and unknown event references", () => {
  const broken = {
    ...BASKETBALL,
    events: [...BASKETBALL.events, BASKETBALL.events[0]],
  };
  const issues = validateSportDefinition(broken);
  assert.ok(issues.some((issue) => issue.includes("duplicate event key")));

  const badMetric = {
    ...BASKETBALL,
    metrics: [{ ...BASKETBALL.metrics[0], derivedFromEventKeys: ["DOES_NOT_EXIST"] }],
  };
  assert.ok(validateSportDefinition(badMetric).some((issue) => issue.includes("unknown event")));
});

test("lookup resolves by key or slug, case-insensitively, and rejects unknowns", () => {
  assert.equal(getSportDefinition("BASKETBALL")?.key, "BASKETBALL");
  assert.equal(getSportDefinition("basketball")?.key, "BASKETBALL");
  assert.equal(getSportDefinition("  Volleyball ")?.key, "VOLLEYBALL");
  assert.equal(getSportDefinition("quidditch"), null);
  assert.equal(getSportDefinition(null), null);
});

test("plain-language summaries describe format and competing entity", () => {
  assert.equal(describeSport(BASKETBALL).formatSummary, "2 halves of 10 minutes · highest score wins");
  assert.equal(describeSport(BASKETBALL).entityLabel, "Teams");

  const volleyball = describeSport(getSportDefinition("volleyball")!);
  assert.equal(volleyball.formatSummary, "Best of 5 sets (25 points, 15 in the decider) · first to 3 sets wins");

  const football = describeSport(getSportDefinition("football")!);
  assert.equal(football.formatSummary, "2 halves of 45 minutes · highest score wins, draws allowed");

  const cricket = describeSport(getSportDefinition("cricket")!);
  assert.equal(cricket.formatSummary, "2 innings of 20 overs · most runs wins");

  const tennis = describeSport(getSportDefinition("tennis")!);
  assert.equal(tennis.formatSummary, "Best of 5 sets · first to 3 sets wins");
  assert.equal(tennis.entityLabel, "Individuals or pairs");
});

test("baseball, cricket and flag race are registered for the wizard", () => {
  // The competition wizard is data-driven from the registry, so "is this sport available" is exactly "does the
  // registry return it" (streak v11, Prompt 2).
  const baseball = getSportDefinition("baseball");
  assert.ok(baseball, "baseball is registered");
  assert.equal(baseball.key, "BASEBALL");
  assert.equal(baseball.structure.periodType, "INNING");
  assert.equal(baseball.structure.periodCount, 9);
  assert.equal(baseball.structure.clock, "NONE");
  assert.equal(baseball.scoring.drawsAllowed, false);
  for (const eventKey of ["SINGLE", "DOUBLE", "TRIPLE", "HOME_RUN", "STRIKEOUT", "WALK", "OUT", "RUN"]) {
    assert.ok(baseball.events.some((event) => event.key === eventKey), `baseball has ${eventKey}`);
  }
  // Baseball must NOT borrow the cricket innings/overs module: a run unit is not enough, it has no overs.
  const baseballModule = resolveScoringModule(baseball);
  assert.equal(baseballModule?.key, "BASEBALL_RUNS");

  const cricket = getSportDefinition("cricket");
  assert.ok(cricket, "cricket is registered");
  for (const eventKey of ["RUN", "WICKET", "EXTRAS_WIDE", "EXTRAS_NO_BALL", "FOUR", "SIX"]) {
    assert.ok(cricket.events.some((event) => event.key === eventKey), `cricket has ${eventKey}`);
  }
  assert.equal(resolveScoringModule(cricket)?.key, "CRICKET_RUNS");

  const flagRace = getSportDefinition("flag-race");
  assert.ok(flagRace, "flag race is registered");
  assert.equal(flagRace.key, "FLAG_RACE");
  assert.equal(flagRace.structure.clock, "COUNT_UP");
  for (const eventKey of ["START", "FINISH", "FALSE_START", "DISQUALIFICATION"]) {
    assert.ok(flagRace.events.some((event) => event.key === eventKey), `flag race has ${eventKey}`);
  }
  // Honest state: there is no race scoring module, so the console can only record events. This assertion exists so
  // that adding one later is a deliberate change, not an accident.
  assert.equal(resolveScoringModule(flagRace), null);
});