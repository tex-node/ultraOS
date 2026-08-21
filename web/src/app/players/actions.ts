"use server";

import { Prisma } from "@/generated/prisma/client";
import { MediaAssetPurpose } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { formDataToRecord } from "@/lib/club-validation";
import {
  athleteSchema,
  playerSchema,
  type PlayerFormState,
} from "@/lib/player-validation";
import { prisma } from "@/lib/prisma";
import { validateImageFile } from "@/lib/media-storage";

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

export async function setPlayerJerseyNumber(playerId: string, seasonClubId: string, formData: FormData) {
  const session = await requirePermission("player:manage");
  const raw = formData.get("jerseyNumber");
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const jerseyNumber = trimmed === "" ? null : Number(trimmed);

  if (jerseyNumber !== null && (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 999)) {
    redirect(`/season-clubs/${seasonClubId}/roster?error=invalid-number`);
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { seasonClubId: true, jerseyNumber: true },
  });
  if (!player || player.seasonClubId !== seasonClubId) {
    redirect(`/season-clubs/${seasonClubId}/roster?error=player-not-on-roster`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: playerId }, data: { jerseyNumber } });
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "PLAYER_JERSEY_NUMBER_UPDATED",
        entityType: "Player",
        entityId: playerId,
        details: { previousJerseyNumber: player.jerseyNumber, newJerseyNumber: jerseyNumber },
      });
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/season-clubs/${seasonClubId}/roster?error=duplicate-number&number=${jerseyNumber}`);
    }
    redirect(`/season-clubs/${seasonClubId}/roster?error=update-failed`);
  }

  revalidatePath(`/season-clubs/${seasonClubId}/roster`);
  redirect(`/season-clubs/${seasonClubId}/roster`);
}

export type PlayerPhotoImportState = {
  preview?: {
    matchedUltraIds: string[];
    missingPlayers: string[];
    duplicateFiles: string[];
    invalidFiles: Array<{ fileName: string; reason: string }>;
    existingPhotoConflicts: string[];
    safeReplacements: string[];
  };
  error?: string;
};

export async function previewPlayerPhotoImport(
  _state: PlayerPhotoImportState,
  formData: FormData,
): Promise<PlayerPhotoImportState> {
  await requirePermission("media:upload");
  const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) return { error: "Upload at least one JPG, PNG, or WebP file named like UBA-000001.jpg." };

  const seen = new Map<string, number>();
  const rows = await Promise.all(files.map(async (file) => {
    const match = file.name.match(/^(UBA-\d{6})\.(jpe?g|png|webp)$/i);
    if (!match) return { file, ultraAthleteId: null, error: "Filename must match UBA-000001.jpg, .png, or .webp." };
    const ultraAthleteId = match[1].toUpperCase();
    seen.set(ultraAthleteId, (seen.get(ultraAthleteId) ?? 0) + 1);
    try {
      await validateImageFile(file, MediaAssetPurpose.PLAYER_PROFILE_PHOTO);
      return { file, ultraAthleteId, error: null };
    } catch (error) {
      return { file, ultraAthleteId, error: error instanceof Error ? error.message : "Invalid image file." };
    }
  }));

  const ultraIds = rows.map((row) => row.ultraAthleteId).filter((id): id is string => Boolean(id));
  const athletes = await prisma.athlete.findMany({
    where: { ultraAthleteId: { in: ultraIds } },
    select: { ultraAthleteId: true, photoUrl: true },
  });
  const athleteMap = new Map(athletes.map((athlete) => [athlete.ultraAthleteId, athlete]));
  const duplicateIds = new Set([...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id));

  const matchedUltraIds: string[] = [];
  const missingPlayers: string[] = [];
  const duplicateFiles: string[] = [];
  const invalidFiles: Array<{ fileName: string; reason: string }> = [];
  const existingPhotoConflicts: string[] = [];
  const safeReplacements: string[] = [];

  for (const row of rows) {
    if (!row.ultraAthleteId) {
      invalidFiles.push({ fileName: row.file.name, reason: row.error ?? "Invalid filename." });
      continue;
    }
    if (row.error) invalidFiles.push({ fileName: row.file.name, reason: row.error });
    if (duplicateIds.has(row.ultraAthleteId)) duplicateFiles.push(row.file.name);
    const athlete = athleteMap.get(row.ultraAthleteId);
    if (!athlete) {
      missingPlayers.push(row.ultraAthleteId);
      continue;
    }
    matchedUltraIds.push(row.ultraAthleteId);
    if (athlete.photoUrl) existingPhotoConflicts.push(row.ultraAthleteId);
    if (!row.error && !duplicateIds.has(row.ultraAthleteId)) safeReplacements.push(row.ultraAthleteId);
  }

  return { preview: { matchedUltraIds, missingPlayers, duplicateFiles, invalidFiles, existingPhotoConflicts, safeReplacements } };
}
