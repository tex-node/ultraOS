import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTeamEntrantFields,
  entrantLabel,
  entrantMemberRule,
  isMemberCountValid,
} from "@/lib/entrant";

test("entrant member cardinality matches each type", () => {
  assert.deepEqual(entrantMemberRule("INDIVIDUAL"), { min: 1, max: 1 });
  assert.deepEqual(entrantMemberRule("PAIR"), { min: 2, max: 2 });
  assert.deepEqual(entrantMemberRule("RELAY"), { min: 2, max: null });
  assert.deepEqual(entrantMemberRule("TEAM"), { min: 1, max: null });
});

test("isMemberCountValid enforces cardinality", () => {
  assert.equal(isMemberCountValid("INDIVIDUAL", 1), true);
  assert.equal(isMemberCountValid("INDIVIDUAL", 2), false);
  assert.equal(isMemberCountValid("PAIR", 2), true);
  assert.equal(isMemberCountValid("PAIR", 1), false);
  assert.equal(isMemberCountValid("RELAY", 12), true);
  assert.equal(isMemberCountValid("RELAY", 1), false);
  assert.equal(isMemberCountValid("TEAM", 1), true);
  assert.equal(isMemberCountValid("TEAM", 15), true);
});

test("buildTeamEntrantFields copies club branding and carries season context", () => {
  const fields = buildTeamEntrantFields({
    organizationId: "org-1",
    competitionId: "comp-1",
    seasonId: "season-1",
    divisionId: "div-1",
    seasonClubId: "sc-1",
    club: {
      name: "APEX",
      shortName: "APX",
      logoUrl: "https://example.test/apex.png",
      primaryColor: "#ff0000",
      secondaryColor: "#000000",
    },
  });
  assert.equal(fields.type, "TEAM");
  assert.equal(fields.status, "ACTIVE");
  assert.equal(fields.seasonClubId, "sc-1");
  assert.equal(fields.competitionId, "comp-1");
  assert.equal(fields.name, "APEX");
  assert.equal(fields.shortName, "APX");
  assert.equal(fields.primaryColor, "#ff0000");
  assert.equal(fields.secondaryColor, "#000000");
});

test("entrantLabel prefers a non-empty short name", () => {
  assert.equal(entrantLabel({ name: "APEX", shortName: "APX" }), "APX");
  assert.equal(entrantLabel({ name: "APEX", shortName: "   " }), "APEX");
  assert.equal(entrantLabel({ name: "APEX", shortName: null }), "APEX");
  assert.equal(entrantLabel({ name: "APEX" }), "APEX");
});
