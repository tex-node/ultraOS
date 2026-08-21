"use server";

import { Prisma } from "@/generated/prisma/client";
import {
  ClubStatus,
  SeasonClubStatus,
  type StaffRole,
} from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/authorization";
import {
  clubSchema,
  formDataToRecord,
  seasonClubSchema,
  type ClubFormState,
} from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";

function mutationError(error: unknown): ClubFormState {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { error: "A record with the same unique details already exists." };
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
  await requirePermission("club:manage");
  const parsed = clubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const club = await prisma.club.create({
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

    revalidatePath("/clubs");
    redirect(`/clubs/${club.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function updateClub(
  clubId: string,
  _state: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  await requirePermission("club:manage");
  const parsed = clubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.club.update({
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

    revalidatePath("/clubs");
    revalidatePath(`/clubs/${clubId}`);
    redirect(`/clubs/${clubId}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function archiveClub(clubId: string) {
  await requirePermission("club:manage");
  const activeRegistrations = await prisma.seasonClub.count({
    where: { clubId, status: SeasonClubStatus.ACTIVE },
  });

  if (activeRegistrations > 0) {
    redirect(`/clubs/${clubId}?error=active-registrations`);
  }

  await prisma.club.update({
    where: { id: clubId },
    data: { status: ClubStatus.ARCHIVED },
  });
  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
}

async function validateSeasonClubScope(
  clubId: string,
  seasonId: string,
  divisionId: string,
) {
  const [club, season, division] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { sportId: true } }),
    prisma.season.findUnique({
      where: { id: seasonId },
      select: { competition: { select: { id: true, sportId: true } } },
    }),
    prisma.division.findUnique({
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

async function validateStaffAssignments(data: {
  headCoachId: string;
  assistantCoachId: string;
  teamManagerId: string;
  scoutId: string;
  fanCaptainId: string;
}) {
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

  const staff = await prisma.staff.findMany({
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
  await requirePermission("club:manage");
  const parsed = seasonClubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (
    !(await validateSeasonClubScope(
      parsed.data.clubId,
      parsed.data.seasonId,
      parsed.data.divisionId,
    ))
  ) {
    return { error: "Club, season, and division must belong to the same sport and competition." };
  }

  if (!(await validateStaffAssignments(parsed.data))) {
    return { error: "One or more staff assignments do not match the required role." };
  }

  try {
    const seasonClub = await prisma.$transaction(async (tx) => {
      const created = await tx.seasonClub.create({
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

      await tx.standing.create({
        data: { seasonId: parsed.data.seasonId, seasonClubId: created.id },
      });

      return created;
    });

    revalidatePath("/clubs");
    revalidatePath(`/clubs/${parsed.data.clubId}`);
    redirect(`/clubs/${parsed.data.clubId}?seasonClub=${seasonClub.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function updateSeasonClub(
  seasonClubId: string,
  _state: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  await requirePermission("club:manage");
  const parsed = seasonClubSchema.safeParse(formDataToRecord(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (
    !(await validateSeasonClubScope(
      parsed.data.clubId,
      parsed.data.seasonId,
      parsed.data.divisionId,
    ))
  ) {
    return { error: "Club, season, and division must belong to the same sport and competition." };
  }

  if (!(await validateStaffAssignments(parsed.data))) {
    return { error: "One or more staff assignments do not match the required role." };
  }

  const currentRegistration = await prisma.seasonClub.findUnique({
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
    return { error: "SeasonClub registration was not found." };
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
    return {
      error:
        "Club, season, and division cannot change after roster or competitive records exist.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.seasonClub.update({
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
    });

    revalidatePath("/clubs");
    revalidatePath(`/clubs/${parsed.data.clubId}`);
    redirect(`/clubs/${parsed.data.clubId}?seasonClub=${seasonClubId}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function withdrawSeasonClub(seasonClubId: string, clubId: string) {
  await requirePermission("club:manage");
  await prisma.seasonClub.update({
    where: { id: seasonClubId },
    data: { status: SeasonClubStatus.WITHDRAWN },
  });
  revalidatePath("/clubs");
  revalidatePath(`/clubs/${clubId}`);
}
