import assert from "node:assert/strict";
import test from "node:test";

// Placeholder so importing @/lib/prisma does not throw when the DB test is off.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

import { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import { buildAllFemaleTeamCompetitionConfig } from "../sport-config-admin";
import type { ParticipantInput } from "../validation";

const ENABLED = process.env.REGISTRATION_HOST_DB === "1";

function validTeam(suffix = "") {
  const participants: ParticipantInput[] = [];
  for (let index = 1; index <= 8; index += 1) {
    participants.push({
      clientId: `c${index}${suffix}`,
      fullName: `Child ${suffix}Number${index}`,
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
  return { teamName: `Falcons ${suffix}`.trim(), participants };
}

// The same contract the in-memory adapter passes, now exercised against the real
// Ultra League OS adapter on a migrated staging database. Creates a disposable
// organization + event + open form and removes everything in a finally block.
test("Ultra League OS adapter: full team-registration contract", { skip: !ENABLED }, async () => {
  const { prisma } = await import("@/lib/prisma");
  const { withOrganizationContext } = await import("@/lib/tenant-context");
  const { RegistrationValidationError } = await import("../service");
  const { UltraLeagueOsRegistrationHost } = await import("./ultra-league-os");

  const stamp = Date.now();
  const sport = await prisma.sport.findFirstOrThrow();
  const org = await prisma.organization.create({
    data: { name: `Reg DB Contract ${stamp}`, slug: `reg-db-contract-${stamp}`, idPrefixAthlete: `RC${stamp % 1000}`, idPrefixStaff: `RS${stamp % 1000}` },
  });
  const host = new UltraLeagueOsRegistrationHost();
  const slug = `reg-contract-${stamp}`;

  try {
    const ids = await withOrganizationContext(org.id, async (tx) => {
      const competition = await tx.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: "Contract League", slug: `contract-league-${stamp}` } });
      const season = await tx.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: "Contract Season", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "ACTIVE" } });
      const venue = await tx.venue.create({ data: { organizationId: org.id, name: "Contract Venue", address: "1 Test Way", city: "Lagos", capacity: 100 } });
      const event = await tx.event.create({
        data: { organizationId: org.id, name: "All-female Cup", slug, seasonId: season.id, venueId: venue.id, date: new Date(), startTime: new Date(), status: "PUBLISHED" },
      });
      const form = await tx.registrationForm.create({
        data: { organizationId: org.id, eventId: event.id, title: "Team registration", mode: "TEAM", status: "OPEN", publicEnabled: true, sports: ["VOLLEYBALL", "FLAG_RACE"], sportConfig: buildAllFemaleTeamCompetitionConfig() },
      });
      return { eventId: event.id, formId: form.id };
    });

    // Event organization/slug scoping (fail closed).
    assert.equal((await host.getEvent({ organizationId: org.id, slug }))?.id, ids.eventId);
    assert.equal(await host.getEvent({ organizationId: org.id, slug: "does-not-exist" }), null);
    assert.equal(await host.getEvent({ organizationId: `${org.id}-other`, slug }), null);

    // Config organization scoping.
    const config = await host.getRegistrationConfig({ organizationId: org.id, formId: ids.formId });
    assert.ok(config);
    assert.equal(config!.rosters.FLAG_RACE?.maxRoster, 6);
    assert.equal(await host.getRegistrationConfig({ organizationId: `${org.id}-other`, formId: ids.formId }), null);

    // Draft then submit; draft does not block the same children.
    const draft = await host.saveRegistrationSubmission({ organizationId: org.id, eventId: ids.eventId, formId: ids.formId, mode: "DRAFT", team: validTeam("A") });
    assert.equal(draft.status, RegistrationSubmissionStatus.DRAFT);
    assert.match(draft.referenceNumber, /^REG-/);
    const submitted = await host.saveRegistrationSubmission({ organizationId: org.id, eventId: ids.eventId, formId: ids.formId, mode: "SUBMIT", team: validTeam("A") });
    assert.equal(submitted.status, RegistrationSubmissionStatus.PENDING);

    // Active duplicate rejected (same children, same event).
    await assert.rejects(
      () => host.saveRegistrationSubmission({ organizationId: org.id, eventId: ids.eventId, formId: ids.formId, mode: "SUBMIT", team: validTeam("A") }),
      (error: unknown) => error instanceof RegistrationValidationError,
    );

    // Invalid roster rejected.
    const invalid = validTeam("B");
    invalid.participants = invalid.participants.filter((participant) => !participant.sportMemberships.some((membership) => membership.sport === "FLAG_RACE"));
    await assert.rejects(
      () => host.saveRegistrationSubmission({ organizationId: org.id, eventId: ids.eventId, formId: ids.formId, mode: "SUBMIT", team: invalid }),
      (error: unknown) => error instanceof RegistrationValidationError,
    );

    // Listing and reads scoped by organization/event.
    assert.equal((await host.listSubmissions({ organizationId: org.id })).length, 2);
    assert.equal((await host.listSubmissions({ organizationId: org.id, eventId: ids.eventId })).length, 2);
    assert.equal((await host.listSubmissions({ organizationId: `${org.id}-other` })).length, 0);
    assert.equal((await host.getSubmission({ organizationId: org.id, id: submitted.id }))?.id, submitted.id);
    assert.equal(await host.getSubmission({ organizationId: `${org.id}-other`, id: submitted.id }), null);
  } finally {
    await withOrganizationContext(org.id, async (tx) => {
      await tx.registrationParticipantSport.deleteMany({ where: { organizationId: org.id } });
      await tx.registrationParticipant.deleteMany({ where: { organizationId: org.id } });
      await tx.registrationSubmission.deleteMany({ where: { organizationId: org.id } });
      await tx.registrationForm.deleteMany({ where: { organizationId: org.id } });
      await tx.event.deleteMany({ where: { organizationId: org.id } });
      await tx.venue.deleteMany({ where: { organizationId: org.id } });
      await tx.season.deleteMany({ where: { organizationId: org.id } });
      await tx.competition.deleteMany({ where: { organizationId: org.id } });
    });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
