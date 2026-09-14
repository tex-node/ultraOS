import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { FOOTBALL } from "@/lib/sports/football";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { validateSportDefinition } from "@/lib/sports/registry";
import {
  getSportValidator,
  hasBlockingIssue,
  isKnownValidator,
  runConstraints,
} from "@/lib/sports/validators";
import type { SportDefinition } from "@/lib/sports/types";

test("basketball blocks a player who has reached five fouls", () => {
  const blocked = runConstraints(BASKETBALL, "LINEUP", { player: { isActive: true, fouls: 5 } });
  assert.equal(hasBlockingIssue(blocked), true);
  assert.ok(blocked.some((result) => result.issue?.includes("fouls")));

  const allowed = runConstraints(BASKETBALL, "LINEUP", { player: { isActive: true, fouls: 4 } });
  assert.equal(hasBlockingIssue(allowed), false);
});

test("basketball requires an active player to record an event", () => {
  const blocked = runConstraints(BASKETBALL, "EVENT", {
    event: { typeKey: "SHOT_MADE", hasActor: true },
    player: { isActive: false },
  });
  assert.equal(hasBlockingIssue(blocked), true);

  const allowed = runConstraints(BASKETBALL, "EVENT", {
    event: { typeKey: "SHOT_MADE", hasActor: true },
    player: { isActive: true },
  });
  assert.equal(hasBlockingIssue(allowed), false);
});

test("scoring events require an actor across sports", () => {
  const missingActor = runConstraints(FOOTBALL, "EVENT", { event: { typeKey: "GOAL", hasActor: false } });
  assert.equal(hasBlockingIssue(missingActor), true);

  const withActor = runConstraints(FOOTBALL, "EVENT", { event: { typeKey: "GOAL", hasActor: true } });
  assert.equal(hasBlockingIssue(withActor), false);

  // A non-scoring event does not require an actor.
  const nonScoring = runConstraints(BASKETBALL, "EVENT", { event: { typeKey: "TIMEOUT", hasActor: false } });
  assert.equal(hasBlockingIssue(nonScoring), false);
});

test("volleyball preserves service rotation order and substitution limits", () => {
  const mismatch = runConstraints(VOLLEYBALL, "LINEUP", {
    lineup: { rotationOrder: ["p1", "p2", "p3"], expectedRotationOrder: ["p1", "p3", "p2"] },
  });
  assert.equal(hasBlockingIssue(mismatch), true);

  const match = runConstraints(VOLLEYBALL, "LINEUP", {
    lineup: { rotationOrder: ["p1", "p2", "p3"], expectedRotationOrder: ["p1", "p2", "p3"] },
  });
  assert.equal(hasBlockingIssue(match), false);

  const exhausted = runConstraints(VOLLEYBALL, "EVENT", {
    lineup: { substitutionsUsed: 6, substitutionsAllowed: 6 },
  });
  assert.equal(hasBlockingIssue(exhausted), true);
});

test("football blocks a sent-off player", () => {
  const blocked = runConstraints(FOOTBALL, "LINEUP", { player: { redCard: true } });
  assert.equal(hasBlockingIssue(blocked), true);
  assert.equal(hasBlockingIssue(runConstraints(FOOTBALL, "LINEUP", { player: { redCard: false } })), false);
});

test("WARN constraints report an issue without blocking", () => {
  const warningOnly: SportDefinition = {
    ...VOLLEYBALL,
    constraints: [
      { key: "VOLLEYBALL_MAX_SUBSTITUTIONS", label: "Substitution limit (advisory)", context: "EVENT", severity: "WARN" },
    ],
  };
  const results = runConstraints(warningOnly, "EVENT", {
    lineup: { substitutionsUsed: 6, substitutionsAllowed: 6 },
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].blocks, false);
  assert.equal(hasBlockingIssue(results), false);
});

test("an unregistered validator key is a blocking issue and fails definition validation", () => {
  const broken: SportDefinition = {
    ...BASKETBALL,
    constraints: [{ key: "NOT_A_VALIDATOR", label: "bogus", context: "EVENT", severity: "BLOCK" }],
  };
  const results = runConstraints(broken, "EVENT", {});
  assert.equal(hasBlockingIssue(results), true);
  assert.ok(results[0].issue?.includes("No validator registered"));
  assert.ok(validateSportDefinition(broken).some((issue) => issue.includes("no registered validator")));
});

test("runConstraints only runs constraints for the requested context", () => {
  const eventResults = runConstraints(BASKETBALL, "EVENT", {});
  assert.ok(eventResults.every((result) => result.constraint.context === "EVENT"));
  const lineupResults = runConstraints(BASKETBALL, "LINEUP", {});
  assert.ok(lineupResults.every((result) => result.constraint.context === "LINEUP"));

  assert.equal(isKnownValidator("BASKETBALL_PLAYER_FOUL_LIMIT"), true);
  assert.equal(isKnownValidator("NOT_A_VALIDATOR"), false);
  assert.equal(getSportValidator("NOT_A_VALIDATOR"), null);
});
