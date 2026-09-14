import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationSport } from "@/generated/prisma/enums";
import { buildAllFemaleTeamCompetitionConfig } from "@/lib/registration/sport-config-admin";
import {
  configuredSports,
  registrationSportDefinition,
  registrationSportFromSlug,
  registrationSportLabel,
  registrationSportSlug,
} from "@/lib/registration/sport-identity";

test("registration sport slugs map and round-trip", () => {
  assert.equal(registrationSportSlug(RegistrationSport.VOLLEYBALL), "volleyball");
  assert.equal(registrationSportSlug(RegistrationSport.FLAG_RACE), "flag-race");
  assert.equal(registrationSportFromSlug("volleyball"), RegistrationSport.VOLLEYBALL);
  assert.equal(registrationSportFromSlug("flag-race"), RegistrationSport.FLAG_RACE);
  assert.equal(registrationSportFromSlug("nope"), null);
});

test("registered and unregistered sports resolve predictably", () => {
  assert.equal(registrationSportDefinition(RegistrationSport.VOLLEYBALL)?.key, "VOLLEYBALL");
  assert.equal(registrationSportDefinition(RegistrationSport.FLAG_RACE), null);
  assert.equal(registrationSportLabel(RegistrationSport.VOLLEYBALL), "Volleyball");
  assert.equal(registrationSportLabel(RegistrationSport.FLAG_RACE), "Flag Race");
});

test("configuredSports resolves definitions and rosters from a config", () => {
  const config = buildAllFemaleTeamCompetitionConfig();
  const configured = configuredSports(config);
  assert.equal(configured.length, 2);

  const volleyball = configured.find((entry) => entry.sport === RegistrationSport.VOLLEYBALL)!;
  assert.equal(volleyball.definition?.key, "VOLLEYBALL");
  assert.equal(volleyball.roster?.minRoster, 8);

  const flagRace = configured.find((entry) => entry.sport === RegistrationSport.FLAG_RACE)!;
  assert.equal(flagRace.definition, null);
  assert.equal(flagRace.roster?.minRoster, 6);
});
