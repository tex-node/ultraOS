import {
  ApplicationStatus,
  DraftSelectionGroup,
  LaunchBlockerPriority,
  OpsHealthStatus,
  OpsItemStatus,
  StaffRole,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type ReadinessDb = Prisma.TransactionClient | typeof prisma;

export const seasonZeroConfig = {
  competitionName: "Ultra Basketball",
  seasonName: "Season Zero 2026",
  launchDate: "2026-08-15",
  timezone: "Africa/Lagos",
  currency: "NGN",
  requiredDivisions: ["Men's Division", "Women's Division"],
} as const;

export const requiredSeasonZeroSettings = [
  "season-zero.launchDate",
  "season-zero.timezone",
  "season-zero.currency",
  "season-zero.minRosterSize",
  "season-zero.maxRosterSize",
  "season-zero.clubsPerDivision",
  "season-zero.squadsPerDivision",
  "season-zero.playersPerSquad",
  "season-zero.requiredHeadCoaches",
  "season-zero.optionalAssistantCoaches",
  "season-zero.winLeaguePoints",
  "season-zero.lossLeaguePoints",
  "season-zero.reservationHoldMinutes",
  "season-zero.qrCheckInRules",
  "season-zero.contentPublishingDefaults",
] as const;

export const requiredContentTemplateCount = 7;

const closedStatuses: OpsItemStatus[] = [OpsItemStatus.COMPLETE, OpsItemStatus.CANCELLED];

export type ReadinessSignal = {
  label: string;
  status: OpsHealthStatus;
  value: string | number;
  detail?: string;
};

export type ReadinessRecommendation = "READY" | "READY WITH CONDITIONS" | "NOT READY";

export function isLaunchBlockerOpen(status: OpsItemStatus) {
  return !closedStatuses.includes(status);
}

export function canMarkGoLiveReady(checks: { priority: LaunchBlockerPriority; status: OpsItemStatus }[]) {
  return !checks.some((check) => check.priority === LaunchBlockerPriority.P0 && isLaunchBlockerOpen(check.status));
}

export function readinessRecommendation(counts: { p0: number; p1: number; amber: number }): ReadinessRecommendation {
  if (counts.p0 > 0) return "NOT READY";
  if (counts.p1 > 0 || counts.amber > 0) return "READY WITH CONDITIONS";
  return "READY";
}

export function signalFromMissing(missing: number): OpsHealthStatus {
  return missing > 0 ? OpsHealthStatus.RED : OpsHealthStatus.GREEN;
}

export function signalFromCount(count: number, expected: number): OpsHealthStatus {
  if (count >= expected) return OpsHealthStatus.GREEN;
  return count > 0 ? OpsHealthStatus.AMBER : OpsHealthStatus.RED;
}

async function countUnsafe(db: ReadinessDb, sql: string) {
  const rows = await db.$queryRawUnsafe<{ count: bigint }[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

export async function demoDataCounts(db: ReadinessDb) {
  return {
    demoAthletes: await countUnsafe(db, `SELECT COUNT(*) FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'`),
    demoClubs: await countUnsafe(db, `SELECT COUNT(*) FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL')`),
    demoEvents: await countUnsafe(db, `SELECT COUNT(*) FROM "Event" WHERE "id" LIKE 'seed-event-%'`),
    demoStaff: await countUnsafe(db, `SELECT COUNT(*) FROM "Staff" WHERE "id" LIKE 'seed-coach-%'`),
    demoSponsors: await countUnsafe(db, `SELECT COUNT(*) FROM "SponsorCampaign" WHERE "id" LIKE 'seed-campaign-%'`),
  };
}

export async function requiredConfigurationReport(db: ReadinessDb) {
  const prisma = db;
  const sport = await prisma.sport.findUnique({ where: { slug: "basketball" } });
  const competition = sport
    ? await prisma.competition.findFirst({ where: { sportId: sport.id, slug: "ultra-basketball" } })
    : null;
  const season = competition
    ? await prisma.season.findUnique({ where: { competitionId_name: { competitionId: competition.id, name: seasonZeroConfig.seasonName } } })
    : null;
  const divisions = competition
    ? await prisma.division.findMany({ where: { competitionId: competition.id, name: { in: [...seasonZeroConfig.requiredDivisions] } } })
    : [];
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: [...requiredSeasonZeroSettings] } }, select: { key: true } });
  const templateCount = competition
    ? await prisma.contentTemplate.count({ where: { competitionId: competition.id, isActive: true } })
    : 0;

  const settingKeys = new Set(settings.map((setting) => setting.key));
  return {
    sport,
    competition,
    season,
    divisions,
    missing: [
      !sport ? "Basketball sport" : null,
      !competition ? "Ultra Basketball competition" : null,
      !season ? "Season Zero 2026 season" : null,
      ...seasonZeroConfig.requiredDivisions.filter((name) => !divisions.some((division) => division.name === name)),
      ...requiredSeasonZeroSettings.filter((key) => !settingKeys.has(key)),
      templateCount < requiredContentTemplateCount ? "Required content templates" : null,
    ].filter(Boolean) as string[],
    contentTemplateCount: templateCount,
  };
}

