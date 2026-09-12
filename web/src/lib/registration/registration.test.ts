import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationSport } from "@/generated/prisma/enums";
import { normalizeName, normalizeDateOfBirth, participantMatchKey } from "@/lib/registration/normalization";
import { generateRegistrationReference, createWithReference, isReferenceConflict } from "@/lib/registration/reference";
import { parseSportConfig, SportConfigError, ageInYears } from "@/lib/registration/sport-config";
import {
  validateFieldAnswers,
  validateTeamSubmission,
  type ParticipantInput,
  type RegistrationFieldDef,
} from "@/lib/registration/validation";

const NOW = new Date("2026-09-12T00:00:00.000Z");

function config(overrides: Record<string, unknown> = {}) {
  return parseSportConfig({
    sports: [RegistrationSport.VOLLEYBALL, RegistrationSport.FLAG_RACE],
    requireBothSports: true,
    dualParticipationAllowed: true,
    minAge: 6,
    maxAge: 12,
    requireGuardianConsent: true,
    gender: "FEMALE",
    rosters: {
      VOLLEYBALL: { minRoster: 8, maxRoster: 12, activeCount: 6, substitutesAllowed: true, orderRequired: false },
      FLAG_RACE: { minRoster: 6, maxRoster: 6, activeCount: 6, substitutesAllowed: false, orderRequired: true },
    },
    ...overrides,
  });
}

function child(index: number, sports: { sport: RegistrationSport; rosterOrder?: number; isActive?: boolean }[]): ParticipantInput {
  return {
    clientId: `c${index}`,
    fullName: `Child Number${index}`,
    dateOfBirth: "2016-01-01",
    gender: "FEMALE",
    guardianName: `Guardian ${index}`,
    guardianPhone: "08010000000",
    consentAccepted: true,
    sportMemberships: sports,
  };
}

function validTeam(): ParticipantInput[] {
  const participants: ParticipantInput[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const memberships: { sport: RegistrationSport; rosterOrder?: number; isActive?: boolean }[] = [
      { sport: RegistrationSport.VOLLEYBALL, isActive: i <= 6 },
    ];
    if (i <= 6) memberships.push({ sport: RegistrationSport.FLAG_RACE, rosterOrder: i });
    participants.push(child(i, memberships));
  }
  return participants;
}

test("normalizeName collapses case, punctuation and spacing", () => {
  assert.equal(normalizeName("  Adá   O'Neil "), "ada o neil");
  assert.equal(normalizeName("ADA-ONEIL"), "ada oneil");
});

test("participantMatchKey requires a name and a valid date of birth", () => {
  assert.equal(participantMatchKey("Ada Obi", "2016-05-01"), "ada obi|2016-05-01");
  assert.equal(participantMatchKey("Ada Obi", null), null);
  assert.equal(participantMatchKey("", "2016-05-01"), null);
  assert.equal(normalizeDateOfBirth("not-a-date"), null);
});

test("ageInYears handles month/day boundaries", () => {
  assert.equal(ageInYears("2016-09-11", NOW), 10);
  assert.equal(ageInYears("2016-09-13", NOW), 9);
  assert.equal(ageInYears("2016-09-12", NOW), 10);
});

test("reference format is stable and injected entropy is deterministic", () => {
  const fixed = generateRegistrationReference(() => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.match(fixed, /^REG-[A-Z2-9]{10}$/);
  assert.equal(fixed, generateRegistrationReference(() => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7])));
});

test("createWithReference retries only on P2002 and then succeeds", async () => {
  let attempts = 0;
  const conflict = Object.assign(new Error("unique"), { code: "P2002" });
  const result = await createWithReference(async (reference) => {
    attempts += 1;
    if (attempts < 3) throw conflict;
    return reference;
  });
  assert.equal(attempts, 3);
  assert.match(result, /^REG-/);
  assert.equal(isReferenceConflict(conflict), true);
  await assert.rejects(
    () => createWithReference(async () => { throw new Error("boom"); }),
    /boom/,
  );
});

test("parseSportConfig applies defaults and rejects invalid ranges", () => {
  const parsed = parseSportConfig({ sports: [RegistrationSport.VOLLEYBALL] });
  assert.equal(parsed.dualParticipationAllowed, true);
  assert.equal(parsed.gender, "FEMALE");
  assert.throws(() => parseSportConfig({ sports: [RegistrationSport.VOLLEYBALL], rosters: { VOLLEYBALL: { minRoster: 8, maxRoster: 4 } } }), SportConfigError);
});

