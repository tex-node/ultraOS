import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationSport } from "@/generated/prisma/enums";
import {
  VOLLEYBALL_ROSTER,
  FLAG_RACE_ROSTER,
  buildAllFemaleTeamCompetitionConfig,
  sportConfigFormSchema,
  planSportConfigSeed,
  describeRoster,
} from "@/lib/registration/sport-config-admin";

test("presets match the confirmed competition rules", () => {
  assert.deepEqual(VOLLEYBALL_ROSTER, { minRoster: 8, maxRoster: 12, activeCount: 6, substitutesAllowed: true, orderRequired: false });
  assert.deepEqual(FLAG_RACE_ROSTER, { minRoster: 6, maxRoster: 6, activeCount: 6, substitutesAllowed: false, orderRequired: true });
  const config = buildAllFemaleTeamCompetitionConfig();
  assert.deepEqual(config.sports, [RegistrationSport.VOLLEYBALL, RegistrationSport.FLAG_RACE]);
  assert.equal(config.gender, "FEMALE");
  assert.equal(config.requireBothSports, true);
  assert.equal(config.dualParticipationAllowed, true);
  assert.equal(config.requireGuardianConsent, true);
  assert.equal(sportConfigFormSchema.safeParse(config).success, true);
});

test("planSportConfigSeed is idempotent and non-destructive", () => {
  const preset = buildAllFemaleTeamCompetitionConfig();
  const created = planSportConfigSeed(null, preset);
  assert.equal(created.action, "CREATE");
  const presetAgain = planSportConfigSeed(created.config, preset);
  assert.equal(presetAgain.action, "SKIP");

  const customized = { ...preset, maxAge: 14 };
  const preserved = planSportConfigSeed(customized, preset);
  assert.equal(preserved.action, "SKIP");
  assert.equal((preserved.config as { maxAge: number }).maxAge, 14);
  const overwritten = planSportConfigSeed(customized, preset, { overwrite: true });
  assert.equal(overwritten.action, "UPDATE");
  assert.equal(overwritten.config.maxAge, preset.maxAge);

  assert.equal(planSportConfigSeed({ sports: [] }, preset).action, "CREATE");
});

test("form schema rejects contradictory or rule-violating configurations", () => {
  const base = { sports: [RegistrationSport.FLAG_RACE], requireBothSports: false, rosters: { FLAG_RACE: { ...FLAG_RACE_ROSTER } } };
  const invalid = [
    { path: "min>max", value: { sports: [RegistrationSport.VOLLEYBALL], rosters: { VOLLEYBALL: { minRoster: 12, maxRoster: 8 } } } },
    { path: "active>max", value: { sports: [RegistrationSport.VOLLEYBALL], rosters: { VOLLEYBALL: { minRoster: 8, maxRoster: 12, activeCount: 13 } } } },
    { path: "flag subs", value: { ...base, rosters: { FLAG_RACE: { ...FLAG_RACE_ROSTER, substitutesAllowed: true } } } },
    { path: "flag size", value: { ...base, rosters: { FLAG_RACE: { ...FLAG_RACE_ROSTER, minRoster: 5, maxRoster: 7 } } } },
    { path: "flag order", value: { ...base, rosters: { FLAG_RACE: { ...FLAG_RACE_ROSTER, orderRequired: false } } } },
    { path: "missing roster", value: { sports: [RegistrationSport.VOLLEYBALL], rosters: {} } },
    { path: "requireBoth with one", value: { sports: [RegistrationSport.VOLLEYBALL], requireBothSports: true, rosters: { VOLLEYBALL: { ...VOLLEYBALL_ROSTER } } } },
  ];
  for (const entry of invalid) {
    assert.equal(sportConfigFormSchema.safeParse(entry.value).success, false, `expected rejection: ${entry.path}`);
  }
});

test("describeRoster summarizes limits for the admin summary", () => {
  assert.equal(describeRoster("VOLLEYBALL", VOLLEYBALL_ROSTER), "VOLLEYBALL: 8–12 athletes, 6 active, substitutes allowed");
  assert.equal(describeRoster("FLAG_RACE", FLAG_RACE_ROSTER), "FLAG_RACE: 6–6 athletes, 6 active, no substitutes, order required");
  assert.equal(describeRoster("VOLLEYBALL", undefined), "VOLLEYBALL: not configured");
});
