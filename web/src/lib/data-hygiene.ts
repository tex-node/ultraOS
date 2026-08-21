import { RecordOrigin } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type DataAuditReport = {
  demoRecords: Record<string, number>;
  rehearsalRecords: Record<string, number>;
  placeholderSignals: Record<string, number>;
  orphanedProfiles: Record<string, number>;
  profileIdGaps: Record<string, number>;
};

export async function auditRealData(): Promise<DataAuditReport> {
  const [demoClubs, demoAthletes, demoStaff, demoEvents, rehearsalClubs, rehearsalAthletes, rehearsalStaff, rehearsalEvents] =
    await Promise.all([
      prisma.club.count({ where: { OR: [{ recordOrigin: RecordOrigin.DEMO }, { shortName: { in: ["VTX", "APX", "FLX", "SRG", "NVA", "HLO", "EMB", "ECL"] } }] } }),
      prisma.athlete.count({ where: { OR: [{ recordOrigin: RecordOrigin.DEMO }, { email: { endsWith: "@athletes.neonultra.ng" } }] } }),
      prisma.staff.count({ where: { OR: [{ recordOrigin: RecordOrigin.DEMO }, { id: { startsWith: "seed-coach-" } }] } }),
      prisma.event.count({ where: { OR: [{ recordOrigin: RecordOrigin.DEMO }, { id: { startsWith: "seed-event-" } }] } }),
      prisma.club.count({ where: { OR: [{ recordOrigin: RecordOrigin.REHEARSAL }, { name: { contains: "REHEARSAL", mode: "insensitive" } }] } }),
      prisma.athlete.count({ where: { OR: [{ recordOrigin: RecordOrigin.REHEARSAL }, { email: { contains: "rehearsal", mode: "insensitive" } }] } }),
      prisma.staff.count({ where: { OR: [{ recordOrigin: RecordOrigin.REHEARSAL }, { name: { contains: "REHEARSAL", mode: "insensitive" } }] } }),
      prisma.event.count({ where: { OR: [{ recordOrigin: RecordOrigin.REHEARSAL }, { name: { contains: "REHEARSAL", mode: "insensitive" } }] } }),
    ]);

  return {
    demoRecords: { clubs: demoClubs, athletes: demoAthletes, staff: demoStaff, events: demoEvents },
    rehearsalRecords: { clubs: rehearsalClubs, athletes: rehearsalAthletes, staff: rehearsalStaff, events: rehearsalEvents },
    placeholderSignals: {
      placeholderEmails: await prisma.user.count({ where: { email: { contains: "example.", mode: "insensitive" } } }),
      placeholderAthleteEmails: await prisma.athlete.count({ where: { email: { contains: "example.", mode: "insensitive" } } }),
      placeholderImages: await prisma.athlete.count({ where: { photoUrl: { contains: "example.com", mode: "insensitive" } } }),
      unsplashImages: await prisma.athlete.count({ where: { photoUrl: { contains: "unsplash", mode: "insensitive" } } }),
    },
    orphanedProfiles: {
      athletesWithoutUser: await prisma.athlete.count({ where: { userId: null } }),
      staffWithoutUser: await prisma.staff.count({ where: { userId: null } }),
      approvedApplicationsWithoutProvisioning: await prisma.application.count({
        where: { status: "APPROVED", provisionedUserId: null },
      }),
    },
    profileIdGaps: {
      athletesMissingUltraId: await prisma.athlete.count({ where: { ultraAthleteId: null } }),
      staffMissingUltraId: await prisma.staff.count({ where: { ultraStaffId: null } }),
    },
  };
}

