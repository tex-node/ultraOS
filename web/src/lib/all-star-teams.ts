import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { ALL_STAR_TEAM_SLUGS, type AllStarTeamSlug } from "@/lib/all-star-teams-constants";
import { normalizePhone } from "@/lib/participant-internalization";
import { prisma } from "@/lib/prisma";

export { ALL_STAR_TEAM_SLUGS, type AllStarTeamSlug };

function keyFor(slug: AllStarTeamSlug) {
  return `all-star-team:${slug}`;
}

export type AllStarMemberKind = "PLAYER" | "COACH";
export type AllStarMemberGender = "MALE" | "FEMALE";

// Per-team composition target: 2 male + 2 female players, 2 male + 2 female coaches.
export const ALL_STAR_QUOTA_PER_TEAM = 2;

export type AllStarPlayerRecord = {
  id: string;
  kind: AllStarMemberKind;
  gender: AllStarMemberGender | null;
  sourcePlayerId: string | null;
  sourceStaffId: string | null;
  clubName: string | null;
  fullName: string;
  phone: string | null;
  bio: string | null;
  position: string | null;
  heightCm: number | null;
  weightKg: number | null;
  stats: string | null;
  addedAt: string;
  addedBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type TeamValue = {
  name: string;
  players?: AllStarPlayerRecord[];
  [key: string]: unknown;
};

export type AllStarTeamView = TeamValue & { slug: AllStarTeamSlug; name: string; players: AllStarPlayerRecord[] };

function normalizeMember(record: Partial<AllStarPlayerRecord> & { id: string; fullName: string; addedAt: string; addedBy: string }): AllStarPlayerRecord {
  return {
    bio: null,
    clubName: null,
    gender: null,
    heightCm: null,
    kind: "PLAYER",
    phone: null,
    position: null,
    sourcePlayerId: null,
    sourceStaffId: null,
    stats: null,
    updatedAt: null,
    updatedBy: null,
    weightKg: null,
    ...record,
  };
}

export async function getAllStarTeams(): Promise<AllStarTeamView[]> {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ALL_STAR_TEAM_SLUGS.map(keyFor) } } });
  return ALL_STAR_TEAM_SLUGS.map((slug) => {
    const setting = settings.find((s) => s.key === keyFor(slug));
    if (!setting) return null;
    const value = setting.value as TeamValue;
    return { ...value, slug, players: (value.players ?? []).map(normalizeMember) };
  }).filter((team): team is AllStarTeamView => team !== null);
}

export function countByKindAndGender(members: AllStarPlayerRecord[], kind: AllStarMemberKind, gender: AllStarMemberGender) {
  return members.filter((member) => member.kind === kind && member.gender === gender).length;
}

export type AllStarCandidate = {
  kind: AllStarMemberKind;
  sourceId: string;
  fullName: string;
  gender: AllStarMemberGender;
  phone: string | null;
  position: string | null;
  heightCm: number | null;
  weightKg: number | null;
  clubName: string | null;
};

// Real, currently-rostered players (drafted onto a club this season) and real, currently-assigned
// coaches (head/assistant coach of an active SeasonClub). Coach gender is derived from the division
// of the club they coach, since Staff has no personal gender field on file.
export async function getAllStarCandidatePool(): Promise<{
  playersMale: AllStarCandidate[];
  playersFemale: AllStarCandidate[];
  coachesMale: AllStarCandidate[];
  coachesFemale: AllStarCandidate[];
}> {
  const teams = await getAllStarTeams();
  const rosteredPlayerIds = new Set(teams.flatMap((team) => team.players.filter((m) => m.sourcePlayerId).map((m) => m.sourcePlayerId as string)));
  const rosteredStaffIds = new Set(teams.flatMap((team) => team.players.filter((m) => m.sourceStaffId).map((m) => m.sourceStaffId as string)));

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });

  const players = season
    ? await prisma.player.findMany({
        where: { seasonId: season.id, seasonClubId: { not: null } },
        include: { athlete: true, seasonClub: { include: { club: true } } },
        orderBy: { athlete: { firstName: "asc" } },
      })
    : [];

  const seasonClubs = await prisma.seasonClub.findMany({
    where: { status: "ACTIVE" },
    include: { headCoach: true, assistantCoach: true, division: true, club: true },
  });
  const coachesById = new Map<string, AllStarCandidate>();
  for (const seasonClub of seasonClubs) {
    const gender: AllStarMemberGender = seasonClub.division.slug === "women" ? "FEMALE" : "MALE";
    for (const staff of [seasonClub.headCoach, seasonClub.assistantCoach]) {
      if (!staff || rosteredStaffIds.has(staff.id) || coachesById.has(staff.id)) continue;
      coachesById.set(staff.id, {
        clubName: seasonClub.club.name,
        fullName: staff.name,
        gender,
        heightCm: null,
        kind: "COACH",
        phone: staff.phone,
        position: staff === seasonClub.headCoach ? "Head coach" : "Assistant coach",
        sourceId: staff.id,
        weightKg: null,
      });
    }
  }

  const playerCandidates: AllStarCandidate[] = players
    .filter((player) => !rosteredPlayerIds.has(player.id))
    .map((player) => ({
      clubName: player.seasonClub?.club.name ?? null,
      fullName: `${player.athlete.firstName} ${player.athlete.lastName}`,
      gender: player.athlete.gender,
      heightCm: player.heightCm,
      kind: "PLAYER" as const,
      phone: player.athlete.phone,
      position: player.position,
      sourceId: player.id,
      weightKg: player.weightKg,
    }));

  const coaches = Array.from(coachesById.values());

  return {
    coachesFemale: coaches.filter((c) => c.gender === "FEMALE"),
    coachesMale: coaches.filter((c) => c.gender === "MALE"),
    playersFemale: playerCandidates.filter((c) => c.gender === "FEMALE"),
    playersMale: playerCandidates.filter((c) => c.gender === "MALE"),
  };
}