export async function realDataCounts(seasonId: string | undefined, db: ReadinessDb) {
  const prisma = db;
  return {
    users: await prisma.user.count(),
    clubs: await prisma.club.count(),
    seasonClubs: seasonId ? await prisma.seasonClub!.count({ where: { seasonId } }) : 0,
    athletes: await prisma.athlete.count(),
    players: seasonId ? await prisma.player.count({ where: { seasonId } }) : 0,
    coaches: await prisma.staff.count({ where: { role: { in: [StaffRole.HEAD_COACH, StaffRole.ASSISTANT_COACH] } } }),
    officials: await prisma.staff.count({ where: { role: StaffRole.OFFICIAL } }),
    vendors: await prisma.vendor.count(),
    events: seasonId ? await prisma.event.count({ where: { seasonId } }) : 0,
    fixtures: seasonId ? await prisma.fixture.count({ where: { seasonId } }) : 0,
    reservations: await prisma.seatReservation.count(),
    orders: await prisma.order.count(),
  };
}

export async function clubReadiness(seasonId: string, db: ReadinessDb) {
  const prisma = db;
  const seasonClubs = await prisma.seasonClub!.findMany({
    where: { seasonId },
    include: { club: { include: { fanClub: true } }, players: true, standing: true },
    orderBy: [{ division: { name: "asc" } }, { club: { name: "asc" } }],
  });
  const rows = seasonClubs.map((seasonClub) => {
    const club = seasonClub.club;
    const missing = [
      !club.name ? "official name" : null,
      !club.shortName ? "short name" : null,
      !club.logoUrl ? "logo" : null,
      !club.primaryColor || !club.secondaryColor ? "colors" : null,
      !seasonClub.headCoachId ? "head coach" : null,
      seasonClub.players.length === 0 ? "roster" : null,
      seasonClub.players.some((player) => player.jerseyNumber === null) ? "jersey numbers" : null,
      !club.fanClub ? "fan club" : null,
      !seasonClub.standing ? "standing" : null,
    ].filter(Boolean) as string[];
    return {
      seasonClubId: seasonClub.id,
      clubName: club.name,
      missing,
      ready: missing.length === 0,
    };
  });
  return {
    total: rows.length,
    ready: rows.filter((row) => row.ready).length,
    incomplete: rows.filter((row) => !row.ready).length,
    rows,
  };
}

