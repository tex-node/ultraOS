import { withOrganizationContext } from "@/lib/tenant-context";
import type { RegistrationEvent, RegistrationHost, RegistrationRecord, RegistrationScope, RegistrationSubmissionInput } from "../host";
import { parseSportConfig, type SportConfig } from "../sport-config";
import { createTeamRegistration, getRegistration, listRegistrations } from "../service";

// Ultra League OS adapter: delegates to the existing tenant-scoped service
// layer. Every read/write runs inside withOrganizationContext(), so the same
// organization/event isolation applies. Requires the R1/R2 migrations to be
// applied to the target database (unlike the in-memory adapter).
export class UltraLeagueOsRegistrationHost implements RegistrationHost {
  async getEvent({ organizationId, slug }: { organizationId: string; slug: string }): Promise<RegistrationEvent | null> {
    return withOrganizationContext(organizationId, async (tx) => {
      const event = await tx.event.findFirst({
        where: { organizationId, slug, status: "PUBLISHED" },
        select: { id: true, organizationId: true, name: true, slug: true, status: true },
      });
      return event ?? null;
    });
  }

  async getRegistrationConfig({ organizationId, formId }: { organizationId: string; formId: string }): Promise<SportConfig | null> {
    return withOrganizationContext(organizationId, async (tx) => {
      const form = await tx.registrationForm.findFirst({ where: { id: formId, organizationId }, select: { sportConfig: true } });
      return form ? parseSportConfig(form.sportConfig) : null;
    });
  }

  async saveRegistrationSubmission(input: RegistrationSubmissionInput): Promise<RegistrationRecord> {
    const submission = await createTeamRegistration({
      organizationId: input.organizationId,
      formId: input.formId,
      eventId: input.eventId,
      mode: input.mode,
      applicantUserId: input.applicantUserId,
      actorUserId: input.actorUserId,
      team: input.team,
      submissionAnswers: input.submissionAnswers,
    });
    return {
      id: submission.id,
      organizationId: submission.organizationId,
      eventId: submission.eventId,
      formId: submission.formId,
      referenceNumber: submission.referenceNumber,
      status: submission.status,
      teamName: submission.teamName,
      participantCount: submission.participants.length,
    };
  }

  async listSubmissions(scope: RegistrationScope): Promise<RegistrationRecord[]> {
    const rows = await listRegistrations(scope.organizationId);
    return rows
      .filter((row) => !scope.eventId || row.eventId === scope.eventId)
      .map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        eventId: row.eventId,
        formId: row.formId,
        referenceNumber: row.referenceNumber,
        status: row.status,
        teamName: row.teamName,
        participantCount: row._count.participants,
      }));
  }

  async getSubmission({ organizationId, id }: { organizationId: string; id: string }): Promise<RegistrationRecord | null> {
    const registration = await getRegistration(organizationId, id);
    if (!registration) return null;
    return {
      id: registration.id,
      organizationId: registration.organizationId,
      eventId: registration.eventId,
      formId: registration.formId,
      referenceNumber: registration.referenceNumber,
      status: registration.status,
      teamName: registration.teamName,
      participantCount: registration.participants.length,
    };
  }
}