export async function addAllStarRosterMember(
  slug: AllStarTeamSlug,
  input: { kind: AllStarMemberKind; sourceId: string },
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const key = keyFor(slug);
    const setting = await tx.systemSetting.findUniqueOrThrow({ where: { key } });
    const value = setting.value as TeamValue;
    if (value.locked) throw new Error(`${value.name}'s roster is locked. Unlock it first to make changes.`);
    const members = (value.players ?? []).map(normalizeMember);

    const alreadyRostered = members.some((m) =>
      input.kind === "PLAYER" ? m.sourcePlayerId === input.sourceId : m.sourceStaffId === input.sourceId,
    );
    if (alreadyRostered) throw new Error("This person is already on the roster.");

    let candidate: AllStarCandidate | undefined;
    if (input.kind === "PLAYER") {
      const player = await tx.player.findUnique({ where: { id: input.sourceId }, include: { athlete: true, seasonClub: { include: { club: true } } } });
      if (!player) throw new Error("Player not found.");
      candidate = {
        clubName: player.seasonClub?.club.name ?? null,
        fullName: `${player.athlete.firstName} ${player.athlete.lastName}`,
        gender: player.athlete.gender,
        heightCm: player.heightCm,
        kind: "PLAYER",
        phone: player.athlete.phone,
        position: player.position,
        sourceId: player.id,
        weightKg: player.weightKg,
      };
    } else {
      const staff = await tx.staff.findUnique({
        where: { id: input.sourceId },
        include: { headCoachAssignments: { where: { status: "ACTIVE" }, include: { division: true, club: true } }, assistantCoachAssignments: { where: { status: "ACTIVE" }, include: { division: true, club: true } } },
      });
      if (!staff) throw new Error("Coach not found.");
      const assignment = staff.headCoachAssignments[0] ?? staff.assistantCoachAssignments[0];
      if (!assignment) throw new Error("This coach is not currently assigned to an active club.");
      candidate = {
        clubName: assignment.club.name,
        fullName: staff.name,
        gender: assignment.division.slug === "women" ? "FEMALE" : "MALE",
        heightCm: null,
        kind: "COACH",
        phone: staff.phone,
        position: staff.headCoachAssignments[0] ? "Head coach" : "Assistant coach",
        sourceId: staff.id,
        weightKg: null,
      };
    }

    const existingCount = countByKindAndGender(members, candidate.kind, candidate.gender);
    if (existingCount >= ALL_STAR_QUOTA_PER_TEAM) {
      throw new Error(`${value.name} already has ${ALL_STAR_QUOTA_PER_TEAM} ${candidate.gender.toLowerCase()} ${candidate.kind === "COACH" ? "coaches" : "players"}.`);
    }

    const now = new Date().toISOString();
    const member: AllStarPlayerRecord = {
      addedAt: now,
      addedBy: actorId,
      bio: null,
      clubName: candidate.clubName,
      fullName: candidate.fullName,
      gender: candidate.gender,
      heightCm: candidate.heightCm,
      id: randomUUID(),
      kind: candidate.kind,
      phone: normalizePhone(candidate.phone ?? "") || null,
      position: candidate.position,
      sourcePlayerId: candidate.kind === "PLAYER" ? candidate.sourceId : null,
      sourceStaffId: candidate.kind === "COACH" ? candidate.sourceId : null,
      stats: null,
      updatedAt: null,
      updatedBy: null,
      weightKg: candidate.weightKg,
    };
    const updatedValue = { ...value, players: [...members, member] };
    await tx.systemSetting.update({ where: { key }, data: { value: updatedValue } });

    await writeAuditLog(tx, {
      action: "ALL_STAR_MEMBER_ADDED",
      details: { fullName: member.fullName, kind: member.kind, gender: member.gender, memberId: member.id, sourceId: input.sourceId, teamSlug: slug },
      entityId: `${slug}:${member.id}`,
      entityType: "AllStarPlayer",
      userId: actorId,
    });

    return member;
  });
}