test("a valid all-female dual-sport team passes", () => {
  const result = validateTeamSubmission({ teamName: "Falcons", participants: validTeam() }, { config: config(), now: NOW, requireCompleteRosters: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("age and gender ineligibility are rejected", () => {
  const participants = validTeam();
  participants[0].dateOfBirth = "2010-01-01";
  participants[1].gender = "MALE";
  const result = validateTeamSubmission({ teamName: "Falcons", participants }, { config: config(), now: NOW, requireCompleteRosters: true });
  assert.ok(result.errors.some((issue) => issue.code === "AGE_INELIGIBLE"));
  assert.ok(result.errors.some((issue) => issue.code === "GENDER_INELIGIBLE"));
});

test("dual participation can be disallowed by configuration", () => {
  const result = validateTeamSubmission({ teamName: "Falcons", participants: validTeam() }, { config: config({ dualParticipationAllowed: false }), now: NOW, requireCompleteRosters: true });
  assert.ok(result.errors.some((issue) => issue.code === "DUAL_NOT_ALLOWED"));
});

test("roster size, race order, and active-count rules are enforced", () => {
  const participants = validTeam();
  participants.find((participant) => participant.clientId === "c1")!.sportMemberships.find((membership) => membership.sport === RegistrationSport.VOLLEYBALL)!.isActive = false;
  participants.find((participant) => participant.clientId === "c3")!.sportMemberships.find((membership) => membership.sport === RegistrationSport.FLAG_RACE)!.rosterOrder = 1;
  const result = validateTeamSubmission({ teamName: "Falcons", participants }, { config: config(), now: NOW, requireCompleteRosters: true });
  assert.ok(result.errors.some((issue) => issue.code === "ORDER_DUPLICATE"));
  assert.ok(result.errors.some((issue) => issue.code === "ACTIVE_COUNT"));
});

test("guardian consent is required for every child", () => {
  const participants = validTeam();
  participants[0].consentAccepted = false;
  participants[0].guardianName = "";
  const result = validateTeamSubmission({ teamName: "Falcons", participants }, { config: config(), now: NOW, requireCompleteRosters: true });
  assert.ok(result.errors.some((issue) => issue.code === "CONSENT_REQUIRED"));
  assert.ok(result.errors.some((issue) => issue.code === "GUARDIAN_REQUIRED"));
});

test("duplicates within a submission and across the event are flagged", () => {
  const participants = validTeam();
  const clone = { ...child(99, [{ sport: RegistrationSport.VOLLEYBALL }]), fullName: "child number1", dateOfBirth: "2016-01-01" };
  participants.push(clone);
  const existing = new Set([participantMatchKey("Child Number2", "2016-01-01")!]);
  const result = validateTeamSubmission({ teamName: "Falcons", participants }, { config: config(), now: NOW, requireCompleteRosters: true, existingMatchKeys: existing });
  assert.ok(result.errors.some((issue) => issue.code === "DUPLICATE_IN_SUBMISSION"));
  assert.ok(result.errors.some((issue) => issue.code === "DUPLICATE_IN_EVENT"));
});

test("flag race substitutes are rejected when disallowed", () => {
  const participants = validTeam();
  participants[7].sportMemberships.push({ sport: RegistrationSport.FLAG_RACE, rosterOrder: 7 });
  const result = validateTeamSubmission({ teamName: "Falcons", participants }, { config: config(), now: NOW, requireCompleteRosters: true });
  assert.ok(result.errors.some((issue) => issue.code === "ROSTER_TOO_LARGE" || issue.code === "SUBSTITUTES_NOT_ALLOWED"));
});

test("draft mode relaxes completeness to warnings", () => {
  const partial = [child(1, [{ sport: RegistrationSport.VOLLEYBALL, isActive: true }])];
  const result = validateTeamSubmission({ teamName: "Falcons", participants: partial }, { config: config(), now: NOW, requireCompleteRosters: false });
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((issue) => issue.code === "ROSTER_INCOMPLETE"));
});

test("field answers validate required, type, options and conditional visibility", () => {
  const fields: RegistrationFieldDef[] = [
    { key: "email", label: "Email", type: "EMAIL", scope: "SUBMISSION", required: true },
    { key: "category", label: "Category", type: "SELECT", scope: "SUBMISSION", required: true, options: ["A", "B"] },
    { key: "isMinor", label: "Is minor", type: "CHECKBOX", scope: "PARTICIPANT", required: false },
    { key: "guardian", label: "Guardian", type: "TEXT", scope: "PARTICIPANT", required: true, conditionalOn: { key: "isMinor", equals: true } },
  ];
  const missing = validateFieldAnswers(fields, {}, "SUBMISSION");
  assert.ok(missing.some((issue) => issue.code === "REQUIRED"));
  const invalid = validateFieldAnswers(fields, { email: "nope", category: "Z" }, "SUBMISSION");
  assert.ok(invalid.some((issue) => issue.code === "INVALID_EMAIL"));
  assert.ok(invalid.some((issue) => issue.code === "INVALID_OPTION"));
  const hiddenGuardian = validateFieldAnswers(fields, { isMinor: false }, "PARTICIPANT");
  assert.deepEqual(hiddenGuardian, []);
  const shownGuardian = validateFieldAnswers(fields, { isMinor: true }, "PARTICIPANT");
  assert.ok(shownGuardian.some((issue) => issue.path === "guardian"));
});
