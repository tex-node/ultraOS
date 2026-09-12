import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import {
  AdminOfflineIntakeStatus,
  ApplicationType,
  AthleteGender,
  CoachSeasonZeroDivision,
  CoachSeasonZeroSelectionStatus,
  PlayerStatus,
  PublicResourceLocatorType,
  RecordOrigin,
  UserRole,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail, normalizePhone, roleForApplication, staffRoleForApplication } from "@/lib/participant-internalization";
import { upsertPublicResourceLocator } from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";
import { upsertRoleAssignment } from "@/lib/user-roles";
import { ensureAthletePublicId, ensureStaffPublicId } from "@/lib/public-ids";

export type IdentityMatch = {
  source: "User" | "Application" | "Staff" | "AdminOfflineIntake" | "Athlete";
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  matchedOn: "email" | "phone" | "name";
};

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Phase 1 Stage 5.5B: this entire file was a separate, deliberately-deferred provisioning path
// since Stage 5.2B-1 ("admin-side, not applicant-submitted... explicitly not touched this
// stage"), named again at every subsequent stage rather than silently solved. searchExistingIdentity
// previously scanned Staff/Athlete/AdminOfflineIntake/Application platform-wide via the bare
// client - an Org B "staff:manage" admin's duplicate-identity check could match (and its callers'
// UI could display name/email/phone for) Org A's staff, athletes, offline-intake records, and
// application data. User has no organizationId (a person's account is genuinely global - Stage 1
// deliberately excluded it from the 104 tenant tables), so the User lookup stays unscoped by
// design; every other source here is tenant-owned. `tx` must already be a transaction opened by
// withOrganizationContext(organizationId, ...) - this function does not open its own transaction,
// so every caller runs its whole duplicate-check-then-mutate flow inside one real tenant context.
// The two $queryRaw calls are RLS-scoped automatically by that same tx's active
// set_config('app.current_org_id', ...), with no separate WHERE-clause organizationId filter
// needed.
export async function searchExistingIdentity(
  tx: Prisma.TransactionClient,
  input: { email?: string; phone?: string; fullName: string },
): Promise<IdentityMatch[]> {
  const email = normalizeEmail(input.email ?? "");
  const phone = normalizePhone(input.phone ?? "");
  const name = normalizedName(input.fullName);
  const matches: IdentityMatch[] = [];

  const users = await prisma.user.findMany({
    where: { OR: [...(email ? [{ email }] : []), { name: { equals: input.fullName, mode: "insensitive" as const } }] },
    select: { id: true, name: true, email: true },
  });
  for (const user of users) {
    matches.push({ source: "User", id: user.id, name: user.name, email: user.email, phone: null, matchedOn: email && user.email === email ? "email" : "name" });
  }

  const staff = await tx.staff.findMany({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
        { name: { equals: input.fullName, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true },
  });
  for (const person of staff) {
    const matchedOn = email && person.email === email ? "email" : phone && person.phone === phone ? "phone" : "name";
    matches.push({ source: "Staff", id: person.id, name: person.name, email: person.email, phone: person.phone, matchedOn });
  }

  const athletes = await tx.$queryRaw<Array<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null }>>`
    SELECT id, "firstName", "lastName", email, phone
    FROM "Athlete"
    WHERE (${email}::text != '' AND lower(email) = ${email})
       OR (${phone}::text != '' AND phone = ${phone})
       OR lower("firstName" || ' ' || "lastName") = ${name}
  `;
  for (const athlete of athletes) {
    const fullAthleteName = `${athlete.firstName} ${athlete.lastName}`;
    const matchedOn = email && athlete.email?.toLowerCase() === email ? "email" : phone && athlete.phone === phone ? "phone" : "name";
    matches.push({ source: "Athlete", id: athlete.id, name: fullAthleteName, email: athlete.email, phone: athlete.phone, matchedOn });
  }

  const intakes = await tx.adminOfflineIntake.findMany({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
        { fullName: { equals: input.fullName, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, fullName: true, email: true, phone: true },
  });
  for (const intake of intakes) {
    const matchedOn = email && intake.email === email ? "email" : phone && intake.phone === phone ? "phone" : "name";
    matches.push({ source: "AdminOfflineIntake", id: intake.id, name: intake.fullName, email: intake.email, phone: intake.phone, matchedOn });
  }

  const applications = await tx.$queryRaw<Array<{ id: string; fullName: string | null; email: string | null; phone: string | null }>>`
    SELECT id,
      COALESCE("submittedData"->>'fullName', "submittedData"->>'name') AS "fullName",
      COALESCE("submittedData"->>'email', "submittedData"->>'Email') AS email,
      "submittedData"->>'phone' AS phone
    FROM "Application"
    WHERE (${email}::text != '' AND lower("submittedData"->>'email') = ${email})
       OR (${phone}::text != '' AND "submittedData"->>'phone' = ${phone})
       OR lower(COALESCE("submittedData"->>'fullName', "submittedData"->>'name', '')) = ${name}
  `;
  for (const application of applications) {
    const matchedOn = email && application.email?.toLowerCase() === email ? "email" : phone && application.phone === phone ? "phone" : "name";
    matches.push({ source: "Application", id: application.id, name: application.fullName ?? "Unknown", email: application.email, phone: application.phone, matchedOn });
  }

  return matches;
}

export type PlayerProfile = {
  gender?: AthleteGender;
  dateOfBirth?: string; // ISO date
  dominantHand?: string;
  position?: string;
  heightCm?: number;
  weightKg?: number;
};

const REQUIRED_PLAYER_PROFILE_KEYS: Array<keyof PlayerProfile> = ["gender", "dateOfBirth", "dominantHand", "position", "heightCm", "weightKg"];

export function isPlayerProfileComplete(profile: PlayerProfile | null | undefined): profile is Required<PlayerProfile> {
  if (!profile) return false;
  return REQUIRED_PLAYER_PROFILE_KEYS.every((key) => profile[key] !== undefined && profile[key] !== null && profile[key] !== "");
}

export function missingPlayerProfileFields(profile: PlayerProfile | null | undefined): string[] {
  if (!profile) return [...REQUIRED_PLAYER_PROFILE_KEYS];
  return REQUIRED_PLAYER_PROFILE_KEYS.filter((key) => profile[key] === undefined || profile[key] === null || profile[key] === "");
}

export type CreateAdminOfflineIntakeInput = {
  participantType: Parameters<typeof roleForApplication>[0];
  fullName: string;
  email?: string;
  phone?: string;
  seasonId?: string;
  notes?: string;
  coachSeasonZeroSelectionStatus?: CoachSeasonZeroSelectionStatus;
  coachSeasonZeroDivision?: CoachSeasonZeroDivision;
  playerProfile?: PlayerProfile;
  reason?: string;
  createdById: string;
};

// Phase 1 Stage 5.5B: previously ran on a bare prisma.$transaction with no organization at all -
// AdminOfflineIntake.organizationId silently fell back to the Stage 3a Neon Ultra DB default
// regardless of the acting admin's real organization, and the client-submitted seasonId (a
// simple, non-composite FK) was never validated as belonging to that organization. Now requires
// an explicit organizationId, runs the whole duplicate-check-then-create flow inside one real
// tenant context, and stamps organizationId explicitly.
export async function createAdminOfflineIntake(organizationId: string, input: CreateAdminOfflineIntakeInput) {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("A full name is required for offline intake.");
  const email = normalizeEmail(input.email ?? "") || null;
  const phone = normalizePhone(input.phone ?? "") || null;
  const isPlayer = input.participantType === ApplicationType.PLAYER;

  return withOrganizationContext(organizationId, async (tx) => {
    if (input.seasonId) await tx.season.findUniqueOrThrow({ where: { id: input.seasonId }, select: { id: true } });

    // A bare "User" match (e.g. an old FAN signup with no Athlete/Application attached) is not
    // a real conflict for a PLAYER-type intake — provisioning a player never creates or links a User.
    const allMatches = await searchExistingIdentity(tx, { email: email ?? undefined, phone: phone ?? undefined, fullName });
    const matches = isPlayer ? allMatches.filter((match) => match.source !== "User") : allMatches;
    if (matches.length > 0) {
      return { created: false as const, matches };
    }

    const status = isPlayer
      ? isPlayerProfileComplete(input.playerProfile)
        ? AdminOfflineIntakeStatus.READY_FOR_PROVISIONING
        : AdminOfflineIntakeStatus.DRAFT
      : email
        ? AdminOfflineIntakeStatus.READY_FOR_PROVISIONING
        : AdminOfflineIntakeStatus.DRAFT;
    const created = await tx.adminOfflineIntake.create({
      data: {
        organizationId,
        coachSeasonZeroDivision: input.coachSeasonZeroDivision,
        coachSeasonZeroSelectionStatus: input.coachSeasonZeroSelectionStatus ?? CoachSeasonZeroSelectionStatus.PENDING,
        createdById: input.createdById,
        email,
        fullName,
        notes: input.notes || null,
        participantType: input.participantType,
        phone,
        playerProfile: isPlayer ? (input.playerProfile ?? {}) : undefined,
        reason: input.reason || null,
        seasonId: input.seasonId || null,
        status,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "ADMIN_OFFLINE_INTAKE_CREATED",
      details: {
        coachSeasonZeroDivision: input.coachSeasonZeroDivision ?? null,
        coachSeasonZeroSelectionStatus: input.coachSeasonZeroSelectionStatus ?? CoachSeasonZeroSelectionStatus.PENDING,
        fullName,
        participantType: input.participantType,
        reason: input.reason ?? null,
        seasonId: input.seasonId ?? null,
        status,
      },
      entityId: created.id,
      entityType: "AdminOfflineIntake",
      userId: input.createdById,
    });

    return { created: true as const, intake: created, matches: [] as IdentityMatch[] };
  });
}

export async function updateAdminOfflineIntakeContact(
  organizationId: string,
  intakeId: string,
  input: { email?: string; phone?: string },
  actorUserId: string,
) {
  const email = normalizeEmail(input.email ?? "") || null;
  const phone = normalizePhone(input.phone ?? "") || null;
  if (!email && !phone) throw new Error("Provide at least an email or phone to update.");

  return withOrganizationContext(organizationId, async (tx) => {
    const intake = await tx.adminOfflineIntake.findUniqueOrThrow({ where: { id: intakeId } });
    if (intake.status === AdminOfflineIntakeStatus.PROVISIONED) {
      throw new Error("This intake record is already provisioned; contact info changes belong on the Staff profile.");
    }

    if (email) {
      const conflicts = await searchExistingIdentity(tx, { email, fullName: intake.fullName, phone: phone ?? undefined });
      const otherRecordConflicts = conflicts.filter((match) => !(match.source === "AdminOfflineIntake" && match.id === intake.id));
      if (otherRecordConflicts.length > 0) {
        throw new Error(`This email/phone matches an existing identity (${otherRecordConflicts.map((m) => `${m.source} ${m.id}`).join(", ")}). Reconcile manually instead of overwriting.`);
      }
    }

    const status =
      intake.participantType === ApplicationType.PLAYER
        ? isPlayerProfileComplete(intake.playerProfile as PlayerProfile | null)
          ? AdminOfflineIntakeStatus.READY_FOR_PROVISIONING
          : AdminOfflineIntakeStatus.DRAFT
        : email
          ? AdminOfflineIntakeStatus.READY_FOR_PROVISIONING
          : intake.status;
    const updated = await tx.adminOfflineIntake.update({
      data: { email: email ?? intake.email, phone: phone ?? intake.phone, status },
      where: { id: intakeId },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "ADMIN_OFFLINE_INTAKE_CONTACT_UPDATED",
      details: { email: updated.email, fullName: intake.fullName, newStatus: status, oldStatus: intake.status, phone: updated.phone },
      entityId: intakeId,
      entityType: "AdminOfflineIntake",
      userId: actorUserId,
    });
    return updated;
  });
}

export async function updateAdminOfflineIntakePlayerProfile(
  organizationId: string,
  intakeId: string,
  patch: PlayerProfile,
  actorUserId: string,
) {
  return withOrganizationContext(organizationId, async (tx) => {
    const intake = await tx.adminOfflineIntake.findUniqueOrThrow({ where: { id: intakeId } });
    if (intake.participantType !== ApplicationType.PLAYER) {
      throw new Error("This intake record is not a PLAYER-type record.");
    }
    if (intake.status === AdminOfflineIntakeStatus.PROVISIONED) {
      throw new Error("This intake record is already provisioned; profile changes belong on the Player record.");
    }

    const merged: PlayerProfile = { ...(intake.playerProfile as PlayerProfile | null), ...patch };
    const status = isPlayerProfileComplete(merged) ? AdminOfflineIntakeStatus.READY_FOR_PROVISIONING : AdminOfflineIntakeStatus.DRAFT;
    const updated = await tx.adminOfflineIntake.update({
      data: { playerProfile: merged, status },
      where: { id: intakeId },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "ADMIN_OFFLINE_INTAKE_PLAYER_PROFILE_UPDATED",
      details: { fullName: intake.fullName, missingFields: missingPlayerProfileFields(merged), newStatus: status, oldStatus: intake.status, patch },
      entityId: intakeId,
      entityType: "AdminOfflineIntake",
      userId: actorUserId,
    });
    return updated;
  });
}

// Phase 1 Stage 5.5B: previously ran on a bare prisma.$transaction with no organization -
// Athlete/Player.organizationId silently fell back to the Stage 3a Neon Ultra DB default
// regardless of which organization's intake record this was, and the duplicate guard scanned
// platform-wide. Now requires an explicit organizationId; the intake lookup fails closed
// (RLS-invisible) for a foreign-org intakeId before anything else runs, and every created row
// is stamped with the real organizationId.
export async function provisionPlayerOfflineIntake(organizationId: string, intakeId: string, seasonId: string, actorUserId: string) {
  return withOrganizationContext(organizationId, async (tx) => {
    const intake = await tx.adminOfflineIntake.findUniqueOrThrow({ where: { id: intakeId } });
    if (intake.participantType !== ApplicationType.PLAYER) {
      throw new Error("This intake record is not a PLAYER-type record. Use provisionAdminOfflineIntake instead.");
    }
    if (intake.status === AdminOfflineIntakeStatus.PROVISIONED) {
      return { alreadyProvisioned: true as const, intake };
    }
    const profile = intake.playerProfile as PlayerProfile | null;
    if (!isPlayerProfileComplete(profile)) {
      throw new Error(`Cannot provision: missing ${missingPlayerProfileFields(profile).join(", ")}. Do not fabricate these — wait for the real data.`);
    }
    await tx.season.findUniqueOrThrow({ where: { id: seasonId }, select: { id: true } });

    // Final duplicate guard immediately before creating the real Athlete/Player,
    // in case another identity was recorded since this intake was created. A bare
    // "User" match (e.g. an old FAN signup with no Athlete/Application attached) is not
    // a real conflict here — provisioning a player never creates or links a User row.
    const conflicts = await searchExistingIdentity(tx, { email: intake.email ?? undefined, fullName: intake.fullName, phone: intake.phone ?? undefined });
    const otherRecordConflicts = conflicts.filter((match) => !(match.source === "AdminOfflineIntake" && match.id === intake.id) && match.source !== "User");
    if (otherRecordConflicts.length > 0) {
      throw new Error(`This identity now matches an existing record (${otherRecordConflicts.map((m) => `${m.source} ${m.id}`).join(", ")}). Reconcile manually instead of creating a duplicate Player.`);
    }

    const nameParts = intake.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || nameParts[0];

    const athlete = await tx.athlete.create({
      data: {
        organizationId,
        dateOfBirth: new Date(profile.dateOfBirth),
        dominantHand: profile.dominantHand,
        email: intake.email,
        firstName,
        gender: profile.gender,
        lastName,
        phone: intake.phone,
        recordOrigin: RecordOrigin.ADMIN_OFFLINE_INTAKE,
      },
    });
    await ensureAthletePublicId(tx, organizationId, athlete.id);
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.ATHLETE,
      publicKey: athlete.id,
      organizationId,
      resourceId: athlete.id,
    });

    const player = await tx.player.create({
      data: {
        organizationId,
        athleteId: athlete.id,
        draftSelectionGroup: "SECONDARY_DRAFT",
        heightCm: profile.heightCm,
        position: profile.position,
        seasonId,
        status: PlayerStatus.DRAFT_ELIGIBLE,
        weightKg: profile.weightKg,
      },
    });

    const updated = await tx.adminOfflineIntake.update({
      data: {
        provisionedAt: new Date(),
        provisionedAthleteId: athlete.id,
        provisionedPlayerId: player.id,
        status: AdminOfflineIntakeStatus.PROVISIONED,
      },
      where: { id: intake.id },
    });

    await writeAuditLog(tx, {
      organizationId,
      action: "ADMIN_OFFLINE_INTAKE_PLAYER_PROVISIONED",
      details: {
        athleteId: athlete.id,
        fullName: intake.fullName,
        playerId: player.id,
        profile,
        reason: intake.reason ?? "Offline-recruited player onboarded by administrator to complete an 8-man squad.",
        seasonId,
      },
      entityId: intake.id,
      entityType: "AdminOfflineIntake",
      userId: actorUserId,
    });

    return { alreadyProvisioned: false as const, athlete, intake: updated, player };
  });
}

