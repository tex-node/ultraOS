"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  ApplicationStatus,
  ApplicationType,
  AthleteGender,
  DraftSelectionGroup,
  PlayerStatus,
  StaffRole,
  UserRole,
} from "@/generated/prisma/enums";
import {
  applicationRecipients,
  exportableTypeLabels,
  getApplicationData,
  parseEmailStatusFilter,
  parseExportableTypes,
} from "@/app/applications/application-data";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { roleForApplication, staffRoleForApplication } from "@/lib/participant-internalization";
import { prisma } from "@/lib/prisma";
import { ensureAthletePublicId, ensureStaffPublicId } from "@/lib/public-ids";
import { sendSmtpMail } from "@/lib/smtp";

type SubmittedData = Record<string, unknown>;

function text(data: SubmittedData, key: string, fallback = "") {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function numberValue(data: SubmittedData, key: string, fallback: number) {
  const parsed = Number(text(data, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function heightFeetToCm(data: SubmittedData) {
  const heightFeet = numberValue(data, "heightFeet", 0);
  if (heightFeet <= 0) {
    return numberValue(data, "heightCm", 180);
  }
  return Math.round(heightFeet * 30.48);
}

function applicationName(data: SubmittedData) {
  const fullName = text(data, "fullName");
  if (fullName) {
    return fullName;
  }
  const firstName = text(data, "firstName");
  const lastName = text(data, "lastName");
  return text(data, "name", `${firstName} ${lastName}`.trim() || "Applicant");
}

function splitFullName(data: SubmittedData) {
  const name = applicationName(data);
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
  return {
    firstName: text(data, "firstName", firstName || "Applicant"),
    lastName: text(data, "lastName", rest.join(" ") || "Applicant"),
  };
}

function profilePhotoUrl(data: SubmittedData) {
  const profilePhoto = data.profilePhoto;
  if (!profilePhoto || typeof profilePhoto !== "object" || Array.isArray(profilePhoto)) {
    return null;
  }
  const url = (profilePhoto as SubmittedData).url;
  const key = (profilePhoto as SubmittedData).key;
  return typeof url === "string" && url.length > 0
    ? url
    : typeof key === "string" && key.length > 0
      ? key
      : null;
}

function parseDraftSelectionGroup(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return Object.values(DraftSelectionGroup).includes(value as DraftSelectionGroup)
    ? (value as DraftSelectionGroup)
    : null;
}

async function grantRole(
  tx: Prisma.TransactionClient,
  userId: string,
  role: UserRole,
  grantedById: string,
) {
  await tx.userRoleAssignment.upsert({
    where: { userId_role: { userId, role } },
    update: { revokedAt: null, grantedById, grantedAt: new Date() },
    create: { userId, role, grantedById },
  });
}

async function provisionApprovedApplication(
  tx: Prisma.TransactionClient,
  application: {
    id: string;
    type: ApplicationType;
    applicantUserId: string | null;
    submittedData: Prisma.JsonValue;
  },
  reviewerId: string,
) {
  if (!application.applicantUserId) {
    throw new Error("Application must be attached to a user before approval.");
  }

  const data = application.submittedData && typeof application.submittedData === "object" && !Array.isArray(application.submittedData)
    ? (application.submittedData as SubmittedData)
    : {};
  const userId = application.applicantUserId;

  if (application.type === ApplicationType.PLAYER) {
    const email = text(data, "email");
    const applicantName = splitFullName(data);
    const athleteData = {
      userId,
      firstName: applicantName.firstName,
      lastName: applicantName.lastName,
      gender: text(data, "gender", text(data, "genderDivision")).toLowerCase().includes("female")
        ? AthleteGender.FEMALE
        : AthleteGender.MALE,
      dateOfBirth: text(data, "dateOfBirth")
        ? new Date(text(data, "dateOfBirth"))
        : new Date("2000-01-01T00:00:00Z"),
      dominantHand: "RIGHT",
      phone: text(data, "phone") || null,
      email: email || null,
      previousTeam: text(data, "academyTeam", text(data, "previousTeam")) || null,
      emergencyContact: text(data, "emergencyContact") || null,
      photoUrl: profilePhotoUrl(data),
    };
    const existingAthlete = await tx.athlete.findFirst({
      where: { OR: [{ userId }, ...(email ? [{ email }] : [])] },
      select: { id: true },
    });
    const athlete = existingAthlete
      ? await tx.athlete.update({
        where: { id: existingAthlete.id },
        data: {
          ...athleteData,
          email: email || undefined,
        },
      })
      : await tx.athlete.create({
        data: athleteData,
      });
    const ultraAthleteId = await ensureAthletePublicId(tx, athlete.id);
    const season = await tx.season.findFirst({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    if (season) {
      const player = await tx.player.upsert({
        where: { athleteId_seasonId: { athleteId: athlete.id, seasonId: season.id } },
        update: {
          position: text(data, "position", "TBD"),
          heightCm: heightFeetToCm(data),
          weightKg: numberValue(data, "weightKg", 75),
          status: PlayerStatus.DRAFT_ELIGIBLE,
        },
        create: {
          athleteId: athlete.id,
          seasonId: season.id,
          position: text(data, "position", "TBD"),
          heightCm: heightFeetToCm(data),
          weightKg: numberValue(data, "weightKg", 75),
          status: PlayerStatus.DRAFT_ELIGIBLE,
          draftSelectionGroup: DraftSelectionGroup.PENDING_SELECTION,
        },
      });
      await tx.application.update({
        where: { id: application.id },
        data: {
          provisionedAthleteId: athlete.id,
          provisionedPlayerId: player.id,
          provisionedUserId: userId,
          provisionedAt: new Date(),
          provisioningStatus: "SEASON_REGISTRATION_CREATED",
        },
      });
    } else {
      await tx.application.update({
        where: { id: application.id },
        data: {
          provisionedAthleteId: athlete.id,
          provisionedUserId: userId,
          provisionedAt: new Date(),
          provisioningStatus: "PROFILE_PROVISIONED",
        },
      });
    }
    await grantRole(tx, userId, UserRole.PLAYER, reviewerId);
    await writeAuditLog(tx, { userId: reviewerId, action: "PUBLIC_ID_ASSIGNED", entityType: "Athlete", entityId: athlete.id, details: { ultraAthleteId } });
    return;
  }

  if (application.type === ApplicationType.COACH || application.type === ApplicationType.SCOUT || application.type === ApplicationType.OFFICIAL) {
    const role = staffRoleForApplication(application.type);
    const staff = await tx.staff.upsert({
      where: { userId },
      update: {
        name: applicationName(data),
        role,
        phone: text(data, "phone") || null,
        email: text(data, "email") || null,
      },
      create: {
        userId,
        name: applicationName(data),
        role,
        phone: text(data, "phone") || null,
        email: text(data, "email") || null,
      },
    });
    const ultraStaffId = await ensureStaffPublicId(tx, staff.id);
    await tx.application.update({
      where: { id: application.id },
      data: {
        provisionedStaffId: staff.id,
        provisionedUserId: userId,
        provisionedAt: new Date(),
        provisioningStatus: "PROFILE_PROVISIONED",
      },
    });
    await grantRole(tx, userId, roleForApplication(application.type) ?? UserRole.FAN, reviewerId);
    await writeAuditLog(tx, { userId: reviewerId, action: "PUBLIC_ID_ASSIGNED", entityType: "Staff", entityId: staff.id, details: { ultraStaffId } });
    return;
  }

  if (application.type === ApplicationType.VENDOR) {
    const vendorName = text(data, "businessName", applicationName(data));
    const vendorData = {
      userId,
      name: vendorName,
      contactName: text(data, "contactName", applicationName(data)),
      email: text(data, "email") || null,
      phone: text(data, "phone") || null,
      isActive: true,
    };
    const existingVendor = await tx.vendor.findFirst({
      where: { OR: [{ userId }, { name: vendorName }] },
      select: { id: true },
    });
    if (existingVendor) {
      await tx.vendor.update({
        where: { id: existingVendor.id },
        data: vendorData,
      });
    } else {
      await tx.vendor.create({
        data: vendorData,
      });
    }
    await grantRole(tx, userId, UserRole.VENDOR, reviewerId);
    return;
  }

  if (application.type === ApplicationType.MEDIA) {
    await tx.mediaProfile.upsert({
      where: { userId },
      update: {
        organization: text(data, "organization", "Independent"),
        roleTitle: text(data, "mediaRole", "Media"),
        equipment: text(data, "equipment") || null,
        socialLinks: text(data, "socialLinks") || null,
        isActive: true,
      },
      create: {
        userId,
        organization: text(data, "organization", "Independent"),
        roleTitle: text(data, "mediaRole", "Media"),
        equipment: text(data, "equipment") || null,
        socialLinks: text(data, "socialLinks") || null,
      },
    });
    await grantRole(tx, userId, UserRole.MEDIA, reviewerId);
    return;
  }

  if (application.type === ApplicationType.VOLUNTEER) {
    await tx.volunteerProfile.upsert({
      where: { userId },
      update: {
        areaOfInterest: text(data, "areaOfInterest", "Operations"),
        availability: text(data, "availability", "TBD"),
        experience: text(data, "experience") || null,
        isActive: true,
      },
      create: {
        userId,
        areaOfInterest: text(data, "areaOfInterest", "Operations"),
        availability: text(data, "availability", "TBD"),
        experience: text(data, "experience") || null,
      },
    });
    await tx.staff.upsert({
      where: { userId },
      update: {
        name: applicationName(data),
        role: StaffRole.VOLUNTEER,
        phone: text(data, "phone") || null,
        email: text(data, "email") || null,
      },
      create: {
        userId,
        name: applicationName(data),
        role: StaffRole.VOLUNTEER,
        phone: text(data, "phone") || null,
        email: text(data, "email") || null,
      },
    });
    await grantRole(tx, userId, UserRole.VOLUNTEER, reviewerId);
  }
}

export async function updateApplicationStatus(formData: FormData) {
  const session = await requirePermission("application:review");
  const applicationId = formData.get("applicationId");
  const status = formData.get("status");
  const notesValue = formData.get("notes");
  const draftSelectionGroup = parseDraftSelectionGroup(formData.get("draftSelectionGroup"));

  if (typeof applicationId !== "string" || applicationId.length === 0) {
    throw new Error("Application ID is required.");
  }
  if (
    typeof status !== "string" ||
    !Object.values(ApplicationStatus).includes(status as ApplicationStatus)
  ) {
    throw new Error("Valid application status is required.");
  }

  const notes = typeof notesValue === "string" && notesValue.trim().length > 0
    ? notesValue.trim()
    : null;
  const nextStatus = status as ApplicationStatus;

  await prisma.$transaction(async (tx) => {
    const application = await tx.application.update({
      data: {
        status: nextStatus,
        notes,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
      where: { id: applicationId },
      select: { id: true, type: true, status: true, applicantUserId: true, submittedData: true },
    });

    if (nextStatus === ApplicationStatus.APPROVED) {
      await provisionApprovedApplication(tx, application, session.user.id);
    }

    if (application.type === ApplicationType.PLAYER && draftSelectionGroup) {
      if (nextStatus !== ApplicationStatus.APPROVED) {
        throw new Error("Player draft selection can only be set for approved applications.");
      }
      if (!application.applicantUserId) {
        throw new Error("Player application must be linked to a user before draft selection.");
      }
      const activeSeason = await tx.season.findFirst({
        orderBy: { startDate: "desc" },
        select: { id: true },
        where: { status: { in: ["ACTIVE", "DRAFT"] } },
      });
      const athlete = await tx.athlete.findUnique({
        select: { id: true },
        where: { userId: application.applicantUserId },
      });
      if (!activeSeason || !athlete) {
        throw new Error("Approved player registration was not found for draft selection.");
      }
      await tx.player.update({
        data: {
          draftSelectionGroup,
          selectedAt: new Date(),
          selectedById: session.user.id,
          selectionNotes: notes,
        },
        where: { athleteId_seasonId: { athleteId: athlete.id, seasonId: activeSeason.id } },
      });
    }

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "APPLICATION_STATUS_UPDATED",
      entityType: "Application",
      entityId: application.id,
      details: {
        type: application.type,
        status: application.status,
        notes,
        draftSelectionGroup,
      },
    });
  });

  revalidatePath("/applications");
}

export type BulkEmailState = {
  success?: boolean;
  error?: string;
  failedRecipients?: { email: string; error: string }[];
  sentCount?: number;
};

export async function sendBulkApplicationEmail(
  _previousState: BulkEmailState,
  formData: FormData,
): Promise<BulkEmailState> {
  const session = await requirePermission("application:review");
  const types = parseExportableTypes(value(formData, "types"));
  const status = parseEmailStatusFilter(value(formData, "status"));
  const subject = value(formData, "subject").trim();
  const message = value(formData, "message").trim();

  if (!subject) {
    return { error: "Email subject is required." };
  }
  if (!message) {
    return { error: "Email message is required." };
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;

  if (!smtpHost || !smtpUser || !smtpPassword || !emailFrom || !Number.isFinite(smtpPort)) {
    return {
      error:
        "Bulk email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM.",
    };
  }

  const applications = await getApplicationData(types, status);
  const recipients = applicationRecipients(applications);
  if (recipients.length === 0) {
    return { error: "No valid recipient emails found for the selected audience and status." };
  }

  const mailConfig = {
    from: emailFrom,
    host: smtpHost,
    password: smtpPassword,
    port: smtpPort,
    user: smtpUser,
  };

  const audience = types.map((type) => exportableTypeLabels[type]).join(", ");
  const statusLabel = status ? status.replaceAll("_", " ") : "ALL";
  const failedRecipients: { email: string; error: string }[] = [];
  let sentCount = 0;
  for (const recipient of recipients) {
    const personalizedMessage = personalizeMessage(message, recipient.name);
    try {
      await sendSmtpMail(mailConfig, {
        html: plainTextToHtml(personalizedMessage),
        subject: personalizeMessage(subject, recipient.name),
        text: personalizedMessage,
        to: recipient.email,
      });
      sentCount += 1;
    } catch (error) {
      failedRecipients.push({
        email: recipient.email,
        error: smtpErrorMessage(error),
      });
    }
  }

  await prisma.$transaction((tx) =>
    writeAuditLog(tx, {
      userId: session.user.id,
      action: "APPLICATION_BULK_EMAIL_SENT",
      entityType: "Application",
      entityId: "bulk-email",
      details: {
        audience,
        attemptedCount: recipients.length,
        failedCount: failedRecipients.length,
        failedRecipients: failedRecipients.slice(0, 50),
        personalized: true,
        recipientCount: recipients.length,
        sentCount,
        status: statusLabel,
        subject,
      },
    }),
  );

  if (sentCount === 0) {
    return {
      error: `No emails were sent. ${failedRecipients.length} recipient${failedRecipients.length === 1 ? "" : "s"} failed.`,
      failedRecipients,
      sentCount,
    };
  }

  return {
    error: failedRecipients.length
      ? `${sentCount} email${sentCount === 1 ? "" : "s"} sent. ${failedRecipients.length} recipient${failedRecipients.length === 1 ? "" : "s"} failed.`
      : undefined,
    failedRecipients,
    success: failedRecipients.length === 0,
    sentCount,
  };
}

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function plainTextToHtml(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function personalizeMessage(value: string, name: string) {
  const trimmedName = name.trim() || "there";
  const firstName = trimmedName.split(/\s+/)[0] || trimmedName;
  return value
    .replaceAll("{{name}}", trimmedName)
    .replaceAll("{{Name}}", trimmedName)
    .replaceAll("{{firstName}}", firstName)
    .replaceAll("{{FirstName}}", firstName);
}

function smtpErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unknown SMTP error.";
  }
  if (error.message.includes("535") || error.message.toLowerCase().includes("badcredentials")) {
    return "SMTP username or password was rejected. For Gmail, use a valid 16-character app password.";
  }
  return error.message;
}
