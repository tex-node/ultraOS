import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { TENNIS } from "@/lib/sports/tennis";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import {
  isIndividualSport,
  oppositeSide,
  requireSeasonClubId,
  sideEntrantId,
  sideLabel,
  sideSeasonClubId,
  type FixtureSideRefs,
} from "@/lib/sports/fixture-sides";

const teamFixture: FixtureSideRefs = {
  homeSeasonClubId: "sc-home",
  awaySeasonClubId: "sc-away",
  homeEntrantId: "e-home",
  awayEntrantId: "e-away",
};

test("side refs resolve per side", () => {
  assert.equal(sideSeasonClubId(teamFixture, "HOME"), "sc-home");
  assert.equal(sideSeasonClubId(teamFixture, "AWAY"), "sc-away");
  assert.equal(sideEntrantId(teamFixture, "HOME"), "e-home");
  assert.equal(sideEntrantId(teamFixture, "AWAY"), "e-away");
  assert.equal(oppositeSide("HOME"), "AWAY");
  assert.equal(oppositeSide("AWAY"), "HOME");
});

test("requireSeasonClubId guards team-only paths", () => {
  assert.equal(requireSeasonClubId(teamFixture, "HOME"), "sc-home");
  const individualOnly: FixtureSideRefs = {
    homeSeasonClubId: null,
    awaySeasonClubId: null,
    homeEntrantId: "e-home",
    awayEntrantId: "e-away",
  };
  assert.throws(() => requireSeasonClubId(individualOnly, "AWAY"), /FIXTURE_SIDE_MISSING_SEASON_CLUB/);
});

test("sideLabel prefers club short name, then name, then entrant", () => {
  assert.equal(sideLabel({ clubShortName: "APX", clubName: "Apex" }), "APX");
  assert.equal(sideLabel({ clubShortName: "  ", clubName: "Apex" }), "Apex");
  assert.equal(sideLabel({ entrantName: "Ada Okoro" }), "Ada Okoro");
  assert.equal(sideLabel({}), "TBD");
});

test("individual sports are detected from their entities", () => {
  assert.equal(isIndividualSport(TENNIS), true);
  assert.equal(isIndividualSport(BASKETBALL), false);
  assert.equal(isIndividualSport(VOLLEYBALL), false);
  assert.equal(isIndividualSport(null), false);
});
