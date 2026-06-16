"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  ApplicationStatus,
  ApplicationType,
  AthleteGender,
  PlayerStatus,
  StaffRole,
  UserRole,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

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

function applicationName(data: SubmittedData) {
  const firstName = text(data, "firstName");
  const lastName = text(data, "lastName");
  return text(data, "name", `${firstName} ${lastName}`.trim() || "Applicant");
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
    const athleteData = {
      userId,
      firstName: text(data, "firstName", applicationName(data)),
      lastName: text(data, "lastName", "Applicant"),
      gender: text(data, "genderDivision").toLowerCase().includes("women")
        ? AthleteGender.FEMALE
        : AthleteGender.MALE,
      dateOfBirth: text(data, "dateOfBirth")
        ? new Date(text(data, "dateOfBirth"))
        : new Date("2000-01-01T00:00:00Z"),
      dominantHand: "RIGHT",
      phone: text(data, "phone") || null,
      email: email || null,
      previousTeam: text(data, "previousTeam") || null,
      emergencyContact: text(data, "emergencyContact") || null,
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
    const season = await tx.season.findFirst({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    if (season) {
      await tx.player.upsert({
        where: { athleteId_seasonId: { athleteId: athlete.id, seasonId: season.id } },
        update: {
          position: text(data, "position", "TBD"),
          heightCm: numberValue(data, "heightCm", 180),
          weightKg: numberValue(data, "weightKg", 75),
          status: PlayerStatus.DRAFT_ELIGIBLE,
        },
        create: {
          athleteId: athlete.id,
          seasonId: season.id,
          position: text(data, "position", "TBD"),
          heightCm: numberValue(data, "heightCm", 180),
          weightKg: numberValue(data, "weightKg", 75),
          status: PlayerStatus.DRAFT_ELIGIBLE,
        },
      });
    }
    await grantRole(tx, userId, UserRole.PLAYER, reviewerId);
    return;
  }

  if (application.type === ApplicationType.COACH || application.type === ApplicationType.SCOUT || application.type === ApplicationType.OFFICIAL) {
    const role =
      application.type === ApplicationType.COACH
        ? StaffRole.HEAD_COACH
        : application.type === ApplicationType.SCOUT
          ? StaffRole.SCOUT
          : StaffRole.OFFICIAL;
    await tx.staff.upsert({
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
    await grantRole(
      tx,
      userId,
      application.type === ApplicationType.COACH
        ? UserRole.COACH
        : application.type === ApplicationType.SCOUT
          ? UserRole.SCOUT
          : UserRole.OFFICIAL,
      reviewerId,
    );
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

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "APPLICATION_STATUS_UPDATED",
      entityType: "Application",
      entityId: application.id,
      details: {
        type: application.type,
        status: application.status,
        notes,
      },
    });
  });

  revalidatePath("/applications");
}
