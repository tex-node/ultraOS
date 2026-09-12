"use server";

import { Prisma } from "@/generated/prisma/client";
import {
  ClubStatus,
  PublicResourceLocatorType,
  SeasonClubStatus,
  type StaffRole,
} from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import {
  clubSchema,
  formDataToRecord,
  seasonClubSchema,
  type ClubFormState,
} from "@/lib/club-validation";
import { upsertPublicResourceLocator } from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

function mutationError(error: unknown): ClubFormState {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { error: "A record with the same unique details already exists." };
    }
    // Phase 1 Stage 5.2B-2: a foreign-org id (a client-supplied clubId/seasonClubId that RLS
    // makes invisible under the acting organization's context) surfaces as Prisma's ordinary
    // "record to update/delete not found" error, not a distinct authorization error. Treated
    // identically to any other not-found case - a clean validation result, not a leaked signal
    // that the id exists somewhere else.
    if (error.code === "P2025") {
      return { error: "That record was not found." };
    }
  }

  return { error: "The operation could not be completed." };
}

function parseIdentityKeywords(value: string) {
  return value
    .split(/[,/•|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function createClub(
  _state: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const parsed = clubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let clubId: string;
  try {
    const club = await withOrganizationContext(organizationId, async (tx) => {
      const created = await tx.club.create({
        data: {
          organizationId,
          sportId: parsed.data.sportId,
          name: parsed.data.name,
          shortName: parsed.data.shortName,
          logoUrl: parsed.data.logoUrl || null,
          primaryColor: parsed.data.primaryColor || null,
          secondaryColor: parsed.data.secondaryColor || null,
          brandingStatus: parsed.data.brandingStatus,
          motto: parsed.data.motto || null,
          publicBio: parsed.data.publicBio || null,
          officialSlogan: parsed.data.officialSlogan || null,
          crowdChant: parsed.data.crowdChant || null,
          identityKeywords: parseIdentityKeywords(parsed.data.identityKeywords),
          foundedYear: parsed.data.foundedYear ? Number(parsed.data.foundedYear) : null,
          status: parsed.data.status,
          websiteUrl: parsed.data.websiteUrl || null,
        },
      });
      await upsertPublicResourceLocator(tx, {
        resourceType: PublicResourceLocatorType.CLUB,
        publicKey: created.id,
        organizationId,
        resourceId: created.id,
      });

      await writeAuditLog(tx, {
        organizationId,
        userId: session.user.id,
        action: "CLUB_CREATED",
        entityType: "Club",
        entityId: created.id,
        details: { name: created.name, shortName: created.shortName },
      });

      return created;
    });
    clubId = club.id;
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }

  revalidatePath("/clubs");
  redirect(`/clubs/${clubId}`);
}

export async function updateClub(
  clubId: string,
  _state: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const parsed = clubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await withOrganizationContext(organizationId, async (tx) => {
      const updated = await tx.club.update({
        where: { id: clubId },
        data: {
          sportId: parsed.data.sportId,
          name: parsed.data.name,
          shortName: parsed.data.shortName,
          logoUrl: parsed.data.logoUrl || null,
          primaryColor: parsed.data.primaryColor || null,
          secondaryColor: parsed.data.secondaryColor || null,
          brandingStatus: parsed.data.brandingStatus,
          motto: parsed.data.motto || null,
          publicBio: parsed.data.publicBio || null,
          officialSlogan: parsed.data.officialSlogan || null,
          crowdChant: parsed.data.crowdChant || null,
          identityKeywords: parseIdentityKeywords(parsed.data.identityKeywords),
          foundedYear: parsed.data.foundedYear ? Number(parsed.data.foundedYear) : null,
          status: parsed.data.status,
          websiteUrl: parsed.data.websiteUrl || null,
        },
      });

      await writeAuditLog(tx, {
        organizationId,
        userId: session.user.id,
        action: "CLUB_UPDATED",
        entityType: "Club",
        entityId: updated.id,
        details: { name: updated.name, shortName: updated.shortName },
      });
    });
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
  redirect(`/clubs/${clubId}`);
}

export async function archiveClub(clubId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");

  const shouldRedirectForActiveRegistrations = await withOrganizationContext(organizationId, async (tx) => {
    const activeRegistrations = await tx.seasonClub.count({
      where: { clubId, status: SeasonClubStatus.ACTIVE },
    });

    if (activeRegistrations > 0) {
      return true;
    }

    const archived = await tx.club.update({
      where: { id: clubId },
      data: { status: ClubStatus.ARCHIVED },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "CLUB_ARCHIVED",
      entityType: "Club",
      entityId: archived.id,
      details: { name: archived.name },
    });

    return false;
  });

  if (shouldRedirectForActiveRegistrations) {
    redirect(`/clubs/${clubId}?error=active-registrations`);
  }

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
}

// Phase 1 Stage 5.2B-2: every id here is client-submitted (a hidden/select field on the
// SeasonClub form) and must be resolved through the CALLER's scoped transaction, not the bare
// client - RLS then makes a foreign-org clubId/seasonId/divisionId invisible, so this correctly
// returns false (the existing "must belong to the same sport and competition" error) rather than
// ever reading a cross-org row far enough to compare its fields.
async function validateSeasonClubScope(
  tx: Prisma.TransactionClient,
  clubId: string,
  seasonId: string,
  divisionId: string,
) {
  const [club, season, division] = await Promise.all([
    tx.club.findUnique({ where: { id: clubId }, select: { sportId: true } }),
    tx.season.findUnique({
      where: { id: seasonId },
      select: { competition: { select: { id: true, sportId: true } } },
    }),
    tx.division.findUnique({
      where: { id: divisionId },
      select: { competitionId: true },
    }),
  ]);

  return Boolean(
    club &&
      season &&
      division &&
      club.sportId === season.competition.sportId &&
      division.competitionId === season.competition.id,
  );
}

function optionalId(value: string) {
  return value || null;
}

// Phase 1 Stage 5.2B-2: Staff is a tenant table - these ids must also be resolved through the
// scoped transaction, same reasoning as validateSeasonClubScope above.
async function validateStaffAssignments(
  tx: Prisma.TransactionClient,
  data: {
    headCoachId: string;
    assistantCoachId: string;
    teamManagerId: string;
    scoutId: string;
    fanCaptainId: string;
  },
) {
  const assignments: Array<[string, StaffRole]> = [
    [data.headCoachId, "HEAD_COACH"],
    [data.assistantCoachId, "ASSISTANT_COACH"],
    [data.teamManagerId, "TEAM_MANAGER"],
    [data.scoutId, "SCOUT"],
    [data.fanCaptainId, "FAN_CAPTAIN"],
  ];
  const expectedRoles = new Map(assignments.filter(([id]) => id !== ""));

  if (expectedRoles.size === 0) {
    return true;
  }

  const staff = await tx.staff.findMany({
    where: { id: { in: [...expectedRoles.keys()] } },
    select: { id: true, role: true },
  });

  return (
    staff.length === expectedRoles.size &&
    staff.every((person) => expectedRoles.get(person.id) === person.role)
  );
}

export async function createSeasonClub(
  _state: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const parsed = seasonClubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let seasonClubId: string;
  try {
    seasonClubId = await withOrganizationContext(organizationId, async (tx) => {
      if (
        !(await validateSeasonClubScope(
          tx,
          parsed.data.clubId,
          parsed.data.seasonId,
          parsed.data.divisionId,
        ))
      ) {
        throw new ScopeValidationError("Club, season, and division must belong to the same sport and competition.");
      }

      if (!(await validateStaffAssignments(tx, parsed.data))) {
        throw new ScopeValidationError("One or more staff assignments do not match the required role.");
      }

      const created = await tx.seasonClub.create({
        data: {
          organizationId,
          clubId: parsed.data.clubId,
          seasonId: parsed.data.seasonId,
          divisionId: parsed.data.divisionId,
          headCoachId: optionalId(parsed.data.headCoachId),
          assistantCoachId: optionalId(parsed.data.assistantCoachId),
          teamManagerId: optionalId(parsed.data.teamManagerId),
          scoutId: optionalId(parsed.data.scoutId),
          fanCaptainId: optionalId(parsed.data.fanCaptainId),
          status: parsed.data.status,
        },
      });

      await tx.standing.create({
        data: { organizationId, seasonId: parsed.data.seasonId, seasonClubId: created.id },
      });

      await writeAuditLog(tx, {
        organizationId,
        userId: session.user.id,
        action: "SEASON_CLUB_CREATED",
        entityType: "SeasonClub",
        entityId: created.id,
        details: { clubId: created.clubId, seasonId: created.seasonId, divisionId: created.divisionId },
      });

      return created.id;
    });
  } catch (error) {
    if (error instanceof ScopeValidationError) {
      return { error: error.message };
    }
    unstable_rethrow(error);
    return mutationError(error);
  }

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${parsed.data.clubId}`);
  redirect(`/clubs/${parsed.data.clubId}?seasonClub=${seasonClubId}`);
}

export async function updateSeasonClub(
  seasonClubId: string,
  _state: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const parsed = seasonClubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await withOrganizationContext(organizationId, async (tx) => {
      const currentRegistration = await tx.seasonClub.findUnique({
        where: { id: seasonClubId },
        select: {
          clubId: true,
          seasonId: true,
          divisionId: true,
          _count: {
            select: {
              players: true,
              draftPicks: true,
              homeFixtures: true,
              awayFixtures: true,
              gameEvents: true,
              playerStats: true,
              teamStats: true,
            },
          },
        },
      });

      if (!currentRegistration) {
        throw new ScopeValidationError("SeasonClub registration was not found.");
      }

      if (
        !(await validateSeasonClubScope(
          tx,
          parsed.data.clubId,
          parsed.data.seasonId,
          parsed.data.divisionId,
        ))
      ) {
        throw new ScopeValidationError("Club, season, and division must belong to the same sport and competition.");
      }

      if (!(await validateStaffAssignments(tx, parsed.data))) {
        throw new ScopeValidationError("One or more staff assignments do not match the required role.");
      }

      const scopeChanged =
        currentRegistration.clubId !== parsed.data.clubId ||
        currentRegistration.seasonId !== parsed.data.seasonId ||
        currentRegistration.divisionId !== parsed.data.divisionId;
      const competitiveRecordCount = Object.values(currentRegistration._count).reduce(
        (total, count) => total + count,
        0,
      );

      if (scopeChanged && competitiveRecordCount > 0) {
        throw new ScopeValidationError(
          "Club, season, and division cannot change after roster or competitive records exist.",
        );
      }

      const updated = await tx.seasonClub.update({
        where: { id: seasonClubId },
        data: {
          clubId: parsed.data.clubId,
          seasonId: parsed.data.seasonId,
          divisionId: parsed.data.divisionId,
          headCoachId: optionalId(parsed.data.headCoachId),
          assistantCoachId: optionalId(parsed.data.assistantCoachId),
          teamManagerId: optionalId(parsed.data.teamManagerId),
          scoutId: optionalId(parsed.data.scoutId),
          fanCaptainId: optionalId(parsed.data.fanCaptainId),
          status: parsed.data.status,
        },
      });

      if (currentRegistration.seasonId !== parsed.data.seasonId) {
        await tx.standing.update({
          where: { seasonClubId },
          data: { seasonId: parsed.data.seasonId },
        });
      }

      await writeAuditLog(tx, {
        organizationId,
        userId: session.user.id,
        action: "SEASON_CLUB_UPDATED",
        entityType: "SeasonClub",
        entityId: updated.id,
        details: { clubId: updated.clubId, seasonId: updated.seasonId, divisionId: updated.divisionId },
      });
    });
  } catch (error) {
    if (error instanceof ScopeValidationError) {
      return { error: error.message };
    }
    unstable_rethrow(error);
    return mutationError(error);
  }

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${parsed.data.clubId}`);
  redirect(`/clubs/${parsed.data.clubId}?seasonClub=${seasonClubId}`);
}

export async function withdrawSeasonClub(seasonClubId: string, clubId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");

  await withOrganizationContext(organizationId, async (tx) => {
    const withdrawn = await tx.seasonClub.update({
      where: { id: seasonClubId },
      data: { status: SeasonClubStatus.WITHDRAWN },
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SEASON_CLUB_WITHDRAWN",
      entityType: "SeasonClub",
      entityId: withdrawn.id,
    });
  });

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
}

// Internal control-flow error for validation failures discovered inside withOrganizationContext's
// callback - thrown to abort the transaction (so nothing partial commits), caught immediately
// outside to become the same ClubFormState { error } shape these actions always returned.
class ScopeValidationError extends Error {}
