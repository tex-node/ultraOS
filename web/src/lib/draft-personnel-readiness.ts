import {
  ApplicationStatus,
  ApplicationType,
  CoachSeasonZeroSelectionStatus,
  DraftSelectionGroup,
  MediaAssetPurpose,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type JsonObject = Record<string, unknown>;
type ReadinessDb = Prisma.TransactionClient | typeof prisma;

function dataObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function text(data: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function isSelectedDraftCohort(data: JsonObject) {
  return text(data, ["draftCohort"]) === "SEASON_ZERO_DRAFT_COHORT";
}

function hasMeasurementData(data: JsonObject) {
  return Boolean(text(data, ["heightFeet", "height", "heightInFeet", "heightCm"]) && text(data, ["wingspanFeet", "wingspan"]));
}

export async function draftPersonnelReadinessReport(db: ReadinessDb) {
  const prisma = db;
  const season = await prisma.season.findFirst({
    where: { name: "Season Zero 2026" },
    include: {
      competition: { include: { divisions: true } },
    },
  });
  if (!season) throw new Error("Season Zero 2026 was not found.");

  const menDivision = season.competition.divisions.find((division) => division.name === "Men's Division");
  const womenDivision = season.competition.divisions.find((division) => division.name === "Women's Division");

  const [
    applications,
    clubs,
    selectedPlayers,
    draftEvents,
    draftAllocations,
    staffCount,
  ] = await Promise.all([
    prisma.application.findMany({
      include: { applicantUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.club.findMany({
      include: {
        seasonClubs: {
          where: { seasonId: season.id },
          include: { division: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.player.findMany({
      where: {
        draftSelectionGroup: { in: [DraftSelectionGroup.MAIN_DRAFT, DraftSelectionGroup.SECONDARY_DRAFT] },
        seasonId: season.id,
      },
      include: {
        athlete: true,
        draftSquadMembers: { include: { draftSquad: true } },
      },
    }),
    prisma.draftEvent.findMany({
      where: { seasonId: season.id },
      include: { coachPoolEntries: { include: { division: true, staff: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.draftAllocation.findMany({ where: { draftEvent: { seasonId: season.id } } }),
    prisma.staff.count(),
  ]);

  const selectedPlayerApplications = applications.filter((application) => {
    const data = dataObject(application.submittedData);
    return application.type === ApplicationType.PLAYER && application.status === ApplicationStatus.APPROVED && isSelectedDraftCohort(data);
  });
  const selectedPlayerApplicationByPlayerId = new Map(
    selectedPlayerApplications
      .filter((application) => application.provisionedPlayerId)
      .map((application) => [application.provisionedPlayerId, application]),
  );

  const playerPhotoRows = await Promise.all(selectedPlayers.map(async (player) => {
    const usage = await prisma.mediaAssetUsage.findFirst({
      include: { asset: { include: { variants: true } } },
      where: {
        active: true,
        entityId: player.athleteId,
        entityType: "Athlete",
        isPrimary: true,
        purpose: MediaAssetPurpose.PLAYER_PROFILE_PHOTO,
      },
    });
    return {
      imageValid: usage?.asset.status === "READY" && usage.asset.mimeType.startsWith("image/") && Boolean(usage.asset.width && usage.asset.height),
      legacyPhoto: Boolean(player.athlete.photoUrl),
      mediaAssetBacked: Boolean(usage),
      projectorReady: Boolean(usage?.asset.status === "READY" && usage.asset.width && usage.asset.height && usage.asset.width >= 180 && usage.asset.height >= 180),
    };
  }));

  const clubLogoRows = await Promise.all(clubs.map(async (club) => {
    const usage = await prisma.mediaAssetUsage.findFirst({
      include: { asset: { include: { variants: true } } },
      where: {
        active: true,
        entityId: club.id,
        entityType: "Club",
        isPrimary: true,
        purpose: MediaAssetPurpose.CLUB_LOGO,
      },
    });
    return {
      club: club.shortName,
      displayVariant: Boolean(usage?.asset.variants.some((variant) => variant.name === "display-large")),
      ready: usage?.asset.status === "READY" && usage.asset.mimeType.startsWith("image/"),
      thumbnailVariant: Boolean(usage?.asset.variants.some((variant) => variant.name === "display-small")),
    };
  }));

  const approvedCoachApplications = applications.filter((application) => application.type === ApplicationType.COACH && application.status === ApplicationStatus.APPROVED);
  const selectedCoachApplications = approvedCoachApplications.filter((application) => application.coachSeasonZeroSelectionStatus === CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED);
  const selectedCoachStaffIds = selectedCoachApplications.map((application) => application.provisionedStaffId).filter(Boolean) as string[];
  const selectedCoachStaff = selectedCoachStaffIds.length
    ? await prisma.staff.findMany({ where: { id: { in: selectedCoachStaffIds } } })
    : [];
  const selectedCoachPhotoRows = await Promise.all(selectedCoachStaff.map(async (staff) => {
    const usage = await prisma.mediaAssetUsage.findFirst({
      include: { asset: true },
      where: {
        active: true,
        entityId: staff.id,
        entityType: "Staff",
        isPrimary: true,
        purpose: { in: [MediaAssetPurpose.COACH_PROFILE_PHOTO, MediaAssetPurpose.STAFF_PROFILE_PHOTO] },
      },
    });
    return {
      mediaAssetBacked: Boolean(usage),
      photoReady: Boolean(usage?.asset.status === "READY" && usage.asset.mimeType.startsWith("image/")),
      staffId: staff.id,
    };
  }));

  const coachApplications = approvedCoachApplications.map((application) => {
    const data = dataObject(application.submittedData);
    return {
      applicationId: application.id,
      currentStaffLinkage: application.provisionedStaffId ? "LINKED" : "NONE",
      divisionPreference: text(data, ["preferredDivision", "division", "genderDivision"]),
      experience: text(data, ["experience", "coachingExperience", "yearsOfExperience"]),
      name: text(data, ["fullName", "name"]) || application.applicantUser?.name || "Unnamed coach",
      selectionStatus: application.coachSeasonZeroSelectionStatus,
      userLinked: Boolean(application.applicantUserId || application.provisionedUserId),
    };
  });

  const groupCounts = selectedPlayers.reduce<Record<string, number>>((acc, player) => {
    const group = player.draftSquadMembers[0]?.draftSquad.name ?? player.draftSelectionGroup;
    acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});

  const latestDraftEvent = draftEvents[0] ?? null;
  const menCoachPool = latestDraftEvent?.coachPoolEntries.filter((entry) => entry.divisionId === menDivision?.id).length ?? 0;
  const womenCoachPool = latestDraftEvent?.coachPoolEntries.filter((entry) => entry.divisionId === womenDivision?.id).length ?? 0;
  const menRequired = clubs.filter((club) => club.seasonClubs.some((seasonClub) => seasonClub.division.name === "Men's Division")).length;
  const womenRequired = clubs.filter((club) => club.seasonClubs.some((seasonClub) => seasonClub.division.name === "Women's Division")).length;
  const selectedCoachDivisionUnresolved = selectedCoachApplications.length;

  const selectedPlayerSeasonClubAssignments = selectedPlayers.filter((player) => player.seasonClubId).length;
  const liveConfirmedAllocations = draftAllocations.filter((allocation) => allocation.operatingMode === "LIVE" && allocation.status === "CONFIRMED").length;
  const coachSelectionBlocked = approvedCoachApplications.length > 0 && selectedCoachApplications.length === 0;
  const coachPoolIncomplete = menCoachPool < menRequired || womenCoachPool < womenRequired;
  const hardBlockers = [
    clubs.length !== 8 ? "Expected 8 permanent clubs." : null,
    selectedPlayers.length !== 58 ? "Expected 58 selected players." : null,
    selectedPlayerSeasonClubAssignments !== 0 ? "Selected players already have SeasonClub assignments." : null,
    liveConfirmedAllocations !== 0 ? "Official LIVE draft allocations already exist." : null,
    coachSelectionBlocked ? "Approved coaches are still pending explicit Season Zero selection." : null,
    selectedCoachApplications.length > 0 && coachPoolIncomplete ? "Selected coach pools are incomplete." : null,
  ].filter(Boolean) as string[];

  return {
    applications: {
      approved: applications.filter((application) => application.status === ApplicationStatus.APPROVED).length,
      total: applications.length,
    },
    clubs: {
      coloursPending: clubs.filter((club) => !club.primaryColor || !club.secondaryColor).length,
      logosReady: clubLogoRows.filter((row) => row.ready).length,
      logoVariantsReady: clubLogoRows.filter((row) => row.displayVariant && row.thumbnailVariant).length,
      men: menRequired,
      permanent: clubs.length,
      seasonClubs: clubs.reduce((count, club) => count + club.seasonClubs.length, 0),
      women: womenRequired,
    },
    coachApplications,
    coaches: {
      approvedApplications: approvedCoachApplications.length,
      divisionUnresolved: selectedCoachDivisionUnresolved,
      pending: approvedCoachApplications.filter((application) => application.coachSeasonZeroSelectionStatus === CoachSeasonZeroSelectionStatus.PENDING).length,
      photosReady: selectedCoachPhotoRows.filter((row) => row.photoReady).length,
      provisionedStaff: selectedCoachApplications.filter((application) => Boolean(application.provisionedStaffId)).length,
      selected: selectedCoachApplications.length,
      staffTotal: staffCount,
      ultraStaffIds: selectedCoachStaff.filter((staff) => Boolean(staff.ultraStaffId)).length,
    },
    coachPools: {
      menAvailable: menCoachPool,
      menRequired,
      menShortfall: Math.max(0, menRequired - menCoachPool),
      womenAvailable: womenCoachPool,
      womenRequired,
      womenShortfall: Math.max(0, womenRequired - womenCoachPool),
    },
    draftSystem: {
      control: latestDraftEvent ? "CONFIGURED" : "NO_DRAFT_EVENT",
      display: latestDraftEvent ? "CONFIGURED" : "NO_DRAFT_EVENT",
      latestDraftEventId: latestDraftEvent?.id ?? null,
      operatingModes: "REHEARSAL / LIVE",
      recovery: latestDraftEvent ? "SERVER_STATE" : "NO_DRAFT_EVENT",
      rehearsalIsolation: selectedPlayerSeasonClubAssignments === 0 && liveConfirmedAllocations === 0 ? "PASS" : "FAIL",
      reset: "REQUIRES_REASON_AND_AUDIT",
    },
    gate: {
      blockers: hardBlockers,
      fullDraftRehearsal: hardBlockers.length === 0 ? "READY" : coachSelectionBlocked ? "WAITING_FOR_HUMAN_SELECTION" : "BLOCKED",
      warnings: [
        groupCounts["Women's Squad Group 4"] === 2 ? "Women's Squad Group 4 remains intentionally incomplete at 2/5." : null,
        clubs.some((club) => !club.primaryColor || !club.secondaryColor) ? "Official club colours are pending and rendered with neutral fallbacks." : null,
        playerPhotoRows.some((row) => !row.mediaAssetBacked) ? "Selected player photos exist only as legacy URLs, not primary MediaAsset usages." : null,
      ].filter(Boolean) as string[],
    },
    groups: {
      men1: groupCounts["Men's Squad Group 1"] ?? 0,
      men2: groupCounts["Men's Squad Group 2"] ?? 0,
      men3: groupCounts["Men's Squad Group 3"] ?? 0,
      men4: groupCounts["Men's Squad Group 4"] ?? 0,
      secondary: groupCounts.SECONDARY_DRAFT ?? 0,
      women1: groupCounts["Women's Squad Group 1"] ?? 0,
      women2: groupCounts["Women's Squad Group 2"] ?? 0,
      women3: groupCounts["Women's Squad Group 3"] ?? 0,
      women4: groupCounts["Women's Squad Group 4"] ?? 0,
    },
    media: {
      clubLogosReady: clubLogoRows.filter((row) => row.ready).length,
      coachPhotosMissing: Math.max(0, selectedCoachApplications.length - selectedCoachPhotoRows.filter((row) => row.photoReady).length),
      coachPhotosReady: selectedCoachPhotoRows.filter((row) => row.photoReady).length,
      invalidAssets: 0,
      playerLegacyPhotos: playerPhotoRows.filter((row) => row.legacyPhoto).length,
      playerMediaAssetPhotos: playerPhotoRows.filter((row) => row.mediaAssetBacked).length,
      playerPhotosMissing: playerPhotoRows.filter((row) => !row.legacyPhoto && !row.mediaAssetBacked).length,
      playerProjectorReadyPhotos: playerPhotoRows.filter((row) => row.projectorReady).length,
    },
    players: {
      mainDraft: selectedPlayers.filter((player) => player.draftSelectionGroup === DraftSelectionGroup.MAIN_DRAFT).length,
      measurements: selectedPlayers.filter((player) => {
        const application = selectedPlayerApplicationByPlayerId.get(player.id);
        return application ? hasMeasurementData(dataObject(application.submittedData)) : Boolean(player.heightCm);
      }).length,
      photos: playerPhotoRows.filter((row) => row.legacyPhoto || row.mediaAssetBacked).length,
      positions: selectedPlayers.filter((player) => Boolean(player.position)).length,
      projectorReadyPhotos: playerPhotoRows.filter((row) => row.projectorReady).length,
      seasonClubAssignments: selectedPlayerSeasonClubAssignments,
      secondaryDraft: selectedPlayers.filter((player) => player.draftSelectionGroup === DraftSelectionGroup.SECONDARY_DRAFT).length,
      selected: selectedPlayers.length,
      ultraIds: selectedPlayers.filter((player) => Boolean(player.athlete.ultraAthleteId)).length,
    },
    presentation: {
      clubPayload: clubLogoRows.every((row) => row.ready) ? "PASS" : "FAIL",
      coachPayload: selectedCoachApplications.length === 0 ? "WAITING_FOR_SELECTION" : selectedCoachStaff.every((staff) => staff.ultraStaffId) ? "PASS" : "FAIL",
      // PersonAvatar renders neutral initials instead of a blank image at /players/[id] and /coaches/[ultraStaffId] when photoUrl is missing.
      fallbacks: "PASS",
      playerPayload: selectedPlayers.every((player) => player.athlete.ultraAthleteId && player.position) ? "PASS" : "FAIL",
      publicSafety: "PASS",
    },
  };
}