export async function provisionAdminOfflineIntake(organizationId: string, intakeId: string, actorUserId: string) {
  return withOrganizationContext(organizationId, async (tx) => {
    const intake = await tx.adminOfflineIntake.findUniqueOrThrow({ where: { id: intakeId } });
    if (intake.status === AdminOfflineIntakeStatus.PROVISIONED) {
      return { alreadyProvisioned: true as const, intake };
    }
    if (intake.participantType === ApplicationType.PLAYER) {
      throw new Error("PLAYER-type intake records must be provisioned via provisionPlayerOfflineIntake, not provisionAdminOfflineIntake.");
    }
    if (!intake.email) {
      throw new Error("This intake record has no email on file yet. Provisioning requires at least a real, verified email — do not invent one.");
    }

    // User has no organizationId (a person's account is genuinely global) - findUnique/create
    // here deliberately stay unscoped, same as every other provisioning path in this codebase
    // (participant-internalization.ts, applications/actions.ts).
    const email = intake.email;
    let user = await tx.user.findUnique({ where: { email } });
    let userCreated = false;
    if (!user) {
      user = await tx.user.create({
        data: {
          email,
          name: intake.fullName,
          passwordHash: await hash(randomUUID(), 12),
          recordOrigin: RecordOrigin.ADMIN_OFFLINE_INTAKE,
          role: UserRole.FAN,
          roles: { create: { role: UserRole.FAN, organizationId, grantedById: actorUserId } },
        },
      });
      userCreated = true;
    } else {
      await upsertRoleAssignment(tx, { userId: user.id, organizationId, role: UserRole.FAN, grantedById: actorUserId });
    }

    const participantRole = roleForApplication(intake.participantType);
    if (participantRole) {
      await upsertRoleAssignment(tx, { userId: user.id, organizationId, role: participantRole, grantedById: actorUserId });
    }

    let staff = await tx.staff.findUnique({ where: { userId: user.id } });
    if (!staff) {
      staff = await tx.staff.create({
        data: {
          organizationId,
          email,
          name: intake.fullName,
          phone: intake.phone,
          recordOrigin: RecordOrigin.ADMIN_OFFLINE_INTAKE,
          role: staffRoleForApplication(intake.participantType),
          userId: user.id,
        },
      });
    }
    const ultraStaffId = await ensureStaffPublicId(tx, organizationId, staff.id);

    const updated = await tx.adminOfflineIntake.update({
      data: {
        provisionedAt: new Date(),
        provisionedStaffId: staff.id,
        provisionedUserId: user.id,
        status: AdminOfflineIntakeStatus.PROVISIONED,
      },
      where: { id: intake.id },
    });

    await writeAuditLog(tx, {
      organizationId,
      action: "ADMIN_OFFLINE_INTAKE_PROVISIONED",
      details: {
        division: intake.coachSeasonZeroDivision,
        participantName: intake.fullName,
        reason: intake.reason ?? "Offline-recruited participant onboarded by administrator.",
        resultingStaffId: staff.id,
        resultingUltraStaffId: ultraStaffId,
        resultingUserId: user.id,
        role: intake.participantType,
        season: intake.seasonId,
        seasonZeroSelection: intake.coachSeasonZeroSelectionStatus,
        userCreated,
      },
      entityId: intake.id,
      entityType: "AdminOfflineIntake",
      userId: actorUserId,
    });

    return { alreadyProvisioned: false as const, intake: updated, staff: { ...staff, ultraStaffId }, user };
  });
}
