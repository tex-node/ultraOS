import type { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import type { SportConfig } from "./sport-config";
import type { TeamSubmissionInput } from "./validation";

// The narrow service boundary the registration experience talks to. UI/actions
// depend on this port, never on Prisma or the Ultra League OS service directly.
// getRegistrationHost() returns the database-backed Ultra League OS adapter.

export type RegistrationEvent = {
  id: string;
  organizationId: string;
  name: string;
  slug: string | null;
  status: string;
};

export type RegistrationScope = {
  organizationId: string;
  eventId?: string;
};

export type RegistrationSubmissionInput = {
  organizationId: string;
  eventId: string;
  formId: string;
  mode: "DRAFT" | "SUBMIT";
  applicantUserId?: string | null;
  actorUserId?: string | null;
  team: TeamSubmissionInput;
  submissionAnswers?: Record<string, unknown>;
};

export type RegistrationRecord = {
  id: string;
  organizationId: string;
  eventId: string;
  formId: string;
  referenceNumber: string;
  status: RegistrationSubmissionStatus;
  teamName: string | null;
  participantCount: number;
};

export interface RegistrationHost {
  /** Resolve a published event by organization + slug (fails closed). */
  getEvent(input: { organizationId: string; slug: string }): Promise<RegistrationEvent | null>;
  /** Read the validated sport configuration for a form, scoped to the organization. */
  getRegistrationConfig(input: { organizationId: string; formId: string }): Promise<SportConfig | null>;
  /** Persist a draft or final team registration (server validates + stamps provenance). */
  saveRegistrationSubmission(input: RegistrationSubmissionInput): Promise<RegistrationRecord>;
  /** List submissions scoped to an organization (and optionally one event). */
  listSubmissions(scope: RegistrationScope): Promise<RegistrationRecord[]>;
  /** Read one submission by id, scoped to the organization (null if not visible). */
  getSubmission(input: { organizationId: string; id: string }): Promise<RegistrationRecord | null>;
}
