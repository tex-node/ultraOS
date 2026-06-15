"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import {
  athleteSchema,
  playerSchema,
  type PlayerFormState,
} from "@/lib/player-validation";
import { prisma } from "@/lib/prisma";

function mutationError(error: unknown): PlayerFormState {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { error: "A record with the same unique details already exists." };
  }
  return { error: "The operation could not be completed." };
}

export async function createAthlete(
  _state: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  await requirePermission("player:manage");
  const parsed = athleteSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const athlete = await prisma.athlete.create({
      data: {
        ...parsed.data,
        dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00Z`),
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        emergencyContact: parsed.data.emergencyContact || null,
        previousTeam: parsed.data.previousTeam || null,
        photoUrl: parsed.data.photoUrl || null,
        nationality: parsed.data.nationality || null,
      },
    });
    revalidatePath("/players");
    redirect(`/players/${athlete.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function updateAthlete(
  athleteId: string,
  _state: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  await requirePermission("player:manage");
  const parsed = athleteSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.athlete.update({
      where: { id: athleteId },
      data: {
        ...parsed.data,
        dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00Z`),
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        emergencyContact: parsed.data.emergencyContact || null,
        previousTeam: parsed.data.previousTeam || null,
        photoUrl: parsed.data.photoUrl || null,
        nationality: parsed.data.nationality || null,
      },
    });
    revalidatePath("/players");
    revalidatePath(`/players/${athleteId}`);
    redirect(`/players/${athleteId}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

async function validateSeasonClub(seasonId: string, seasonClubId: string) {
  if (!seasonClubId) return true;
  return Boolean(
    await prisma.seasonClub.findFirst({
      where: { id: seasonClubId, seasonId },
      select: { id: true },
    }),
  );
}

export async function createPlayer(
  _state: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  await requirePermission("player:manage");
  const parsed = playerSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await validateSeasonClub(parsed.data.seasonId, parsed.data.seasonClubId))) {
    return { error: "The selected SeasonClub does not participate in this season." };
  }

  try {
    await prisma.player.create({
      data: {
        ...parsed.data,
        seasonClubId: parsed.data.seasonClubId || null,
        jerseyNumber: parsed.data.jerseyNumber ? Number(parsed.data.jerseyNumber) : null,
      },
    });
    revalidatePath("/players");
    revalidatePath(`/players/${parsed.data.athleteId}`);
    redirect(`/players/${parsed.data.athleteId}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function updatePlayer(
  playerId: string,
  _state: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  await requirePermission("player:manage");
  const parsed = playerSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await validateSeasonClub(parsed.data.seasonId, parsed.data.seasonClubId))) {
    return { error: "The selected SeasonClub does not participate in this season." };
  }

  const current = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      seasonId: true,
      _count: { select: { draftPicks: true, gameEvents: true, playerStats: true, mvpVotes: true } },
    },
  });
  if (!current) return { error: "Player registration was not found." };
  const hasCompetitionHistory = Object.values(current._count).some((count) => count > 0);
  if (current.seasonId !== parsed.data.seasonId && hasCompetitionHistory) {
    return { error: "Season cannot change after competitive records exist." };
  }

  try {
    await prisma.player.update({
      where: { id: playerId },
      data: {
        seasonId: parsed.data.seasonId,
        seasonClubId: parsed.data.seasonClubId || null,
        position: parsed.data.position,
        heightCm: parsed.data.heightCm,
        weightKg: parsed.data.weightKg,
        jerseyNumber: parsed.data.jerseyNumber ? Number(parsed.data.jerseyNumber) : null,
        status: parsed.data.status,
      },
    });
    revalidatePath("/players");
    revalidatePath(`/players/${parsed.data.athleteId}`);
    redirect(`/players/${parsed.data.athleteId}`);
  } catch (error) {
    unstable_rethrow(error);
    return mutationError(error);
  }
}

export async function deleteAthlete(athleteId: string) {
  await requirePermission("player:manage");
  if ((await prisma.player.count({ where: { athleteId } })) > 0) {
    redirect(`/players/${athleteId}?error=has-registrations`);
  }
  await prisma.athlete.delete({ where: { id: athleteId } });
  revalidatePath("/players");
  redirect("/players");
}

export async function removePlayerRegistration(playerId: string, athleteId: string) {
  await requirePermission("player:manage");
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: {
      _count: { select: { draftPicks: true, gameEvents: true, playerStats: true, mvpVotes: true } },
    },
  });
  if (Object.values(player._count).some((count) => count > 0)) {
    await prisma.player.update({
      where: { id: playerId },
      data: { status: "INACTIVE", seasonClubId: null, jerseyNumber: null },
    });
  } else {
    await prisma.player.delete({ where: { id: playerId } });
  }
  revalidatePath("/players");
  revalidatePath(`/players/${athleteId}`);
}
