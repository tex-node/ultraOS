import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const LAGOS_TIME_ZONE = "Africa/Lagos";

export function currentLagosYearMonth(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

export type CelebrantRow = {
  playerId: string;
  athleteName: string;
  birthDay: number;
  jerseyNumber: number | null;
  clubName: string | null;
  clubShortName: string | null;
  announcement: {
    id: string;
    status: string;
    visibility: string;
    visibilityClubId: string | null;
    message: string | null;
  } | null;
};

export async function getCelebrantsForMonth(seasonId: string, year: number, month: number, db: Db = prisma): Promise<CelebrantRow[]> {
  const players = await db.player.findMany({
    where: { seasonId, seasonClubId: { not: null } },
    include: {
      athlete: true,
      seasonClub: { include: { club: true } },
      announcements: { where: { celebrationYear: year } },
    },
    orderBy: { athlete: { firstName: "asc" } },
  });

  return players
    .filter((player) => player.athlete.dateOfBirth.getUTCMonth() + 1 === month)
    .map((player) => ({
      playerId: player.id,
      athleteName: `${player.athlete.firstName} ${player.athlete.lastName}`,
      birthDay: player.athlete.dateOfBirth.getUTCDate(),
      jerseyNumber: player.jerseyNumber,
      clubName: player.seasonClub?.club.name ?? null,
      clubShortName: player.seasonClub?.club.shortName ?? null,
      announcement: player.announcements[0]
        ? {
            id: player.announcements[0].id,
            status: player.announcements[0].status,
            visibility: player.announcements[0].visibility,
            visibilityClubId: player.announcements[0].visibilityClubId,
            message: player.announcements[0].message,
          }
        : null,
    }))
    .sort((a, b) => a.birthDay - b.birthDay);
}

type Db = Prisma.TransactionClient | typeof prisma;

export async function getViewerClubMemberships(userId: string | undefined, db: Db = prisma): Promise<Set<string>> {
  if (!userId) return new Set();
  const memberships = await db.fanMembership.findMany({
    where: { userId },
    select: { fanClub: { select: { clubId: true } } },
  });
  return new Set(memberships.map((membership) => membership.fanClub.clubId));
}

export function canViewAnnouncement(
  visibility: string,
  visibilityClubId: string | null,
  viewerClubIds: Set<string>,
): boolean {
  if (visibility === "PUBLIC") return true;
  if (visibility === "FAN_ZONE_MEMBERS") return viewerClubIds.size > 0;
  if (visibility === "CLUB_FAN_ZONE") return Boolean(visibilityClubId && viewerClubIds.has(visibilityClubId));
  return false;
}