export async function purgePlan(origin: "DEMO" | "REHEARSAL") {
  const recordOrigin = origin === "DEMO" ? RecordOrigin.DEMO : RecordOrigin.REHEARSAL;
  const label = origin === "DEMO" ? "seed" : "rehearsal";
  const roots = {
    clubs: await prisma.club.findMany({ where: { OR: [{ recordOrigin }, { name: { contains: label, mode: "insensitive" } }, ...(origin === "DEMO" ? [{ shortName: { in: ["VTX", "APX", "FLX", "SRG", "NVA", "HLO", "EMB", "ECL"] } }] : [])] }, select: { id: true, recordOrigin: true } }),
    athletes: await prisma.athlete.findMany({ where: { OR: [{ recordOrigin }, { email: { contains: label, mode: "insensitive" } }] }, select: { id: true, recordOrigin: true, userId: true } }),
    staff: await prisma.staff.findMany({ where: { OR: [{ recordOrigin }, { name: { contains: label, mode: "insensitive" } }, { id: { startsWith: `${label}-` } }] }, select: { id: true, recordOrigin: true, userId: true } }),
    events: await prisma.event.findMany({ where: { OR: [{ recordOrigin }, { name: { contains: label, mode: "insensitive" } }, { id: { startsWith: `${label}-event-` } }] }, select: { id: true, recordOrigin: true } }),
  };
  const clubIds = roots.clubs.map((root) => root.id);
  const athleteIds = roots.athletes.map((root) => root.id);
  const staffIds = roots.staff.map((root) => root.id);
  const eventIds = roots.events.map((root) => root.id);
  const userIds = [...roots.athletes, ...roots.staff].map((root) => root.userId).filter(Boolean) as string[];
  const seasonClubIds = (await prisma.seasonClub.findMany({
    where: { OR: [{ recordOrigin }, { clubId: { in: clubIds } }, { headCoachId: { in: staffIds } }, { assistantCoachId: { in: staffIds } }, { teamManagerId: { in: staffIds } }, { scoutId: { in: staffIds } }, { fanCaptainId: { in: staffIds } }] },
    select: { id: true },
  })).map((item) => item.id);
  const playerIds = (await prisma.player.findMany({ where: { athleteId: { in: athleteIds } }, select: { id: true } })).map((item) => item.id);
  const draftEventIds = (await prisma.draftEvent.findMany({ where: { OR: [{ recordOrigin }, { eventId: { in: eventIds } }] }, select: { id: true } })).map((item) => item.id);
  const draftSquadIds = (await prisma.draftSquad.findMany({ where: { draftEventId: { in: draftEventIds } }, select: { id: true } })).map((item) => item.id);
  const fixtureIds = (await prisma.fixture.findMany({ where: { OR: [{ recordOrigin }, { eventId: { in: eventIds } }, { homeSeasonClubId: { in: seasonClubIds } }, { awaySeasonClubId: { in: seasonClubIds } }] }, select: { id: true } })).map((item) => item.id);
  const gameIds = (await prisma.game.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { id: true } })).map((item) => item.id);
  const reservationIds = (await prisma.seatReservation.findMany({ where: { OR: [{ eventId: { in: eventIds } }, { userId: { in: userIds } }] }, select: { id: true } })).map((item) => item.id);
  const ticketIds = (await prisma.ticket.findMany({ where: { reservationId: { in: reservationIds } }, select: { id: true } })).map((item) => item.id);
  const orderIds = (await prisma.order.findMany({ where: { OR: [{ eventId: { in: eventIds } }, { reservationId: { in: reservationIds } }, { userId: { in: userIds } }] }, select: { id: true } })).map((item) => item.id);
  const trainingSessionIds = (await prisma.trainingSession.findMany({ where: { OR: [{ coachId: { in: staffIds } }, { seasonClubId: { in: seasonClubIds } }] }, select: { id: true } })).map((item) => item.id);
  const runbookIds = (await prisma.runbook.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } })).map((item) => item.id);

  const dependencyPlan = [
    { table: "CheckIn", action: "delete", auditTreatment: "retain audit references", count: await prisma.checkIn.count({ where: { OR: [{ ticketId: { in: ticketIds } }, { orderId: { in: orderIds } }, { checkedInById: { in: userIds } }] } }) },
    { table: "OrderItem", action: "delete", auditTreatment: "retain audit references", count: await prisma.orderItem.count({ where: { orderId: { in: orderIds } } }) },
    { table: "Ticket", action: "delete", auditTreatment: "retain audit references", count: ticketIds.length },
    { table: "Order", action: "delete", auditTreatment: "retain audit references", count: orderIds.length },
    { table: "SeatReservation", action: "delete", auditTreatment: "retain audit references", count: reservationIds.length },
    { table: "AthleteTrainingMetric", action: "delete", auditTreatment: "retain audit references", count: await prisma.athleteTrainingMetric.count({ where: { athleteTrainingRecord: { OR: [{ athleteId: { in: athleteIds } }, { playerId: { in: playerIds } }, { trainingSessionId: { in: trainingSessionIds } }] } } }) },
    { table: "AthleteTrainingRecord", action: "delete", auditTreatment: "retain audit references", count: await prisma.athleteTrainingRecord.count({ where: { OR: [{ athleteId: { in: athleteIds } }, { playerId: { in: playerIds } }, { trainingSessionId: { in: trainingSessionIds } }] } }) },
    { table: "AthleteMedia", action: "delete", auditTreatment: "retain audit references", count: await prisma.athleteMedia.count({ where: { OR: [{ athleteId: { in: athleteIds } }, { playerId: { in: playerIds } }, { fixtureId: { in: fixtureIds } }, { trainingSessionId: { in: trainingSessionIds } }] } }) },
    { table: "AthleteAward", action: "delete", auditTreatment: "retain audit references", count: await prisma.athleteAward.count({ where: { athleteId: { in: athleteIds } } }) },
    { table: "ScoutReport", action: "delete", auditTreatment: "retain audit references", count: await prisma.scoutReport.count({ where: { OR: [{ athleteId: { in: athleteIds } }, { scoutId: { in: userIds } }] } }) },
    { table: "GameEvent", action: "delete", auditTreatment: "retain audit references", count: await prisma.gameEvent.count({ where: { OR: [{ gameId: { in: gameIds } }, { playerId: { in: playerIds } }, { seasonClubId: { in: seasonClubIds } }] } }) },
    { table: "PlayerStat", action: "delete", auditTreatment: "retain audit references", count: await prisma.playerStat.count({ where: { OR: [{ gameId: { in: gameIds } }, { playerId: { in: playerIds } }, { seasonClubId: { in: seasonClubIds } }] } }) },
    { table: "TeamStat", action: "delete", auditTreatment: "retain audit references", count: await prisma.teamStat.count({ where: { OR: [{ gameId: { in: gameIds } }, { seasonClubId: { in: seasonClubIds } }] } }) },
    { table: "Game", action: "delete", auditTreatment: "retain audit references", count: gameIds.length },
    { table: "FixtureOfficial", action: "delete", auditTreatment: "retain audit references", count: await prisma.fixtureOfficial.count({ where: { fixtureId: { in: fixtureIds } } }) },
    { table: "Fixture", action: "delete", auditTreatment: "retain audit references", count: fixtureIds.length },
    { table: "DraftAllocation", action: "delete", auditTreatment: "retain audit references", count: await prisma.draftAllocation.count({ where: { OR: [{ draftEventId: { in: draftEventIds } }, { draftSquadId: { in: draftSquadIds } }, { staffId: { in: staffIds } }, { seasonClubId: { in: seasonClubIds } }] } }) },
    { table: "DraftCoachPoolEntry", action: "delete", auditTreatment: "retain audit references", count: await prisma.draftCoachPoolEntry.count({ where: { OR: [{ draftEventId: { in: draftEventIds } }, { staffId: { in: staffIds } }] } }) },
    { table: "DraftSquadMember", action: "delete", auditTreatment: "retain audit references", count: await prisma.draftSquadMember.count({ where: { OR: [{ draftSquadId: { in: draftSquadIds } }, { playerId: { in: playerIds } }] } }) },
    { table: "DraftSquad", action: "delete", auditTreatment: "retain audit references", count: draftSquadIds.length },
    { table: "DraftEvent", action: "delete", auditTreatment: "retain audit references", count: draftEventIds.length },
    { table: "Standing", action: "delete", auditTreatment: "retain audit references", count: await prisma.standing.count({ where: { seasonClubId: { in: seasonClubIds } } }) },
    { table: "Player", action: "delete", auditTreatment: "retain audit references", count: playerIds.length },
    { table: "TrainingSession", action: "delete-or-detach", auditTreatment: "retain audit references", count: trainingSessionIds.length },
    { table: "SeasonClub", action: "delete", auditTreatment: "retain audit references", count: seasonClubIds.length },
    { table: "RunbookTask", action: "delete", auditTreatment: "retain audit references", count: await prisma.runbookTask.count({ where: { runbookId: { in: runbookIds } } }) },
    { table: "Runbook", action: "delete", auditTreatment: "retain audit references", count: runbookIds.length },
    { table: "Incident", action: "delete", auditTreatment: "retain audit references", count: await prisma.incident.count({ where: { OR: [{ eventId: { in: eventIds } }, { ownerUserId: { in: userIds } }, { reportedById: { in: userIds } }] } }) },
    { table: "Rehearsal", action: "delete", auditTreatment: "retain audit references", count: await prisma.rehearsal.count({ where: { eventId: { in: eventIds } } }) },
    { table: "ContentAsset", action: "preserve", auditTreatment: "not selected unless source links are reviewed", count: await prisma.contentAsset.count({ where: { job: { sourceId: { in: [...eventIds, ...fixtureIds, ...gameIds, ...athleteIds, ...playerIds, ...staffIds] } } } }) },
    { table: "ContentJob", action: "preserve", auditTreatment: "not selected unless source links are reviewed", count: await prisma.contentJob.count({ where: { sourceId: { in: [...eventIds, ...fixtureIds, ...gameIds, ...athleteIds, ...playerIds, ...staffIds] } } }) },
    { table: "Application", action: "preserve", auditTreatment: "applications are not rehearsal purge targets", count: await prisma.application.count({ where: { applicantUserId: { in: userIds } } }) },
    { table: "User", action: "preserve-or-detach", auditTreatment: "do not delete users without dedicated review", count: userIds.length },
    { table: "Staff", action: "delete", auditTreatment: "retain audit references", count: staffIds.length },
    { table: "Athlete", action: "delete", auditTreatment: "retain audit references", count: athleteIds.length },
    { table: "Event", action: "delete", auditTreatment: "retain audit references", count: eventIds.length },
    { table: "Club", action: "delete", auditTreatment: "retain audit references", count: clubIds.length },
    { table: "AuditLog", action: "preserve", auditTreatment: "retain immutable audit history with possibly stale references", count: await prisma.auditLog.count({ where: { OR: [{ entityId: { in: [...clubIds, ...athleteIds, ...staffIds, ...eventIds, ...seasonClubIds, ...playerIds, ...draftEventIds, ...fixtureIds, ...gameIds] } }, { userId: { in: userIds } }] } }) },
  ];

  const rootDetails = [
    ...roots.clubs.map((root) => ({ entity: "Club", id: root.id, recordOrigin: root.recordOrigin })),
    ...roots.athletes.map((root) => ({ entity: "Athlete", id: root.id, recordOrigin: root.recordOrigin })),
    ...roots.staff.map((root) => ({ entity: "Staff", id: root.id, recordOrigin: root.recordOrigin })),
    ...roots.events.map((root) => ({ entity: "Event", id: root.id, recordOrigin: root.recordOrigin })),
  ];

  return {
    dryRun: true,
    origin,
    roots: rootDetails,
    counts: {
      clubs: roots.clubs.length,
      athletes: roots.athletes.length,
      staff: roots.staff.length,
      events: roots.events.length,
    },
    dependencies: dependencyPlan,
    deletionOrder: dependencyPlan.filter((item) => item.action === "delete").map((item) => item.table),
    preservedSystemRecords: ["Sport", "Competition", "Season", "Division", "SystemSetting", "ContentTemplate", "Prisma migrations"],
    note: "Dry-run only. Destructive purge requires explicit confirmation and a backup; implementation intentionally does not delete by names alone.",
  };
}
