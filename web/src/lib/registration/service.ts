import { Prisma } from "@/generated/prisma/client";
import { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "@/lib/tenant-context";
import { assertSameOrganization } from "@/lib/authorization";
import { participantMatchKey } from "./normalization";
import { createWithReference } from "./reference";
import { parseSportConfig } from "./sport-config";
import { validateTeamSubmission, type ParticipantInput, type TeamSubmissionInput, type ValidationIssue } from "./validation";

export class RegistrationNotFoundError extends Error {
  constructor() {
    super("Registration not found.");
    this.name = "RegistrationNotFoundError";
  }
}

export class RegistrationValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid registration.");
    this.name = "RegistrationValidationError";
    this.issues = issues;
  }
}

// Public: resolve the org from the route slug, then the event + open form inside
// tenant context. Fails closed for unknown/inactive org, missing/unpublished
// event, disabled/closed form, or a closed window.
export async function loadPublicRegistration(organizationSlug: string, eventSlug: string) {
  const organization = await resolveActiveOrganizationBySlug(organizationSlug);
  return withOrganizationContext(organization.id, async (tx) => {
    const event = await tx.event.findFirst({ where: { organizationId: organization.id, slug: eventSlug, status: "PUBLISHED" } });
    if (!event) return null;
    const form = await tx.registrationForm.findFirst({ where: { organizationId: organization.id, eventId: event.id, publicEnabled: true, status: "OPEN" }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
    if (!form) return null;
    const now = new Date();
    const closed = (form.opensAt && now < form.opensAt) || (form.closesAt && now > form.closesAt);
    const soldOut = form.capacity !== null && (await tx.registrationSubmission.count({ where: { formId: form.id, status: { notIn: [RegistrationSubmissionStatus.DRAFT, RegistrationSubmissionStatus.WITHDRAWN] } } })) >= form.capacity;
    return { organization, event, form, accepting: !closed && !soldOut };
  });
}

async function existingMatchKeysForEvent(tx: Prisma.TransactionClient, organizationId: string, eventId: string): Promise<Set<string>> {
  const rows = await tx.registrationParticipant.findMany({ where: { organizationId, submission: { eventId } }, select: { fullName: true, dateOfBirth: true } });
  const keys = new Set<string>();
  for (const row of rows) {
    const key = participantMatchKey(row.fullName, row.dateOfBirth);
    if (key) keys.add(key);
  }
  return keys;
}

export type CreateRegistrationInput = {
  organizationId: string;
  formId: string;
  eventId: string;
  mode: "DRAFT" | "SUBMIT";
  applicantUserId?: string | null;
  team: TeamSubmissionInput;
  submissionAnswers?: Record<string, unknown>;
  actorUserId?: string | null;
};

// Server-side create. All values that must not be client-controlled
// (organizationId, formId, eventId, status, referenceNumber, timestamps,
// reviewer fields) are set here from trusted inputs - never from the form body.
export async function createTeamRegistration(input: CreateRegistrationInput) {
  // Server-derived duplicate check runs inside the same tenant context.
  return withOrganizationContext(input.organizationId, async (tx) => {
    const form = await tx.registrationForm.findUniqueOrThrow({ where: { id: input.formId } });
    if (form.organizationId !== input.organizationId || form.eventId !== input.eventId) throw new RegistrationNotFoundError();
    const config = parseSportConfig(form.sportConfig);

    const existingMatchKeys = await existingMatchKeysForEvent(tx, input.organizationId, input.eventId);
    const result = validateTeamSubmission(input.team, { config, requireCompleteRosters: input.mode === "SUBMIT", existingMatchKeys });
    if (!result.valid) throw new RegistrationValidationError(result.errors);

    const now = new Date();
    const status = input.mode === "DRAFT" ? RegistrationSubmissionStatus.DRAFT : RegistrationSubmissionStatus.PENDING;
    const participants: Prisma.RegistrationParticipantCreateWithoutSubmissionInput[] = input.team.participants.map((participant: ParticipantInput, index) => ({
      role: "PARTICIPANT",
      fullName: participant.fullName.trim(),
      dateOfBirth: participant.dateOfBirth ? new Date(participant.dateOfBirth) : null,
      gender: participant.gender ?? null,
      guardianName: participant.guardianName ?? null,
      guardianPhone: participant.guardianPhone ?? null,
      consentAccepted: participant.consentAccepted === true,
      consentAcceptedAt: participant.consentAccepted === true ? now : null,
      athleteId: null, // never trust a client athleteId; linking is a separate guarded step
      sortOrder: index,
      organization: { connect: { id: input.organizationId } },
      sportMemberships: {
        create: participant.sportMemberships.map((membership) => ({
          sport: membership.sport,
          rosterOrder: membership.rosterOrder ?? 0,
          position: membership.position ?? null,
          isCaptain: membership.isCaptain === true,
          isActive: membership.isActive !== false,
          organization: { connect: { id: input.organizationId } },
        })),
      },
    }));

    const submission = await createWithReference((referenceNumber) =>
      tx.registrationSubmission.create({
        data: {
          organizationId: input.organizationId,
          formId: form.id,
          eventId: form.eventId,
          mode: form.mode,
          status,
          referenceNumber,
          applicantUserId: input.applicantUserId ?? null,
          teamName: input.team.teamName?.trim() || null,
          teamClubOrSchool: input.team.teamClubOrSchool?.trim() || null,
          teamCategory: input.team.teamCategory?.trim() || null,
          answers: (input.submissionAnswers ?? {}) as Prisma.InputJsonValue,
          submittedAt: input.mode === "DRAFT" ? null : now,
          participants: { create: participants },
        },
        include: { participants: { include: { sportMemberships: true } } },
      }),
    );

    const auditActor = input.actorUserId ?? input.applicantUserId ?? null;
    if (auditActor) {
      await writeAuditLog(tx, {
        action: input.mode === "DRAFT" ? "REGISTRATION_DRAFT_SAVED" : "REGISTRATION_SUBMITTED",
        entityType: "RegistrationSubmission",
        entityId: submission.id,
        userId: auditActor,
        organizationId: input.organizationId,
        details: { referenceNumber: submission.referenceNumber, participants: submission.participants.length },
      });
    }
    return submission;
  });
}

export async function listRegistrations(organizationId: string, status?: RegistrationSubmissionStatus) {
  return withOrganizationContext(organizationId, (tx) =>
    tx.registrationSubmission.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { _count: { select: { participants: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
}

export async function getRegistration(organizationId: string, id: string) {
  return withOrganizationContext(organizationId, (tx) =>
    tx.registrationSubmission.findFirst({
      where: { id, organizationId },
      include: { participants: { orderBy: { sortOrder: "asc" }, include: { sportMemberships: { orderBy: { rosterOrder: "asc" } } } }, reviewedBy: { select: { name: true } } },
    }),
  );
}

export async function updateRegistrationStatus(
  organizationId: string,
  id: string,
  status: RegistrationSubmissionStatus,
  actorUserId: string,
  reviewNotes?: string,
) {
  return withOrganizationContext(organizationId, async (tx) => {
    const existing = await tx.registrationSubmission.findUnique({ where: { id }, select: { id: true, organizationId: true, status: true } });
    if (!existing) throw new RegistrationNotFoundError();
    const statusBefore = existing.status;
    assertSameOrganization(existing, organizationId, "Registration");
    const updated = await tx.registrationSubmission.update({
      where: { id },
      data: { status, reviewNotes: reviewNotes?.trim() || null, reviewedById: actorUserId, reviewedAt: new Date() },
    });
    await writeAuditLog(tx, {
      action: "REGISTRATION_STATUS_UPDATED",
      entityType: "RegistrationSubmission",
      entityId: id,
      userId: actorUserId,
      organizationId,
      details: { from: statusBefore, to: status },
    });
    return updated;
  });
}

export async function getRegistrationById(organizationId: string, id: string) {
  return getRegistration(organizationId, id);
}