export async function playerReconciliation(seasonId: string, db: ReadinessDb) {
  const prisma = db;
  const [
    totalApplications,
    approvedApplications,
    athleteIdentities,
    players,
    mainDraft,
    secondaryDraft,
    notSelected,
    pending,
    missingPhotos,
    missingPositions,
    missingMeasurements,
    duplicateSquadRows,
    assignedWithoutConfirmedAllocation,
  ] = await Promise.all([
    prisma.application.count({ where: { type: "PLAYER" } }),
    prisma.application.count({ where: { type: "PLAYER", status: ApplicationStatus.APPROVED } }),
    prisma.athlete.count(),
    prisma.player.count({ where: { seasonId } }),
    prisma.player.count({ where: { seasonId, draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT } }),
    prisma.player.count({ where: { seasonId, draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT } }),
    prisma.player.count({ where: { seasonId, draftSelectionGroup: DraftSelectionGroup.NOT_SELECTED } }),
    prisma.player.count({ where: { seasonId, draftSelectionGroup: DraftSelectionGroup.PENDING_SELECTION } }),
    prisma.player.count({ where: { seasonId, athlete: { photoUrl: null } } }),
    prisma.player.count({ where: { seasonId, position: "" } }),
    prisma.player.count({ where: { seasonId, OR: [{ heightCm: { lte: 0 } }, { weightKg: { lte: 0 } }] } }),
    countUnsafe(db,
      `SELECT COUNT(*) FROM (SELECT "playerId" FROM "DraftSquadMember" GROUP BY "playerId" HAVING COUNT(*) > 1) duplicates`,
    ),
    countUnsafe(db,
      `SELECT COUNT(*) FROM "Player" p WHERE p."seasonId" = '${seasonId.replace(/'/g, "''")}' AND p."seasonClubId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "DraftAllocation" da WHERE da."seasonClubId" = p."seasonClubId" AND da."status" = 'CONFIRMED')`,
    ),
  ]);

  return {
    totalApplications,
    approvedApplications,
    athleteIdentities,
    seasonPlayerRegistrations: players,
    mainDraft,
    secondaryDraft,
    notSelected,
    pending,
    missingPhotos,
    missingPositions,
    missingMeasurements,
    duplicateSquadMemberships: duplicateSquadRows,
    playersAssignedToClubsWithoutConfirmedAllocation: assignedWithoutConfirmedAllocation,
  };
}

export async function staffReadiness(db: ReadinessDb) {
  const prisma = db;
  const assignments = await prisma.eventStaffAssignment.count();
  const openAssignments = await prisma.eventStaffAssignment.count({ where: { status: { notIn: closedStatuses } } });
  const missingPeople = await prisma.eventStaffAssignment.count({ where: { userId: null, staffId: null, personName: null } });
  const accredited = await prisma.accreditation.count({ where: { status: "APPROVED" } });
  return {
    assignments,
    openAssignments,
    missingPeople,
    accredited,
  };
}

export async function draftReadiness(seasonId: string, db: ReadinessDb) {
  const prisma = db;
  const draftEvent = await prisma.draftEvent.findFirst({ where: { seasonId }, orderBy: { updatedAt: "desc" } });
  if (!draftEvent) {
    return { configured: false, squads: 0, allocations: 0, duplicateSquadMemberships: 0 };
  }
  return {
    configured: true,
    draftEventId: draftEvent.id,
    status: draftEvent.status,
    squads: await prisma.draftSquad.count({ where: { draftEventId: draftEvent.id } }),
    allocations: await prisma.draftAllocation.count({ where: { draftEventId: draftEvent.id } }),
    confirmedAllocations: await prisma.draftAllocation.count({ where: { draftEventId: draftEvent.id, status: "CONFIRMED" } }),
    duplicateSquadMemberships: await countUnsafe(db,
      `SELECT COUNT(*) FROM (SELECT dsm."playerId" FROM "DraftSquadMember" dsm JOIN "DraftSquad" ds ON ds."id" = dsm."draftSquadId" WHERE ds."draftEventId" = '${draftEvent.id.replace(/'/g, "''")}' GROUP BY dsm."playerId" HAVING COUNT(*) > 1) duplicates`,
    ),
  };
}

