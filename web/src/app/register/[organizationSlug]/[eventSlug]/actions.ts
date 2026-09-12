"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { RegistrationSport } from "@/generated/prisma/enums";
import { createTeamRegistration, loadPublicRegistration, RegistrationValidationError } from "@/lib/registration/service";
import { validateFieldAnswers, type RegistrationFieldDef } from "@/lib/registration/validation";

const membershipSchema = z.object({
  sport: z.enum([RegistrationSport.VOLLEYBALL, RegistrationSport.FLAG_RACE]),
  rosterOrder: z.number().int().min(1).optional(),
  position: z.string().max(60).optional(),
  isActive: z.boolean().optional(),
  isCaptain: z.boolean().optional(),
});

const participantSchema = z.object({
  clientId: z.string().min(1).max(64),
  fullName: z.string().max(120),
  dateOfBirth: z.string().optional(),
  gender: z.string().max(20).optional(),
  guardianName: z.string().max(120).optional(),
  guardianPhone: z.string().max(30).optional(),
  consentAccepted: z.boolean().optional(),
  sportMemberships: z.array(membershipSchema).max(4),
  answers: z.record(z.string(), z.unknown()).optional(),
});

const payloadSchema = z.object({
  teamName: z.string().max(120).optional(),
  teamClubOrSchool: z.string().max(160).optional(),
  teamCategory: z.string().max(80).optional(),
  participants: z.array(participantSchema).max(100),
  submissionAnswers: z.record(z.string(), z.unknown()).optional(),
});

export type RegistrationFormState = { error?: string; success?: { referenceNumber: string; status: string } };

function toFieldDefs(fields: Awaited<ReturnType<typeof loadPublicRegistration>>): RegistrationFieldDef[] {
  return (fields?.form.fields ?? []).map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type as RegistrationFieldDef["type"],
    scope: field.scope as RegistrationFieldDef["scope"],
    required: field.required,
    options: Array.isArray(field.options) ? (field.options as string[]) : null,
    conditionalOn: (field.conditionalOn as RegistrationFieldDef["conditionalOn"]) ?? null,
  }));
}

// Public server action. organizationSlug/eventSlug arrive as Next.js-encrypted
// bound arguments; the organization is re-resolved server-side and is never
// read from the posted payload.
export async function submitTeamRegistration(
  organizationSlug: string,
  eventSlug: string,
  _state: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Invalid submission." };
  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(raw));
  } catch {
    return { error: "Invalid submission." };
  }

  const ctx = await loadPublicRegistration(organizationSlug, eventSlug);
  if (!ctx) return { error: "Registration form not found." };
  if (!ctx.accepting) return { error: "Registration is not currently open." };

  // DRAFT vs SUBMIT is a trusted button intent; the client cannot set status.
  const mode: "DRAFT" | "SUBMIT" = formData.get("intent") === "DRAFT" ? "DRAFT" : "SUBMIT";

  const fieldDefs = toFieldDefs(ctx);
  const issues = validateFieldAnswers(fieldDefs, payload.submissionAnswers ?? {}, "SUBMISSION");
  payload.participants.forEach((participant, index) => {
    for (const issue of validateFieldAnswers(fieldDefs, participant.answers ?? {}, "PARTICIPANT")) {
      issues.push({ ...issue, path: `participants.${index}.${issue.path}` });
    }
  });
  if (issues.length > 0) return { error: issues.map((issue) => issue.message).join(" ") };

  const session = await auth();
  try {
    const submission = await createTeamRegistration({
      organizationId: ctx.organization.id,
      formId: ctx.form.id,
      eventId: ctx.event.id,
      mode: mode,
      applicantUserId: session?.user?.id ?? null,
      actorUserId: session?.user?.id ?? null,
      submissionAnswers: payload.submissionAnswers,
      team: {
        teamName: payload.teamName ?? null,
        teamClubOrSchool: payload.teamClubOrSchool ?? null,
        teamCategory: payload.teamCategory ?? null,
        participants: payload.participants.map((participant) => ({
          clientId: participant.clientId,
          fullName: participant.fullName,
          dateOfBirth: participant.dateOfBirth ?? null,
          gender: participant.gender ?? null,
          guardianName: participant.guardianName ?? null,
          guardianPhone: participant.guardianPhone ?? null,
          consentAccepted: participant.consentAccepted,
          sportMemberships: participant.sportMemberships,
        })),
      },
    });
    revalidatePath(`/register/${organizationSlug}/${eventSlug}`);
    return { success: { referenceNumber: submission.referenceNumber, status: submission.status } };
  } catch (error) {
    if (error instanceof RegistrationValidationError) return { error: error.issues.map((issue) => issue.message).join(" ") };
    return { error: "Could not save the registration. Please try again." };
  }
}
