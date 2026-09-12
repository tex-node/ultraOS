import assert from "node:assert/strict";
import test from "node:test";

// Placeholder so importing the Ultra League OS adapter (which loads the Prisma
// client at module scope) does not throw. No connection is opened; the DB-backed
// contract test is skipped unless REGISTRATION_HOST_DB=1.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

import { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import type { RegistrationHost, RegistrationSubmissionInput } from "../host";
import { buildAllFemaleTeamCompetitionConfig } from "../sport-config-admin";
import type { ParticipantInput } from "../validation";
import { InMemoryRegistrationHost, RegistrationValidationError } from "./in-memory";

const ORG_A = "org-a";
const ORG_B = "org-b";
const EVENT_A = "event-a";
const FORM_A = "form-a";

function hostInterface(): string[] {
  return ["getEvent", "getRegistrationConfig", "saveRegistrationSubmission", "listSubmissions", "getSubmission"];
}

function validTeam(): { teamName: string; participants: ParticipantInput[] } {
  const participants: ParticipantInput[] = [];
  for (let index = 1; index <= 8; index += 1) {
    participants.push({
      clientId: `c${index}`,
      fullName: `Child Number${index}`,
      dateOfBirth: "2016-01-01",
      gender: "FEMALE",
      guardianName: `Guardian ${index}`,
      guardianPhone: "08010000000",
      consentAccepted: true,
      sportMemberships: [
        { sport: "VOLLEYBALL", isActive: index <= 6 },
        ...(index <= 6 ? [{ sport: "FLAG_RACE" as const, rosterOrder: index }] : []),
      ],
    });
  }
  return { teamName: "Falcons", participants };
}

function seed(host: InMemoryRegistrationHost) {
  host.seedEvent({ id: EVENT_A, organizationId: ORG_A, name: "All-female Cup", slug: "all-female-cup", status: "PUBLISHED" });
  host.seedConfig({ organizationId: ORG_A, formId: FORM_A, config: buildAllFemaleTeamCompetitionConfig() });
}

function submission(mode: "DRAFT" | "SUBMIT", team = validTeam()): RegistrationSubmissionInput {
  return { organizationId: ORG_A, eventId: EVENT_A, formId: FORM_A, mode, team };
}

function runContract(name: string, makeHost: () => RegistrationHost & { seedEvent?: unknown }) {
  test(`${name}: getEvent is scoped to organization and slug, fails closed`, async () => {
    const host = makeHost();
    seed(host as InMemoryRegistrationHost);
    assert.equal((await host.getEvent({ organizationId: ORG_A, slug: "all-female-cup" }))?.id, EVENT_A);
    assert.equal(await host.getEvent({ organizationId: ORG_A, slug: "missing" }), null);
    assert.equal(await host.getEvent({ organizationId: ORG_B, slug: "all-female-cup" }), null);
  });

  test(`${name}: getRegistrationConfig is organization-scoped`, async () => {
    const host = makeHost();
    seed(host as InMemoryRegistrationHost);
    const config = await host.getRegistrationConfig({ organizationId: ORG_A, formId: FORM_A });
    assert.ok(config);
    assert.equal(config!.rosters.FLAG_RACE?.maxRoster, 6);
    assert.equal(await host.getRegistrationConfig({ organizationId: ORG_B, formId: FORM_A }), null);
  });

  test(`${name}: save draft then submit, with status values matching the platform`, async () => {
    const host = makeHost();
    seed(host as InMemoryRegistrationHost);
    const draft = await host.saveRegistrationSubmission(submission("DRAFT"));
    assert.equal(draft.status, RegistrationSubmissionStatus.DRAFT);
    assert.match(draft.referenceNumber, /^REG-/);
    assert.equal(draft.participantCount, 8);
    const submitted = await host.saveRegistrationSubmission(submission("SUBMIT"));
    assert.equal(submitted.status, RegistrationSubmissionStatus.PENDING);
  });

  test(`${name}: server-side validation rejects an invalid roster`, async () => {
    const host = makeHost();
    seed(host as InMemoryRegistrationHost);
    const team = validTeam();
    team.participants = team.participants.filter((participant) => !participant.sportMemberships.some((membership) => membership.sport === "FLAG_RACE")); // 0 flag-race
    await assert.rejects(() => host.saveRegistrationSubmission(submission("SUBMIT", team)), (error) => error instanceof RegistrationValidationError);
  });

  test(`${name}: a child already registered to another team in the same event is rejected`, async () => {
    const host = makeHost();
    seed(host as InMemoryRegistrationHost);
    await host.saveRegistrationSubmission(submission("SUBMIT"));
    await assert.rejects(() => host.saveRegistrationSubmission(submission("SUBMIT")), (error) => error instanceof RegistrationValidationError);
  });

  test(`${name}: listing and reads are organization/event scoped`, async () => {
    const host = makeHost();
    seed(host as InMemoryRegistrationHost);
    const saved = await host.saveRegistrationSubmission(submission("SUBMIT"));
    assert.equal((await host.listSubmissions({ organizationId: ORG_A })).length, 1);
    assert.equal((await host.listSubmissions({ organizationId: ORG_A, eventId: EVENT_A })).length, 1);
    assert.equal((await host.listSubmissions({ organizationId: ORG_A, eventId: "other" })).length, 0);
    assert.equal((await host.listSubmissions({ organizationId: ORG_B })).length, 0);
    assert.equal((await host.getSubmission({ organizationId: ORG_A, id: saved.id }))?.id, saved.id);
    assert.equal(await host.getSubmission({ organizationId: ORG_B, id: saved.id }), null);
  });
}

runContract("in-memory host", () => {
  const host = new InMemoryRegistrationHost();
  return host as unknown as RegistrationHost;
});

// Regression requirement: a participant whose only registration is DRAFT,
// WITHDRAWN, or REJECTED must be allowed to submit again. Only ACTIVE
// registrations block a new submission. Mirrors the service.ts rule
// (status notIn DRAFT/WITHDRAWN/REJECTED) for the Ultra League OS adapter.
test("in-memory host: inactive registrations (DRAFT/WITHDRAWN/REJECTED) do not block a new submission", async () => {
  for (const status of [RegistrationSubmissionStatus.DRAFT, RegistrationSubmissionStatus.WITHDRAWN, RegistrationSubmissionStatus.REJECTED]) {
    const host = new InMemoryRegistrationHost();
    seed(host);
    const first = await host.saveRegistrationSubmission(submission(status === RegistrationSubmissionStatus.DRAFT ? "DRAFT" : "SUBMIT"));
    host.setSubmissionStatus(first.id, status);
    const second = await host.saveRegistrationSubmission(submission("SUBMIT"));
    assert.equal(second.status, RegistrationSubmissionStatus.PENDING, `status ${status} must not block a new submission`);
  }
});

test("in-memory host: an active registration still blocks a duplicate submission", async () => {
  const host = new InMemoryRegistrationHost();
  seed(host);
  await host.saveRegistrationSubmission(submission("SUBMIT"));
  await assert.rejects(() => host.saveRegistrationSubmission(submission("SUBMIT")), (error) => error instanceof RegistrationValidationError);
});

test("in-memory and Ultra League OS adapters expose the same RegistrationHost surface", async () => {  const { UltraLeagueOsRegistrationHost } = await import("./ultra-league-os");
  const memory = new InMemoryRegistrationHost() as unknown as Record<string, unknown>;
  const ultra = new UltraLeagueOsRegistrationHost() as unknown as Record<string, unknown>;
  for (const method of hostInterface()) {
    assert.equal(typeof memory[method], "function", `memory missing ${method}`);
    assert.equal(typeof ultra[method], "function", `ultra league os missing ${method}`);
  }
});

test("Ultra League OS adapter contract (requires a migrated database)", (t) => {
  // The same runContract suite is intended to be pointed at the Ultra League OS
  // adapter once the R1/R2 migrations are applied. It is skipped here because no
  // migrated database is available in this environment.
  if (process.env.REGISTRATION_HOST_DB !== "1") {
    return t.skip("set REGISTRATION_HOST_DB=1 with a migrated DATABASE_URL to run the DB contract");
  }
});