export async function eventReadiness(seasonId: string, db: ReadinessDb) {
  const prisma = db;
  const event = await prisma.event.findFirst({ where: { seasonId }, orderBy: { startTime: "asc" } });
  if (!event) return { configured: false };
  const [seatZones, inventoryItems, vendors, sponsorCampaigns, reservations] = await Promise.all([
    prisma.seatZone.count({ where: { eventId: event.id, isActive: true } }),
    prisma.vendorInventory.count({ where: { eventId: event.id } }),
    prisma.vendor.count({ where: { isActive: true, products: { some: { inventories: { some: { eventId: event.id } } } } } }),
    prisma.sponsorCampaign.count({ where: { eventId: event.id, isActive: true } }),
    prisma.seatReservation.count({ where: { eventId: event.id } }),
  ]);
  return {
    configured: true,
    eventId: event.id,
    eventName: event.name,
    venueId: event.venueId,
    seatZones,
    inventoryItems,
    vendors,
    sponsorCampaigns,
    reservations,
  };
}

export async function launchBlockerSummary(seasonId: string | undefined, db: ReadinessDb) {
  const prisma = db;
  const where = seasonId ? { seasonId } : {};
  const [p0, p1, p2, p3, open] = await Promise.all([
    prisma.launchReadinessCheck.count({ where: { ...where, priority: LaunchBlockerPriority.P0, status: { notIn: closedStatuses } } }),
    prisma.launchReadinessCheck.count({ where: { ...where, priority: LaunchBlockerPriority.P1, status: { notIn: closedStatuses } } }),
    prisma.launchReadinessCheck.count({ where: { ...where, priority: LaunchBlockerPriority.P2, status: { notIn: closedStatuses } } }),
    prisma.launchReadinessCheck.count({ where: { ...where, priority: LaunchBlockerPriority.P3, status: { notIn: closedStatuses } } }),
    prisma.launchReadinessCheck.count({ where: { ...where, status: { notIn: closedStatuses } } }),
  ]);
  return { p0, p1, p2, p3, open };
}

export async function seasonZeroReadinessReport(db: ReadinessDb) {
  const prisma = db;
  const configuration = await requiredConfigurationReport(db);
  const seasonId = configuration.season?.id;
  const [
    demos,
    counts,
    club,
    player,
    staff,
    draft,
    event,
    blockers,
    rehearsals,
    equipmentIssues,
    backupDocs,
    performanceDocs,
  ] = await Promise.all([
    demoDataCounts(db),
    realDataCounts(seasonId, db),
    seasonId ? clubReadiness(seasonId, db) : Promise.resolve(null),
    seasonId ? playerReconciliation(seasonId, db) : Promise.resolve(null),
    staffReadiness(db),
    seasonId ? draftReadiness(seasonId, db) : Promise.resolve(null),
    seasonId ? eventReadiness(seasonId, db) : Promise.resolve(null),
    launchBlockerSummary(seasonId, db),
    prisma.rehearsal.count(),
    prisma.equipment.count({ where: { status: { in: ["MAINTENANCE", "MISSING"] } } }),
    prisma.opsDocument.count({ where: { category: { contains: "backup", mode: "insensitive" } } }),
    prisma.opsDocument.count({ where: { category: { contains: "performance", mode: "insensitive" } } }),
  ]);
  const demoTotal = Object.values(demos).reduce((sum, count) => sum + count, 0);
  const amber =
    configuration.missing.length +
    demoTotal +
    (club?.incomplete ?? 0) +
    (player?.missingPhotos ?? 0) +
    (player?.missingPositions ?? 0) +
    (player?.missingMeasurements ?? 0) +
    (staff.missingPeople ?? 0) +
    (!draft?.configured ? 1 : 0) +
    (!event?.configured ? 1 : 0) +
    equipmentIssues;

  return {
    generatedAt: new Date().toISOString(),
    configuration,
    demoData: demos,
    realData: counts,
    clubReadiness: club,
    playerReadiness: player,
    staffReadiness: staff,
    draftReadiness: draft,
    eventReadiness: event,
    rehearsalStatus: { completedOrRecorded: rehearsals },
    performanceStatus: { documents: performanceDocs },
    backupRecoveryStatus: { documents: backupDocs },
    equipmentStatus: { issues: equipmentIssues },
    launchBlockers: blockers,
    canMarkGoLiveReady: blockers.p0 === 0,
    recommendation: readinessRecommendation({ p0: blockers.p0, p1: blockers.p1, amber }),
  };
}
