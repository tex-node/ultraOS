import { test } from "node:test";
import assert from "node:assert/strict";
import { changedSquadRows, hasUsableHeight, hasUsablePosition, heightField, parseSquadSetup, positionField, squadNeedsPositions } from "./squad-setup";
import { coachingPageDecision } from "./page-access";
import type { CoachingViewer } from "./access";

test("placeholders are not usable: 'Unknown' position and 0 cm height", () => {
  assert.equal(hasUsablePosition("Unknown"), false);
  assert.equal(hasUsablePosition(""), false);
  assert.equal(hasUsablePosition("PG"), true);
  assert.equal(hasUsableHeight(0), false);
  assert.equal(hasUsableHeight(139), false);
  assert.equal(hasUsableHeight(140), true);
  assert.equal(hasUsableHeight(230), true);
  assert.equal(hasUsableHeight(231), false);
});

test("banner shows only while MORE than half the squad has no usable position", () => {
  const mk = (positions: string[]) => positions.map((position) => ({ position }));
  assert.equal(squadNeedsPositions(mk(["Unknown", "Unknown", "PG"])), true);
  assert.equal(squadNeedsPositions(mk(["Unknown", "PG"])), false, "exactly half is not more than half");
  assert.equal(squadNeedsPositions(mk(["PG", "SG", "C"])), false);
  assert.equal(squadNeedsPositions([]), false);
});

test("parse accepts the five positions and 140-230 cm, treats blanks as unchanged", () => {
  const ok = parseSquadSetup({ [positionField("a")]: "PG", [heightField("a")]: "182", [positionField("b")]: "", [heightField("b")]: "" }, ["a", "b"]);
  assert.deepEqual(ok, { ok: true, rows: [{ playerId: "a", position: "PG", heightCm: 182 }, { playerId: "b", position: null, heightCm: null }] });
});

test("parse rejects positions outside the list and heights outside 140-230", () => {
  const bad = parseSquadSetup({ [positionField("a")]: "Striker", [heightField("a")]: "250", [heightField("b")]: "12.5", [positionField("c")]: "C", [heightField("c")]: "205" }, ["a", "b", "c"]);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.errors.a.position!, /PG, SG, SF, PF, C/);
    assert.match(bad.errors.a.heightCm!, /140-230/);
    assert.match(bad.errors.b.heightCm!, /140-230/);
    assert.equal(bad.errors.c, undefined);
  }
});

test("parse ignores player ids that are not on the club's roster", () => {
  const r = parseSquadSetup({ [positionField("intruder")]: "PG", [positionField("a")]: "SG" }, ["a"]);
  assert.deepEqual(r, { ok: true, rows: [{ playerId: "a", position: "SG", heightCm: null }] });
});

test("only rows that change something are written", () => {
  const current = new Map([["a", { position: "Unknown", heightCm: 0 }], ["b", { position: "PG", heightCm: 180 }]]);
  const rows = [
    { playerId: "a", position: "PG", heightCm: null },
    { playerId: "b", position: "PG", heightCm: 180 },
    { playerId: "ghost", position: "C", heightCm: 200 },
  ];
  assert.deepEqual(changedSquadRows(rows, current).map((r) => r.playerId), ["a"]);
});

const coach: CoachingViewer = { email: "c@example.test", roleAssignments: [], coachedSeasonClubs: [{ seasonClubId: "sc1", organizationId: "o1" }] };
const scope = (seasonClubId: string) => ({ organizationId: "o1", seasonClubId });

test("page access: flag off, anonymous, unknown club and another club's coach all look like NOT_FOUND", () => {
  assert.equal(coachingPageDecision({ flagEnabled: true, viewer: coach, scope: scope("sc1") }), "CLUB_COACH");
  assert.equal(coachingPageDecision({ flagEnabled: false, viewer: coach, scope: scope("sc1") }), "NOT_FOUND");
  assert.equal(coachingPageDecision({ flagEnabled: true, viewer: null, scope: scope("sc1") }), "NOT_FOUND");
  assert.equal(coachingPageDecision({ flagEnabled: true, viewer: coach, scope: null }), "NOT_FOUND");
  assert.equal(coachingPageDecision({ flagEnabled: true, viewer: coach, scope: scope("sc2") }), "NOT_FOUND");
  const superAdmin: CoachingViewer = { email: "s@example.test", roleAssignments: [{ role: "SUPER_ADMIN", organizationId: null }], coachedSeasonClubs: [] };
  assert.equal(coachingPageDecision({ flagEnabled: false, viewer: superAdmin, scope: scope("sc1") }), "NOT_FOUND", "the flag gates everyone, including super admins");
});
