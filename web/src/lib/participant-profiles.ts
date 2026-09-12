import type { Prisma } from "@/generated/prisma/client";
import { MediaVisibility } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export function athleteCompleteness(input: {
  ultraAthleteId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | null;
  userId?: string | null;
  registrations?: { position?: string | null; heightCm?: number | null }[];
  emergencyContact?: string | null;
}) {
  const missing = [
    !input.ultraAthleteId ? "Ultra ID" : null,
    !input.firstName || !input.lastName ? "Name" : null,
    !input.photoUrl ? "Photo" : null,
    !input.gender ? "Gender" : null,
    !input.dateOfBirth ? "Date of birth" : null,
    !input.userId ? "Contact linkage" : null,
    !input.registrations?.length ? "Season registration" : null,
    input.registrations?.some((player) => !player.position || !player.heightCm) ? "Current registration details" : null,
    !input.emergencyContact ? "Emergency contact" : null,
  ].filter(Boolean) as string[];
  return { status: missing.length === 0 ? "COMPLETE" : missing.length > 3 ? "BLOCKED" : "ACTION REQUIRED", missing };
}

export function staffCompleteness(input: {
  ultraStaffId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}) {
  const missing = [
    !input.ultraStaffId ? "Ultra ID" : null,
    !input.name ? "Name" : null,
    !input.email && !input.phone ? "Contact details" : null,
    !input.role ? "Role" : null,
  ].filter(Boolean) as string[];
  return { status: missing.length === 0 ? "COMPLETE" : missing.length > 2 ? "BLOCKED" : "ACTION REQUIRED", missing };
}

type Db = Prisma.TransactionClient | typeof prisma;

export async function athleteCareerStats(athleteId: string, db: Db = prisma) {
  const stats = await db.playerStat.findMany({
    where: { player: { athleteId } },
    include: { game: { include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } } } }, player: true },
    orderBy: { game: { fixture: { scheduledAt: "desc" } } },
  });
  const totals = stats.reduce(
    (sum, stat) => ({
      games: sum.games + 1,
      points: sum.points + stat.points,
      rebounds: sum.rebounds + stat.rebounds,
      assists: sum.assists + stat.assists,
      steals: sum.steals + stat.steals,
      blocks: sum.blocks + stat.blocks,
      turnovers: sum.turnovers + stat.turnovers,
      fouls: sum.fouls + stat.fouls,
    }),
    { games: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 },
  );
  return { totals, averages: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, key === "games" ? value : totals.games ? Number((value / totals.games).toFixed(1)) : 0])), gameLog: stats };
}

export async function publicAthleteProfile(ultraAthleteId: string) {
  const organization = await resolveDefaultPublicOrganization();
  return withOrganizationContext(organization.id, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { ultraAthleteId },
      include: {
        registrations: {
          include: { season: true, seasonClub: { include: { club: true, division: true } }, draftSquadMembers: { include: { draftSquad: true } } },
          orderBy: { createdAt: "desc" },
        },
        awards: { orderBy: { awardedAt: "desc" } },
        media: { where: { visibility: MediaVisibility.PUBLIC, approved: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!athlete) return null;
    const current = athlete.registrations[0];
    const career = await athleteCareerStats(athlete.id, tx);
    return {
      ultraAthleteId: athlete.ultraAthleteId,
      name: `${athlete.firstName} ${athlete.lastName}`,
      photoUrl: athlete.photoUrl,
      currentClub: current?.seasonClub?.club.name ?? null,
      currentSeason: current?.season.name ?? null,
      position: current?.position ?? null,
      heightCm: current?.heightCm ?? null,
      careerStats: career.totals,
      awards: athlete.awards.map((award) => ({ name: award.name, awardedAt: award.awardedAt })),
      media: athlete.media.map((media) => ({ title: media.title, type: media.type, url: media.url, thumbnailUrl: media.thumbnailUrl })),
    };
  });
}

export function publicProfileKeys(profile: Record<string, unknown>) {
  const blocked = new Set(["email", "phone", "dateOfBirth", "emergencyContact", "submittedData", "documents", "scoutReports", "trainingRecords"]);
  return Object.keys(profile).filter((key) => !blocked.has(key));
}

// Phase 1 Stage 5.2B-3: `db` defaults to the bare client only so this stays backward-compatible
// if some other, not-yet-found caller exists - every caller this stage actually touched
// (draft-events/[draftEventId]/player-pool/page.tsx) passes its own scoped tx explicitly. A
// bare-`prisma` call here previously escaped whatever org context the caller had already
// established (stop condition #6: a shared helper reaching outside the scoped transaction) -
// under Org B, that meant this always fell back to Neon Ultra's RLS default and reported a
// perfectly real Org B player as "Player registration is missing."
export async function draftReadinessForPlayer(db: Prisma.TransactionClient | typeof prisma = prisma, playerId: string) {
  const player = await db.player.findUnique({
    where: { id: playerId },
    include: { athlete: true, draftSquadMembers: true, seasonClub: true },
  });
  if (!player) return { ready: false, blockers: ["Player registration is missing."] };
  const blockers = [
    !player.athlete ? "Athlete is missing." : null,
    !player.athlete.ultraAthleteId ? "Ultra Athlete ID is missing." : null,
    player.draftSquadMembers.length > 1 ? "Player is already in another squad." : null,
    player.seasonClubId ? "Player is already assigned to a SeasonClub." : null,
  ].filter(Boolean) as string[];
  return { ready: blockers.length === 0, blockers };
}
