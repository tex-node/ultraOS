import { randomBytes, randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  AllocationStatus,
  AllocationSubjectType,
  DraftEventOperatingMode,
  DraftEventStage,
  DraftEventStatus,
  DraftPickStatus,
  DraftStatus,
  PlayerStatus,
  StaffRole,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import {
  classifyDraftSquadReadiness,
  draftSquadCapacityConfig,
  draftSquadGenderFromLabel,
  draftSquadStatusSeverity,
  targetSizeForGender,
  type DraftSquadReadinessStatus,
} from "@/lib/draft-squad-capacity";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

export type ReadinessItem = {
  key: string;
  label: string;
  status: "GREEN" | "AMBER" | "RED" | "GREY" | "BLUE";
  message: string;
  squadStatus?: DraftSquadReadinessStatus;
  current?: number;
  target?: number;
  shortfall?: number;
  completion?: number;
};

export function stageSubjectType(stage: DraftEventStage) {
  if (stage === DraftEventStage.MEN_COACH_ALLOCATION || stage === DraftEventStage.WOMEN_COACH_ALLOCATION) {
    return AllocationSubjectType.COACH;
  }
  if (stage === DraftEventStage.MEN_SQUAD_ALLOCATION || stage === DraftEventStage.WOMEN_SQUAD_ALLOCATION) {
    return AllocationSubjectType.SQUAD;
  }
  return null;
}

export function stageGenderHint(stage: DraftEventStage) {
  if (stage.toString().startsWith("MEN_")) return "men";
  if (stage.toString().startsWith("WOMEN_")) return "women";
  return null;
}

export function shouldPersistOfficialAllocation(mode: DraftEventOperatingMode | string) {
  return mode === DraftEventOperatingMode.LIVE || mode === "LIVE";
}

// Phase 1 Stage 5.2B-3: every function below that touches the database now takes `tx` - a
// transaction client already scoped to the acting organization via withOrganizationContext -
// instead of the bare `prisma` client. RLS then makes any cross-org id (draftEventId, seasonId,
// divisionId, playerId, staffId, seasonClubId, draftSquadId, pickId, allocationId - all of which
// can originate from client-submitted form data or a URL segment) invisible to every lookup here,
// so a foreign-org id fails the same "not found"/validation path a genuinely missing id would,
// rather than ever being read far enough to compare its fields or be written into a new row.
// Callers (draft-events/actions.ts, drafts/actions.ts) resolve organizationId via
// requirePermissionWithOrganization() and open the transaction with withOrganizationContext()
// before calling into any function here - never the reverse.
export async function draftEventReadiness(tx: Prisma.TransactionClient, draftEventId: string): Promise<ReadinessItem[]> {
  const event = await tx.draftEvent.findUnique({
    include: {
      season: true,
      squads: { include: { members: true, division: true } },
      coachPoolEntries: { include: { staff: true, division: true } },
    },
    where: { id: draftEventId },
  });
  if (!event) return [{ key: "event", label: "Draft event", status: "RED", message: "DraftEvent not found." }];

  const divisions = await tx.division.findMany({
    where: { competitionId: event.season.competitionId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const seasonClubs = await tx.seasonClub!.findMany({
    where: { seasonId: event.seasonId, status: "ACTIVE" },
    include: { club: true, division: true },
  });
  const capacityConfig = await draftSquadCapacityConfig(tx, event.seasonId);

  const selectedAssignedPlayers = await tx.player.count({
    where: { seasonId: event.seasonId, draftSelectionGroup: { in: ["MAIN_DRAFT", "SECONDARY_DRAFT"] }, seasonClubId: { not: null } },
  });

  const items: ReadinessItem[] = [{
    key: "operating-mode",
    label: "Draft operating mode",
    status: event.operatingMode === DraftEventOperatingMode.REHEARSAL ? "BLUE" : "GREEN",
    message: event.operatingMode === DraftEventOperatingMode.REHEARSAL ? "REHEARSAL MODE. Confirmations do not write official assignments." : "LIVE DRAFT. Confirmations write official assignments.",
  }, {
    key: "selected-player-assignments",
    label: "Selected player SeasonClub assignments",
    status: selectedAssignedPlayers === 0 ? "GREEN" : "RED",
    message: `${selectedAssignedPlayers} selected player(s) already assigned to a SeasonClub.`,
  }];
  for (const division of divisions) {
    const divisionClubs = seasonClubs.filter((club) => club.divisionId === division.id);
    const divisionSquads = event.squads.filter((squad) => squad.divisionId === division.id);
    const divisionCoaches = event.coachPoolEntries.filter((entry) => entry.divisionId === division.id);
    items.push({
      key: `clubs-${division.id}`,
      label: `${division.name} SeasonClubs`,
      status: divisionClubs.length === 4 ? "GREEN" : "RED",
      message: `${divisionClubs.length}/4 active SeasonClubs configured.`,
    });
    items.push({
      key: `squads-${division.id}`,
      label: `${division.name} squads`,
      status: divisionSquads.length === 4 ? "GREEN" : "RED",
      message: `${divisionSquads.length}/4 squads configured.`,
    });
    const gender = draftSquadGenderFromLabel(division.name);
    const targetSize = targetSizeForGender(capacityConfig, gender);
    for (const squad of divisionSquads.sort((left, right) => left.sequence - right.sequence)) {
      const current = squad.members.length;
      const squadStatus = classifyDraftSquadReadiness({ currentSize: current, targetSize, draftEventStatus: event.status });
      const shortfall = Math.max(targetSize - current, 0);
      items.push({
        key: `squad-size-${squad.id}`,
        label: `${division.name} ${squad.publicLabel ?? squad.name}`,
        status: draftSquadStatusSeverity(squadStatus),
        squadStatus,
        current,
        target: targetSize,
        shortfall,
        completion: targetSize > 0 ? Math.round((current / targetSize) * 100) : 0,
        message: squadStatus === "INCOMPLETE"
          ? `${current}/${targetSize}. ${squad.publicLabel ?? squad.name} requires ${shortfall} additional player(s).`
          : squadStatus === "OVER_CAPACITY"
            ? `${current}/${targetSize}. Squad exceeds configured target by ${current - targetSize} player(s).`
            : `${current}/${targetSize}. ${squadStatus}.`,
      });
    }
    const totalCurrent = divisionSquads.reduce((sum, squad) => sum + squad.members.length, 0);
    const totalTarget = targetSize * 4;
    items.push({
      key: `squad-summary-${division.id}`,
      label: `${division.name} Main Draft summary`,
      status: totalCurrent > totalTarget ? "RED" : totalCurrent === totalTarget ? "GREEN" : "AMBER",
      current: totalCurrent,
      target: totalTarget,
      shortfall: Math.max(totalTarget - totalCurrent, 0),
      completion: totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0,
      message: `${totalCurrent}/${totalTarget} players. ${totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0}% complete; ${Math.max(totalTarget - totalCurrent, 0)} remaining.`,
    });
    items.push({
      key: `coaches-${division.id}`,
      label: `${division.name} coach pool`,
      status: divisionCoaches.length >= 4 ? "GREEN" : "AMBER",
      message: `${divisionCoaches.length} coach pool entries configured.`,
    });
    const missingLogos = divisionClubs.filter((seasonClub) => !seasonClub.club.logoUrl);
    items.push({
      key: `logos-${division.id}`,
      label: `${division.name} club logos`,
      status: missingLogos.length === 0 ? "GREEN" : "AMBER",
      message: missingLogos.length === 0 ? "All active clubs have logos." : `${missingLogos.length} club(s) missing logos.`,
    });
  }

  const duplicateMemberships = await tx.draftSquadMember.groupBy({
    by: ["playerId"],
    where: { draftSquad: { draftEventId } },
    _count: { playerId: true },
    having: { playerId: { _count: { gt: 1 } } },
  });
  items.push({
    key: "duplicate-memberships",
    label: "Duplicate squad memberships",
    status: duplicateMemberships.length === 0 ? "GREEN" : "RED",
    message: duplicateMemberships.length === 0 ? "No duplicate squad members." : `${duplicateMemberships.length} duplicate player assignment(s).`,
  });

  return items;
}

export async function assertReadyToStart(tx: Prisma.TransactionClient, draftEventId: string) {
  const items = await draftEventReadiness(tx, draftEventId);
  const redItems = items.filter((item) => item.status === "RED");
  if (redItems.length > 0) {
    throw new Error(`DraftEvent is not ready: ${redItems.map((item) => item.label).join(", ")}`);
  }
}

async function eligibleSeasonClubs(tx: Prisma.TransactionClient, draftEventId: string, divisionId: string, subjectType: AllocationSubjectType, operatingMode: DraftEventOperatingMode) {
  const event = await tx.draftEvent.findUniqueOrThrow({ where: { id: draftEventId }, select: { seasonId: true } });
  const claimed = await tx.draftAllocation.findMany({
    where: { draftEventId, divisionId, operatingMode, subjectType, status: { notIn: [AllocationStatus.CANCELLED, AllocationStatus.CORRECTED] } },
    select: { seasonClubId: true },
  });
  return tx.seasonClub!.findMany({
    where: {
      divisionId,
      id: { notIn: claimed.map((allocation) => allocation.seasonClubId) },
      seasonId: event.seasonId,
      status: "ACTIVE",
    },
    include: { club: true, division: true },
    orderBy: { club: { name: "asc" } },
  });
}

async function nextSubject(tx: Prisma.TransactionClient, draftEventId: string, divisionId: string, subjectType: AllocationSubjectType, operatingMode: DraftEventOperatingMode) {
  if (subjectType === AllocationSubjectType.SQUAD) {
    const allocated = await tx.draftAllocation.findMany({
      where: { draftEventId, operatingMode, subjectType, draftSquadId: { not: null }, status: { notIn: [AllocationStatus.CANCELLED, AllocationStatus.CORRECTED] } },
      select: { draftSquadId: true },
    });
    return tx.draftSquad.findFirst({
      where: { draftEventId, divisionId, id: { notIn: allocated.map((allocation) => allocation.draftSquadId).filter(Boolean) as string[] } },
      orderBy: { sequence: "asc" },
    });
  }

  const allocated = await tx.draftAllocation.findMany({
    where: { draftEventId, operatingMode, subjectType, staffId: { not: null }, status: { notIn: [AllocationStatus.CANCELLED, AllocationStatus.CORRECTED] } },
    select: { staffId: true },
  });
  const pool = await tx.draftCoachPoolEntry.findFirst({
    where: { draftEventId, divisionId, staffId: { notIn: allocated.map((allocation) => allocation.staffId).filter(Boolean) as string[] } },
    include: { staff: true },
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
  });
  return pool?.staff ?? null;
}

// Read-only check the control room uses to decide whether to render an active
// Reserve button at all, rather than letting the operator click it and hit
// reserveNextAllocation()'s "No eligible subject/SeasonClub remains" errors —
// both are entirely expected once a division/subjectType is fully allocated
// (e.g. a surplus coach with no club left, or every squad already placed).
export async function nextAllocationReadiness(organizationId: string, draftEventId: string, divisionId: string, subjectType: AllocationSubjectType, operatingMode: DraftEventOperatingMode) {
  return withOrganizationContext(organizationId, async (tx) => {
    const subject = await nextSubject(tx, draftEventId, divisionId, subjectType, operatingMode);
    if (!subject) return { canReserve: false as const, reason: `Every ${subjectType.toLowerCase()} in this division has already been allocated for this stage.` };
    const clubs = await eligibleSeasonClubs(tx, draftEventId, divisionId, subjectType, operatingMode);
    if (clubs.length === 0) return { canReserve: false as const, reason: "Every Club in this division already has a confirmed allocation for this stage." };
    return { canReserve: true as const, reason: null };
  });
}

export async function reserveNextAllocation(params: {
  organizationId: string;
  draftEventId: string;
  divisionId: string;
  subjectType: AllocationSubjectType;
  userId: string;
}) {
  return withOrganizationContext(params.organizationId, async (tx) => {
    const event = await tx.draftEvent.findUniqueOrThrow({ where: { id: params.draftEventId } });
    if (event.status !== DraftEventStatus.LIVE) throw new Error("DraftEvent must be LIVE before allocation.");
    if (stageSubjectType(event.currentStage) !== params.subjectType) throw new Error("Current stage does not match requested allocation type.");
    if (event.currentAllocationId) {
      const current = await tx.draftAllocation.findUnique({ where: { id: event.currentAllocationId } });
      const terminalStatuses: AllocationStatus[] = [
        AllocationStatus.CONFIRMED,
        AllocationStatus.CANCELLED,
        AllocationStatus.CORRECTED,
      ];
      if (current && !terminalStatuses.includes(current.status)) return current;
    }

    // divisionId is resolved here via the SAME scoped transaction that resolved draftEventId
    // above - a foreign-org divisionId is invisible to eligibleSeasonClubs()/nextSubject()'s own
    // scoped queries below, so this never needs a separate explicit division-ownership check.
    const subject = await nextSubject(tx, params.draftEventId, params.divisionId, params.subjectType, event.operatingMode);
    if (!subject) throw new Error("No eligible subject remains.");
    const clubs = await eligibleSeasonClubs(tx, params.draftEventId, params.divisionId, params.subjectType, event.operatingMode);
    if (clubs.length === 0) throw new Error("No eligible SeasonClub remains.");
    const selectedIndex = randomInt(clubs.length);
    const selected = clubs[selectedIndex];
    // nextSubject()/eligibleSeasonClubs() already exclude CANCELLED/CORRECTED rows when
    // deciding who/what is still available, which means a corrected subject or club is
    // expected to be re-pickable. But the unique constraints on this table are unconditional
    // (they don't exclude terminal statuses), so a stale CANCELLED/CORRECTED row for the same
    // staffId/draftSquadId/seasonClubId would otherwise collide with the new insert below.
    // The correction/cancellation is already permanently recorded in AuditLog, so clearing the
    // superseded row here loses no audit trail — it only unblocks the re-allocation this
    // function's own exclusion logic already promised was possible.
    await tx.draftAllocation.deleteMany({
      where: {
        draftEventId: params.draftEventId,
        operatingMode: event.operatingMode,
        subjectType: params.subjectType,
        status: { in: [AllocationStatus.CANCELLED, AllocationStatus.CORRECTED] },
        OR: [
          params.subjectType === AllocationSubjectType.COACH ? { staffId: subject.id } : { draftSquadId: subject.id },
          { seasonClubId: selected.id, divisionId: params.divisionId },
        ],
      },
    });
    // MAX(sequence)+1 rather than COUNT()+1 — COUNT breaks the moment any row in this scope
    // has ever been deleted (as the cleanup above now does) or if a gap otherwise exists,
    // since COUNT reflects how many rows remain, not the highest sequence number ever used.
    const maxSequence = await tx.draftAllocation.aggregate({
      where: { draftEventId: params.draftEventId, operatingMode: event.operatingMode, subjectType: params.subjectType },
      _max: { sequence: true },
    });
    const sequence = (maxSequence._max.sequence ?? 0) + 1;
    const allocation = await tx.draftAllocation.create({
      data: {
        organizationId: params.organizationId,
        candidateSnapshot: clubs.map((club) => ({
          clubId: club.clubId,
          crowdChant: club.club.crowdChant,
          identityKeywords: club.club.identityKeywords,
          name: club.club.name,
          officialSlogan: club.club.officialSlogan,
          seasonClubId: club.id,
          shortName: club.club.shortName,
        })),
        createdById: params.userId,
        divisionId: params.divisionId,
        draftEventId: params.draftEventId,
        draftSquadId: params.subjectType === AllocationSubjectType.SQUAD ? subject.id : null,
        operatingMode: event.operatingMode,
        randomMethod: "node:crypto.randomInt",
        randomSeed: randomBytes(16).toString("hex"),
        reservedAt: new Date(),
        seasonClubId: selected.id,
        sequence,
        staffId: params.subjectType === AllocationSubjectType.COACH ? subject.id : null,
        status: AllocationStatus.RESERVED,
        subjectType: params.subjectType,
      },
    });
    await tx.draftEvent.update({
      where: { id: params.draftEventId },
      data: { currentAllocationId: allocation.id, displaySequence: { increment: 1 }, publicMessage: "Allocation reserved" },
    });
    await writeAuditLog(tx, {
      organizationId: params.organizationId,
      action: "DRAFT_EVENT_ALLOCATION_RESERVED",
      details: {
        allocationId: allocation.id,
        candidateSeasonClubIds: clubs.map((club) => club.id),
        selectedSeasonClubId: selected.id,
        subjectType: params.subjectType,
        operatingMode: event.operatingMode,
      },
      entityId: allocation.id,
      entityType: "DraftAllocation",
      userId: params.userId,
    });
    return allocation;
  });
}

export async function markAllocationRevealing(organizationId: string, allocationId: string, userId: string) {
  await withOrganizationContext(organizationId, async (tx) => {
    const allocation = await tx.draftAllocation.update({ where: { id: allocationId }, data: { status: AllocationStatus.REVEALING } });
    await tx.draftEvent.update({ where: { id: allocation.draftEventId }, data: { displaySequence: { increment: 1 }, publicMessage: "Suspense animation running" } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_ALLOCATION_REVEALING", entityId: allocationId, entityType: "DraftAllocation", userId });
  });
}

export async function revealAllocation(organizationId: string, allocationId: string, userId: string) {
  await withOrganizationContext(organizationId, async (tx) => {
    const allocation = await tx.draftAllocation.update({ where: { id: allocationId }, data: { revealedAt: new Date(), status: AllocationStatus.REVEALED } });
    await tx.draftEvent.update({ where: { id: allocation.draftEventId }, data: { displaySequence: { increment: 1 }, publicMessage: "Result revealed" } });
    await writeAuditLog(tx, { organizationId, action: "DRAFT_EVENT_ALLOCATION_REVEALED", entityId: allocationId, entityType: "DraftAllocation", userId });
  });
}

export async function confirmAllocation(organizationId: string, allocationId: string, userId: string) {
  await withOrganizationContext(organizationId, async (tx) => {
    const allocation = await tx.draftAllocation.findUniqueOrThrow({
      where: { id: allocationId },
      include: { draftEvent: true, draftSquad: { include: { members: true } }, staff: true, seasonClub: true },
    });
    if (allocation.status !== AllocationStatus.REVEALED) throw new Error("Allocation must be revealed before confirmation.");
    const persistOfficially = shouldPersistOfficialAllocation(allocation.draftEvent.operatingMode);
    if (persistOfficially) {
      if (allocation.subjectType === AllocationSubjectType.SQUAD) {
        if (!allocation.draftSquad) throw new Error("Squad allocation is missing a squad.");
        const playerIds = allocation.draftSquad.members.map((member) => member.playerId);
        const conflicts = await tx.player.count({ where: { id: { in: playerIds }, seasonClubId: { not: null } } });
        if (conflicts > 0) throw new Error("One or more squad players already have a SeasonClub assignment.");
        await tx.player.updateMany({
          where: { id: { in: playerIds } },
          data: { seasonClubId: allocation.seasonClubId, status: PlayerStatus.DRAFTED, draftedAt: new Date() },
        });
      } else {
        if (!allocation.staffId) throw new Error("Coach allocation is missing staff.");
        const coachData =
          allocation.staff?.role === StaffRole.ASSISTANT_COACH
            ? { assistantCoachId: allocation.staffId }
            : { headCoachId: allocation.staffId };
        await tx.seasonClub!.update({ where: { id: allocation.seasonClubId }, data: coachData });
      }
    }
    await tx.draftAllocation.update({
      where: { id: allocation.id },
      data: { confirmedAt: new Date(), confirmedById: userId, status: AllocationStatus.CONFIRMED },
    });
    await tx.draftEvent.update({
      where: { id: allocation.draftEventId },
      data: { currentAllocationId: null, displaySequence: { increment: 1 }, publicMessage: "Allocation confirmed" },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "DRAFT_EVENT_ALLOCATION_CONFIRMED",
      details: { allocationId, seasonClubId: allocation.seasonClubId, subjectType: allocation.subjectType, operatingMode: allocation.draftEvent.operatingMode, persistedOfficially: persistOfficially },
      entityId: allocationId,
      entityType: "DraftAllocation",
      userId,
    });
  });
}

export async function resetRehearsalAllocations(organizationId: string, draftEventId: string, userId: string, reason: string) {
  if (!reason.trim()) throw new Error("A reset reason is required.");
  await withOrganizationContext(organizationId, async (tx) => {
    const event = await tx.draftEvent.findUniqueOrThrow({ where: { id: draftEventId } });
    if (event.operatingMode !== DraftEventOperatingMode.REHEARSAL) throw new Error("Only rehearsal mode can be reset with this action.");
    const deleted = await tx.draftAllocation.deleteMany({ where: { draftEventId, operatingMode: DraftEventOperatingMode.REHEARSAL } });
    await tx.draftEvent.update({
      where: { id: draftEventId },
      data: { currentAllocationId: null, currentStage: DraftEventStage.INTRO, displaySequence: { increment: 1 }, publicMessage: "Rehearsal reset" },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "DRAFT_EVENT_REHEARSAL_RESET",
      details: { deletedAllocations: deleted.count, reason },
      entityId: draftEventId,
      entityType: "DraftEvent",
      userId,
    });
  });
}

// Marks a single allocation CORRECTED rather than deleting it, so the original
// (wrong) result stays auditable. If the allocation had already persisted an
// official assignment (LIVE + CONFIRMED), that official write is reversed in the
// same transaction. The corrected allocation's subject (squad/coach) and club
// both fall out of "claimed" status automatically, since eligibleSeasonClubs()
// and nextSubject() already exclude CORRECTED allocations — the next reserve
// picks them up again with no further bookkeeping needed here.
export async function correctAllocation(organizationId: string, allocationId: string, userId: string, reason: string) {
  if (!reason.trim()) throw new Error("A correction reason is required.");
  await withOrganizationContext(organizationId, async (tx) => {
    const allocation = await tx.draftAllocation.findUniqueOrThrow({
      where: { id: allocationId },
      include: { draftEvent: true, draftSquad: { include: { members: true } }, staff: true },
    });
    if (allocation.status === AllocationStatus.CANCELLED || allocation.status === AllocationStatus.CORRECTED) {
      throw new Error("Allocation is already cancelled or corrected.");
    }
    const wasOfficial = allocation.status === AllocationStatus.CONFIRMED && shouldPersistOfficialAllocation(allocation.draftEvent.operatingMode);
    if (wasOfficial) {
      if (allocation.subjectType === AllocationSubjectType.SQUAD && allocation.draftSquad) {
        const playerIds = allocation.draftSquad.members.map((member) => member.playerId);
        await tx.player.updateMany({
          where: { id: { in: playerIds }, seasonClubId: allocation.seasonClubId },
          data: { seasonClubId: null, status: PlayerStatus.DRAFT_ELIGIBLE, draftedAt: null },
        });
      } else if (allocation.subjectType === AllocationSubjectType.COACH && allocation.staffId) {
        const coachField = allocation.staff?.role === StaffRole.ASSISTANT_COACH ? { assistantCoachId: null } : { headCoachId: null };
        await tx.seasonClub!.updateMany({ where: { id: allocation.seasonClubId, OR: [{ headCoachId: allocation.staffId }, { assistantCoachId: allocation.staffId }] }, data: coachField });
      }
    }
    await tx.draftAllocation.update({
      where: { id: allocation.id },
      data: { correctedAt: new Date(), correctionReason: reason, status: AllocationStatus.CORRECTED },
    });
    if (allocation.draftEvent.currentAllocationId === allocation.id) {
      await tx.draftEvent.update({ where: { id: allocation.draftEventId }, data: { currentAllocationId: null } });
    }
    await tx.draftEvent.update({
      where: { id: allocation.draftEventId },
      data: { displaySequence: { increment: 1 }, publicMessage: "Allocation corrected" },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "DRAFT_EVENT_ALLOCATION_CORRECTED",
      details: { allocationId, operatingMode: allocation.operatingMode, reason, reversedOfficialAssignment: wasOfficial, subjectType: allocation.subjectType },
      entityId: allocationId,
      entityType: "DraftEvent",
      userId,
    });
  });
}

// Phase 1 Stage 5.2B-3: this pair (publicDraftEventState/publicSecondaryDraftState) is the
// unauthenticated public/projector read surface, gated only by the displayToken - not an
// authenticated 5.2B-3 workflow, so left unscoped and classified DEFER_5.2D rather than
// converted here, per this stage's explicit boundary (public reads are a later stage's job
// unless a read is directly required to safely complete an authenticated workflow in THIS
// stage - these are not).
export async function publicDraftEventState(draftEventId: string, token?: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const event = await db.draftEvent.findUnique({
    where: { id: draftEventId },
    include: {
      season: true,
      allocations: {
        where: { status: { in: [AllocationStatus.REVEALED, AllocationStatus.CONFIRMED, AllocationStatus.REVEALING, AllocationStatus.RESERVED] } },
        include: {
          division: true,
          draftSquad: { include: { members: { include: { player: { include: { athlete: true } } } } } },
          seasonClub: { include: { club: true } },
          staff: true,
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!event) return null;
  if (event.displayToken && token && token !== event.displayToken) return null;
  return {
    id: event.id,
    displaySequence: event.displaySequence,
    publicMessage: event.publicMessage,
    publicTitle: event.publicTitle,
    seasonName: event.season.name,
    sponsorLogoUrl: event.sponsorLogoUrl,
    sponsorName: event.sponsorName,
    stage: event.currentStage,
    status: event.status,
    operatingMode: event.operatingMode,
    allocations: event.allocations.filter((allocation) => allocation.operatingMode === event.operatingMode).map((allocation) => {
      // RESERVED/REVEALING allocations already have their result determined server-side,
      // but the operator has not triggered the reveal moment yet. The projector must be
      // able to show "next up" suspense framing (division/subjectType/status) WITHOUT
      // leaking who was selected or which Club they went to — that identity is withheld
      // until the allocation actually reaches REVEALED.
      const isRevealed = allocation.status === AllocationStatus.REVEALED || allocation.status === AllocationStatus.CONFIRMED;
      return {
        id: allocation.id,
        divisionName: allocation.division.name,
        status: allocation.status,
        subjectType: allocation.subjectType,
        squad: isRevealed && allocation.draftSquad
          ? {
              id: allocation.draftSquad.id,
              name: allocation.draftSquad.publicLabel ?? allocation.draftSquad.name,
              memberCount: allocation.draftSquad.members.length,
              members: allocation.draftSquad.members.map((member) => ({
                name: `${member.player.athlete.firstName} ${member.player.athlete.lastName}`,
                photoUrl: member.player.athlete.photoUrl,
                position: member.player.position,
              })),
            }
          : null,
        coach: isRevealed && allocation.staff ? { id: allocation.staff.id, name: allocation.staff.name } : null,
        seasonClub: isRevealed
          ? {
              id: allocation.seasonClub!.id,
              name: allocation.seasonClub!.club.name,
              shortName: allocation.seasonClub!.club.shortName,
              logoUrl: allocation.seasonClub!.club.logoUrl,
              officialSlogan: allocation.seasonClub!.club.officialSlogan,
              crowdChant: allocation.seasonClub!.club.crowdChant,
              identityKeywords: allocation.seasonClub!.club.identityKeywords,
              primaryColor: allocation.seasonClub!.club.primaryColor,
              secondaryColor: allocation.seasonClub!.club.secondaryColor,
            }
          : null,
      };
    }),
  };
}

// ============================================================
// Secondary Draft (Draft/DraftPick) rehearsal isolation.
//
// Draft/DraftPick predates DraftEvent/DraftAllocation and originally had no
// REHEARSAL/LIVE concept at all — makeDraftPick() (drafts/actions.ts) still
// exists for the general case and writes Player.seasonClubId
// unconditionally the moment a pick is made. The functions below are the
// safe, staged alternative for a Draft linked to a governing DraftEvent
// (draft.draftEventId): operatingMode is derived from that DraftEvent
// exactly like the Main Draft, and official writes are gated behind the
// same shouldPersistOfficialAllocation() check already proven in Track E.
// A Draft with no linked DraftEvent is always treated as REHEARSAL — the
// safe default — so it can never accidentally write an official assignment.
// ============================================================

export async function draftOperatingMode(tx: Prisma.TransactionClient, draftId: string) {
  const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId }, include: { draftEvent: true } });
  return { draft, operatingMode: draft.draftEvent?.operatingMode ?? DraftEventOperatingMode.REHEARSAL };
}

export async function reserveSecondaryDraftPick(params: {
  organizationId: string;
  draftId: string;
  playerId: string;
  seasonClubId: string;
  round: number;
  userId: string;
}) {
  return withOrganizationContext(params.organizationId, async (tx) => {
    const { draft, operatingMode } = await draftOperatingMode(tx, params.draftId);
    if (draft.status !== DraftStatus.LIVE) throw new Error("Draft must be started before reserving a pick.");

    const player = await tx.player.findUniqueOrThrow({
      where: { id: params.playerId },
      select: { seasonId: true, status: true, seasonClubId: true, draftSelectionGroup: true },
    });
    if (player.seasonId !== draft.seasonId || player.draftSelectionGroup !== "SECONDARY_DRAFT") {
      throw new Error("Player is not eligible for this Secondary Draft.");
    }
    if (player.seasonClubId) throw new Error("Player already has an official SeasonClub assignment.");
    if (!["DRAFT_ELIGIBLE", "UNDRAFTED"].includes(player.status)) throw new Error("Player is not draft-eligible.");

    const existingPick = await tx.draftPick.findFirst({
      where: { draftId: params.draftId, playerId: params.playerId, status: { not: DraftPickStatus.CORRECTED } },
    });
    if (existingPick) throw new Error("Player has already been picked in this draft.");

    // The check above already treats a CORRECTED pick as not blocking a re-pick, but
    // DraftPick has an unconditional @@unique([draftId, playerId]) — a stale CORRECTED row
    // for this player would otherwise collide with the create() below. The correction is
    // already permanently recorded in AuditLog, so clearing the superseded row here loses
    // no audit trail.
    await tx.draftPick.deleteMany({
      where: { draftId: params.draftId, playerId: params.playerId, status: DraftPickStatus.CORRECTED },
    });

    const team = await tx.seasonClub!.findUniqueOrThrow({
      where: { id: params.seasonClubId },
      select: { seasonId: true, divisionId: true, status: true },
    });
    if (team.seasonId !== draft.seasonId || team.divisionId !== draft.divisionId || team.status !== "ACTIVE") {
      throw new Error("SeasonClub is not eligible for this draft.");
    }

    const pickNumber = draft.nextPickNumber;
    const pick = await tx.draftPick.create({
      data: {
        organizationId: params.organizationId,
        createdById: params.userId,
        draftId: params.draftId,
        operatingMode,
        pickNumber,
        playerId: params.playerId,
        round: params.round,
        seasonClubId: params.seasonClubId,
        status: DraftPickStatus.RESERVED,
      },
    });
    await tx.draft.update({ where: { id: params.draftId }, data: { currentRound: params.round, nextPickNumber: { increment: 1 } } });
    await writeAuditLog(tx, {
      organizationId: params.organizationId,
      action: "SECONDARY_DRAFT_PICK_RESERVED",
      details: { draftId: params.draftId, operatingMode, pickNumber, playerId: params.playerId, round: params.round, seasonClubId: params.seasonClubId },
      entityId: pick.id,
      entityType: "DraftPick",
      userId: params.userId,
    });
    return pick;
  });
}

export async function markSecondaryDraftPickRevealing(organizationId: string, pickId: string, userId: string) {
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.draftPick.update({ where: { id: pickId }, data: { status: DraftPickStatus.REVEALING } });
    await writeAuditLog(tx, { organizationId, action: "SECONDARY_DRAFT_PICK_REVEALING", entityId: pickId, entityType: "DraftPick", userId });
  });
}

export async function revealSecondaryDraftPick(organizationId: string, pickId: string, userId: string) {
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.draftPick.update({ where: { id: pickId }, data: { revealedAt: new Date(), status: DraftPickStatus.REVEALED } });
    await writeAuditLog(tx, { organizationId, action: "SECONDARY_DRAFT_PICK_REVEALED", entityId: pickId, entityType: "DraftPick", userId });
  });
}

export async function confirmSecondaryDraftPick(organizationId: string, pickId: string, userId: string) {
  await withOrganizationContext(organizationId, async (tx) => {
    const pick = await tx.draftPick.findUniqueOrThrow({ where: { id: pickId } });
    if (pick.status !== DraftPickStatus.REVEALED) throw new Error("Pick must be revealed before confirmation.");
    const persistOfficially = shouldPersistOfficialAllocation(pick.operatingMode);
    if (persistOfficially) {
      const conflict = await tx.player.count({ where: { id: pick.playerId, seasonClubId: { not: null } } });
      if (conflict > 0) throw new Error("Player already has a SeasonClub assignment.");
      await tx.player.update({
        data: { draftedAt: new Date(), seasonClubId: pick.seasonClubId, status: PlayerStatus.DRAFTED },
        where: { id: pick.playerId },
      });
    }
    await tx.draftPick.update({ where: { id: pickId }, data: { confirmedAt: new Date(), status: DraftPickStatus.CONFIRMED } });
    await writeAuditLog(tx, {
      organizationId,
      action: "SECONDARY_DRAFT_PICK_CONFIRMED",
      details: { operatingMode: pick.operatingMode, persistedOfficially: persistOfficially, pickId },
      entityId: pickId,
      entityType: "DraftPick",
      userId,
    });
  });
}

export async function correctSecondaryDraftPick(organizationId: string, pickId: string, userId: string, reason: string) {
  if (!reason.trim()) throw new Error("A correction reason is required.");
  await withOrganizationContext(organizationId, async (tx) => {
    const pick = await tx.draftPick.findUniqueOrThrow({ where: { id: pickId } });
    if (pick.status === DraftPickStatus.CORRECTED) throw new Error("Pick is already corrected.");
    const wasOfficial = pick.status === DraftPickStatus.CONFIRMED && shouldPersistOfficialAllocation(pick.operatingMode);
    if (wasOfficial) {
      await tx.player.updateMany({
        data: { draftedAt: null, seasonClubId: null, status: PlayerStatus.DRAFT_ELIGIBLE },
        where: { id: pick.playerId, seasonClubId: pick.seasonClubId },
      });
    }
    await tx.draftPick.update({ where: { id: pickId }, data: { correctedAt: new Date(), correctionReason: reason, status: DraftPickStatus.CORRECTED } });
    await writeAuditLog(tx, {
      organizationId,
      action: "SECONDARY_DRAFT_PICK_CORRECTED",
      details: { pickId, reason, reversedOfficialAssignment: wasOfficial },
      entityId: pickId,
      entityType: "DraftPick",
      userId,
    });
  });
}

export async function resetSecondaryDraftRehearsal(organizationId: string, draftId: string, userId: string, reason: string) {
  if (!reason.trim()) throw new Error("A reset reason is required.");
  await withOrganizationContext(organizationId, async (tx) => {
    const { operatingMode } = await draftOperatingMode(tx, draftId);
    if (operatingMode !== DraftEventOperatingMode.REHEARSAL) {
      throw new Error("Only a Draft governed by a REHEARSAL DraftEvent (or with no DraftEvent linked) can be reset with this action.");
    }
    const deleted = await tx.draftPick.deleteMany({ where: { draftId, operatingMode: DraftEventOperatingMode.REHEARSAL } });
    await tx.draft.update({ where: { id: draftId }, data: { currentRound: 1, nextPickNumber: 1 } });
    await writeAuditLog(tx, {
      organizationId,
      action: "SECONDARY_DRAFT_REHEARSAL_RESET",
      details: { deletedPicks: deleted.count, reason },
      entityId: draftId,
      entityType: "Draft",
      userId,
    });
  });
}

// Same public/projector classification as publicDraftEventState above.
export async function publicSecondaryDraftState(draftId: string, token?: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const draft = await db.draft.findUnique({
    where: { id: draftId },
    include: {
      draftEvent: true,
      picks: {
        where: { status: { in: [DraftPickStatus.RESERVED, DraftPickStatus.REVEALING, DraftPickStatus.REVEALED, DraftPickStatus.CONFIRMED] } },
        include: { player: { include: { athlete: true } }, seasonClub: { include: { club: true } } },
        orderBy: { pickNumber: "asc" },
      },
      season: true,
    },
  });
  if (!draft) return null;
  if (draft.draftEvent?.displayToken && token && token !== draft.draftEvent.displayToken) return null;
  const operatingMode = draft.draftEvent?.operatingMode ?? DraftEventOperatingMode.REHEARSAL;
  return {
    id: draft.id,
    name: draft.name,
    operatingMode,
    picks: draft.picks.map((pick) => {
      const isRevealed = pick.status === DraftPickStatus.REVEALED || pick.status === DraftPickStatus.CONFIRMED;
      return {
        id: pick.id,
        pickNumber: pick.pickNumber,
        player: isRevealed
          ? {
              id: pick.player.id,
              name: `${pick.player.athlete.firstName} ${pick.player.athlete.lastName}`,
              photoUrl: pick.player.athlete.photoUrl,
              position: pick.player.position,
              ultraAthleteId: pick.player.athlete.ultraAthleteId,
            }
          : null,
        round: pick.round,
        seasonClub: isRevealed
          ? {
              crowdChant: pick.seasonClub!.club.crowdChant,
              id: pick.seasonClub!.id,
              logoUrl: pick.seasonClub!.club.logoUrl,
              name: pick.seasonClub!.club.name,
              officialSlogan: pick.seasonClub!.club.officialSlogan,
              shortName: pick.seasonClub!.club.shortName,
            }
          : null,
        status: pick.status,
      };
    }),
    seasonName: draft.season.name,
    status: draft.status,
    tier: draft.tier,
  };
}