export async function updateAllStarPlayer(
  slug: AllStarTeamSlug,
  playerId: string,
  input: { fullName?: string; phone?: string; bio?: string; position?: string; heightCm?: number; weightKg?: number; stats?: string },
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const key = keyFor(slug);
    const setting = await tx.systemSetting.findUniqueOrThrow({ where: { key } });
    const value = setting.value as TeamValue;
    const players = (value.players ?? []).map(normalizeMember);
    const index = players.findIndex((p) => p.id === playerId);
    if (index === -1) throw new Error("Player not found on this roster.");

    const existing = players[index];
    const updated: AllStarPlayerRecord = {
      ...existing,
      fullName: input.fullName?.trim() || existing.fullName,
      phone: input.phone !== undefined ? normalizePhone(input.phone) || null : existing.phone,
      bio: input.bio !== undefined ? input.bio.trim() || null : existing.bio,
      position: input.position !== undefined ? input.position.trim() || null : existing.position,
      heightCm: input.heightCm !== undefined ? input.heightCm : existing.heightCm,
      weightKg: input.weightKg !== undefined ? input.weightKg : existing.weightKg,
      stats: input.stats !== undefined ? input.stats.trim() || null : existing.stats,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    const updatedPlayers = [...players];
    updatedPlayers[index] = updated;
    const updatedValue = { ...value, players: updatedPlayers };
    await tx.systemSetting.update({ where: { key }, data: { value: updatedValue } });

    await writeAuditLog(tx, {
      action: "ALL_STAR_PLAYER_UPDATED",
      details: { changes: input, playerId, teamSlug: slug },
      entityId: `${slug}:${playerId}`,
      entityType: "AllStarPlayer",
      userId: actorId,
    });

    return updated;
  });
}

export async function lockAllStarRoster(slug: AllStarTeamSlug, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const key = keyFor(slug);
    const setting = await tx.systemSetting.findUniqueOrThrow({ where: { key } });
    const value = setting.value as TeamValue;
    const members = (value.players ?? []).map(normalizeMember);
    for (const kind of ["PLAYER", "COACH"] as const) {
      for (const gender of ["MALE", "FEMALE"] as const) {
        const count = countByKindAndGender(members, kind, gender);
        if (count !== ALL_STAR_QUOTA_PER_TEAM) {
          throw new Error(`${value.name} has ${count} ${gender.toLowerCase()} ${kind === "COACH" ? "coaches" : "players"}, needs exactly ${ALL_STAR_QUOTA_PER_TEAM} before locking.`);
        }
      }
    }
    await tx.systemSetting.update({ where: { key }, data: { value: { ...value, locked: true, lockedAt: new Date().toISOString(), lockedBy: actorId } } });
    await writeAuditLog(tx, {
      action: "ALL_STAR_ROSTER_LOCKED",
      details: { teamSlug: slug },
      entityId: slug,
      entityType: "AllStarTeam",
      userId: actorId,
    });
  });
}

export async function unlockAllStarRoster(slug: AllStarTeamSlug, actorId: string, reason: string) {
  if (!reason.trim()) throw new Error("A reason is required to unlock a roster.");
  return prisma.$transaction(async (tx) => {
    const key = keyFor(slug);
    const setting = await tx.systemSetting.findUniqueOrThrow({ where: { key } });
    const value = setting.value as TeamValue;
    await tx.systemSetting.update({ where: { key }, data: { value: { ...value, locked: false, lockedAt: null, lockedBy: null } } });
    await writeAuditLog(tx, {
      action: "ALL_STAR_ROSTER_UNLOCKED",
      details: { teamSlug: slug, reason },
      entityId: slug,
      entityType: "AllStarTeam",
      userId: actorId,
    });
  });
}
