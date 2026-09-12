import { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import type { RegistrationEvent, RegistrationHost, RegistrationRecord, RegistrationScope, RegistrationSubmissionInput } from "../host";
import { participantMatchKey } from "../normalization";
import { generateRegistrationReference } from "../reference";
import type { SportConfig } from "../sport-config";
import { validateTeamSubmission, type ValidationIssue } from "../validation";

export class RegistrationValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid registration.");
    this.name = "RegistrationValidationError";
    this.issues = issues;
  }
}

type StoredSubmission = {
  record: RegistrationRecord;
  participants: { fullName: string; dateOfBirth: string | null }[];
};

// In-memory adapter: lets the registration module run and be tested with NO
// database, while preserving the same shape/status values the Ultra League OS
// adapter uses. Events/configs are seeded explicitly (no hardcoded ids).
export class InMemoryRegistrationHost implements RegistrationHost {
  private events: RegistrationEvent[] = [];
  private configs = new Map<string, { organizationId: string; config: SportConfig }>();
  private submissions: StoredSubmission[] = [];
  private sequence = 0;

  seedEvent(event: RegistrationEvent): void {
    this.events.push(event);
  }

  seedConfig(input: { organizationId: string; formId: string; config: SportConfig }): void {
    this.configs.set(input.formId, { organizationId: input.organizationId, config: input.config });
  }

  async getEvent({ organizationId, slug }: { organizationId: string; slug: string }): Promise<RegistrationEvent | null> {
    return this.events.find((event) => event.organizationId === organizationId && event.slug === slug) ?? null;
  }

  async getRegistrationConfig({ organizationId, formId }: { organizationId: string; formId: string }): Promise<SportConfig | null> {
    const stored = this.configs.get(formId);
    return stored && stored.organizationId === organizationId ? stored.config : null;
  }

  async saveRegistrationSubmission(input: RegistrationSubmissionInput): Promise<RegistrationRecord> {
    const event = this.events.find((candidate) => candidate.id === input.eventId && candidate.organizationId === input.organizationId);
    if (!event) throw new RegistrationValidationError([{ path: "eventId", code: "EVENT_NOT_FOUND", message: "Event not found for this organization." }]);
    const stored = this.configs.get(input.formId);
    if (!stored || stored.organizationId !== input.organizationId) {
      throw new RegistrationValidationError([{ path: "formId", code: "FORM_NOT_FOUND", message: "Registration form not found for this organization." }]);
    }

    const existingMatchKeys = new Set<string>();
    const inactiveStatuses: RegistrationSubmissionStatus[] = [
      RegistrationSubmissionStatus.DRAFT,
      RegistrationSubmissionStatus.WITHDRAWN,
      RegistrationSubmissionStatus.REJECTED,
    ];
    for (const submission of this.submissions) {
      if (submission.record.organizationId !== input.organizationId || submission.record.eventId !== input.eventId) continue;
      if (inactiveStatuses.includes(submission.record.status)) continue;
      for (const participant of submission.participants) {
        const key = participantMatchKey(participant.fullName, participant.dateOfBirth);
        if (key) existingMatchKeys.add(key);
      }
    }

    const result = validateTeamSubmission(input.team, {
      config: stored.config,
      requireCompleteRosters: input.mode === "SUBMIT",
      existingMatchKeys,
    });
    if (!result.valid) throw new RegistrationValidationError(result.errors);

    this.sequence += 1;
    const record: RegistrationRecord = {
      id: `mem-${this.sequence}`,
      organizationId: input.organizationId,
      eventId: input.eventId,
      formId: input.formId,
      referenceNumber: generateRegistrationReference(),
      status: input.mode === "DRAFT" ? RegistrationSubmissionStatus.DRAFT : RegistrationSubmissionStatus.PENDING,
      teamName: input.team.teamName ?? null,
      participantCount: input.team.participants.length,
    };
    this.submissions.push({
      record,
      participants: input.team.participants.map((participant) => ({ fullName: participant.fullName, dateOfBirth: participant.dateOfBirth ?? null })),
    });
    return record;
  }

  async listSubmissions(scope: RegistrationScope): Promise<RegistrationRecord[]> {
    return this.submissions
      .filter((submission) => submission.record.organizationId === scope.organizationId && (!scope.eventId || submission.record.eventId === scope.eventId))
      .map((submission) => submission.record);
  }

  async getSubmission({ organizationId, id }: { organizationId: string; id: string }): Promise<RegistrationRecord | null> {
    return this.submissions.find((submission) => submission.record.organizationId === organizationId && submission.record.id === id)?.record ?? null;
  }
}
