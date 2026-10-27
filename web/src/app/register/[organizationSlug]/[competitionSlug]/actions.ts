"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { writeAuditLog } from "@/lib/audit";
import { ensureAthletePublicId } from "@/lib/public-ids";
import { sendSmtpMail } from "@/lib/smtp";
import { AthleteGender, ApplicationStatus, ApplicationType, RecordOrigin } from "@/generated/prisma/enums";

// Public player registration (streak v19, Prompt 2).
//
// Until now a player entered the system through a CSV or an admin. This is the door a stranger can walk through:
// no session, no invite, one form. Two rows are created - an Athlete (the person) and a PLAYER Application (the claim,
// for a human to review) - because registration is not approval: a public form that instantly makes someone a
// registered player of a league is a form that lets anyone fill a roster.
//
// The Application carries the competition and season it was submitted for in `submittedData`, which is where this
// schema keeps an application's specifics (Application has no seasonId column, and inventing one here would be a second
// source of truth for eligibility).

const registrationInput = z.object({
  organizationId: z.string().min(1),
  competitionId: z.string().min(1),
  seasonId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["MALE", "FEMALE"]),
  dominantHand: z.enum(["RIGHT", "LEFT"]),
  position: z.string().trim().max(60).optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
});

export type RegistrationResult = { ok: true; applicationId: string; emailed: boolean } | { ok: false; error: string };

function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export async function registerPlayerAction(
  organizationSlug: string,
  competitionSlug: string,
  _previous: RegistrationResult | null,
  formData: FormData,
): Promise<RegistrationResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = registrationInput.safeParse({
    organizationId: String(raw.organizationId ?? ""),
    competitionId: String(raw.competitionId ?? ""),
    seasonId: String(raw.seasonId ?? ""),
    firstName: String(raw.firstName ?? ""),
    lastName: String(raw.lastName ?? ""),
    email: String(raw.email ?? ""),
    dateOfBirth: String(raw.dateOfBirth ?? ""),
    gender: String(raw.gender ?? ""),
    dominantHand: String(raw.dominantHand ?? "RIGHT"),
    position: raw.position ? String(raw.position) : undefined,
    guardianName: raw.guardianName ? String(raw.guardianName) : undefined,
    guardianPhone: raw.guardianPhone ? String(raw.guardianPhone) : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  }
  const input = parsed.data;

  const dateOfBirth = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dateOfBirth.getTime())) return { ok: false, error: "That date of birth is not a real date." };
  const age = ageOn(dateOfBirth, new Date());
  if (age < 8 || age > 70) return { ok: false, error: `A player must be between 8 and 70 (that date of birth makes them ${age}).` };

  // The competition must exist, belong to the organization in the URL, and be open. Checked here rather than trusted
  // from the form: the ids come from a public page and a public page can be edited.
  const context = await prisma.competition.findFirst({
    where: { id: input.competitionId, slug: competitionSlug, isActive: true, organization: { slug: organizationSlug } },
    select: { id: true, name: true, organizationId: true, seasons: { where: { id: input.seasonId }, select: { id: true, name: true } } },
  });
  if (!context || context.organizationId !== input.organizationId || context.seasons.length === 0) {
    return { ok: false, error: "That competition is not open for registration." };
  }
  const season = context.seasons[0];

  const duplicate = await withOrganizationContext(input.organizationId, (tx) =>
    tx.application.findFirst({
      where: {
        type: ApplicationType.PLAYER,
        status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW, ApplicationStatus.APPROVED] },
        submittedData: { path: ["seasonId"], equals: season.id },
        applicantUser: { email: input.email },
      },
      select: { id: true },
    }),
  );
  if (duplicate) {
    return { ok: false, error: "There is already an application for this email in that season. Check your email for its status." };
  }

  const created = await withOrganizationContext(input.organizationId, async (tx) => {
    // The athlete row is the person; the application is the claim. A repeat registration with a different email for
    // the same name is allowed and left to the reviewer, because a genuinely different person may share a name.
    const athlete = await tx.athlete.create({
      data: {
        organizationId: input.organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        gender: input.gender as AthleteGender,
        dateOfBirth,
        dominantHand: input.dominantHand,
        recordOrigin: RecordOrigin.APPLICATION,
      },
      select: { id: true },
    });
    await ensureAthletePublicId(tx, input.organizationId, athlete.id);

    const application = await tx.application.create({
      data: {
        organizationId: input.organizationId,
        type: ApplicationType.PLAYER,
        status: ApplicationStatus.SUBMITTED,
        recordOrigin: RecordOrigin.APPLICATION,
        submittedData: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          dominantHand: input.dominantHand,
          position: input.position ?? null,
          guardianName: input.guardianName ?? null,
          guardianPhone: input.guardianPhone ?? null,
          competitionId: context.id,
          competitionName: context.name,
          seasonId: season.id,
          seasonName: season.name,
          athleteId: athlete.id,
          source: "PUBLIC_REGISTRATION",
        },
      },
      select: { id: true },
    });

    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: "system00000000000000000",
      action: "PLAYER_REGISTERED_PUBLICLY",
      entityType: "Application",
      entityId: application.id,
      details: { athleteId: athlete.id, competitionId: context.id, seasonId: season.id },
    });
    return { application, athlete };
  });

  // The confirmation email is best-effort and its outcome is RECORDED, not assumed: staging has no SMTP at all, and a
  // registration that fails because a mail server is down is a registration lost for no reason.
  const emailed = await sendConfirmation(input.email, `${input.firstName} ${input.lastName}`, context.name, season.name, created.application.id, organizationSlug, competitionSlug)
    .catch(() => false);

  // Merge, never overwrite: this is the same row the reviewer reads, and a naive `data: { submittedData: {...} }`
  // would have replaced everything the applicant submitted with a single email flag. Read, merge, write.
  await withOrganizationContext(input.organizationId, async (tx) => {
    const current = await tx.application.findUnique({ where: { id: created.application.id }, select: { submittedData: true } });
    const existing = (current?.submittedData ?? {}) as Record<string, unknown>;
    await tx.application.update({
      where: { id: created.application.id },
      data: { submittedData: { ...existing, emailStatus: emailed ? "SENT" : "NOT_SENT", emailAttemptedAt: new Date().toISOString() } },
    });
  }).catch((error) => console.error("could not record the email outcome", error));

  redirect(`/register/${organizationSlug}/${competitionSlug}/submitted?application=${created.application.id}&emailed=${emailed ? "1" : "0"}`);
}

async function sendConfirmation(to: string, name: string, competitionName: string, seasonName: string, applicationId: string, orgSlug: string, competitionSlug: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "0");
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  if (!host || !user || !password || !from || !Number.isFinite(port) || port === 0) return false;

  const baseUrl = (process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  const statusUrl = `${baseUrl}/register/${orgSlug}/${competitionSlug}/submitted?application=${applicationId}`;
  const text = [
    `Hello ${name},`,
    "",
    `We received your registration for ${competitionName} (${seasonName}).`,
    "",
    "It is now with the league's administrators for review. You do not need to do anything else - we will contact you",
    "at this address once a decision is made.",
    "",
    `Your application reference: ${applicationId}`,
    baseUrl ? `Check its status: ${statusUrl}` : "",
    "",
    "If you did not submit this, please ignore this email.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  await sendSmtpMail({ host, port, user, password, from }, { to, subject: `Registration received - ${competitionName}`, text, html: `<p>${text.split("\n\n").map((paragraph) => paragraph.replace(/\n/g, "<br />")).join("</p><p>")}</p>` });
  return true;
}
