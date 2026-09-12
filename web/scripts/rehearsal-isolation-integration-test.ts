import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AllocationStatus,
  AllocationSubjectType,
  AthleteGender,
  DraftEventOperatingMode,
  DraftEventStage,
  DraftEventStatus,
  PlayerStatus,
} from "../src/generated/prisma/enums";
import { confirmAllocation, resetRehearsalAllocations } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

// Real Prisma-transaction integration test for REHEARSAL/LIVE allocation isolation,
// run against a real reachable Postgres (staging) WITHOUT requiring CREATEDB.
// Uses fully disposable, uniquely-tagged fixtures (Division/Club/SeasonClub/User/
// Staff/Athlete/Player/DraftEvent/DraftSquad/DraftAllocation) that never touch real
// participant, club, or season data, and are deleted at the end regardless of
// pass/fail. Not part of `npm test` (that suite has no reachable DB by design) —
// run manually with a real DATABASE_URL: npx tsx scripts/rehearsal-isolation-integration-test.ts
const TAG = `REHEARSAL_ISOLATION_TEST_${Date.now()}`;

const cleanup: Array<() => Promise<unknown>> = [];

async function run() {
  const results: Record<string, unknown> = {};

  const sport = await prisma.sport.findFirstOrThrow({ select: { id: true } });
  const competition = await prisma.competition.findFirstOrThrow({ select: { id: true } });
  const season = await prisma.season.findFirstOrThrow({ orderBy: { startDate: "desc" }, select: { id: true } });

  const division = await prisma.division.create({
    data: { competitionId: competition.id, isActive: true, name: TAG, slug: TAG.toLowerCase() },
  });
  cleanup.push(() => prisma.division.delete({ where: { id: division.id } }));

  const club = await prisma.club.create({
    data: { name: TAG, recordOrigin: "REHEARSAL", shortName: TAG.slice(0, 12), sportId: sport.id },
  });
  cleanup.push(() => prisma.club.delete({ where: { id: club.id } }));

  const seasonClub = await prisma.seasonClub.create({
    data: { clubId: club.id, divisionId: division.id, seasonId: season.id },
  });
  cleanup.push(() => prisma.seasonClub.delete({ where: { id: seasonClub.id } }));

  const user = await prisma.user.create({
    data: { email: `${TAG.toLowerCase()}@example.invalid`, name: TAG, passwordHash: randomUUID(), recordOrigin: "REHEARSAL" },
  });
  cleanup.push(() => prisma.user.delete({ where: { id: user.id } }));

  const staffUser = await prisma.user.create({
    data: { email: `${TAG.toLowerCase()}-coach@example.invalid`, name: `${TAG}_COACH`, passwordHash: randomUUID(), recordOrigin: "REHEARSAL" },
  });
  // Pushed in this order so cleanup (LIFO) deletes AuditLog rows referencing
  // `staffUser` before attempting to delete `staffUser` itself.
  cleanup.push(() => prisma.user.delete({ where: { id: staffUser.id } }));
  cleanup.push(() => prisma.auditLog.deleteMany({ where: { userId: staffUser.id } }));

  const staff = await prisma.staff.create({
    data: { name: `${TAG}_COACH`, recordOrigin: "REHEARSAL", role: "HEAD_COACH", userId: staffUser.id },
  });
  cleanup.push(() => prisma.staff.delete({ where: { id: staff.id } }));

  const athlete = await prisma.athlete.create({
    data: {
      dateOfBirth: new Date("2000-01-01"),
      dominantHand: "RIGHT",
      firstName: TAG,
      gender: AthleteGender.MALE,
      lastName: "ISOLATIONTEST",
      userId: user.id,
    },
  });
  cleanup.push(() => prisma.athlete.delete({ where: { id: athlete.id } }));

  const player = await prisma.player.create({
    data: { athleteId: athlete.id, heightCm: 190, position: "G", seasonId: season.id, status: PlayerStatus.DRAFT_ELIGIBLE, weightKg: 85 },
  });
  cleanup.push(() => prisma.player.delete({ where: { id: player.id } }));

  const draftEventRehearsal = await prisma.draftEvent.create({
    data: {
      createdById: staffUser.id,
      currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION,
      displayToken: randomBytes(16).toString("hex"),
      name: `${TAG}_REHEARSAL`,
      operatingMode: DraftEventOperatingMode.REHEARSAL,
      publicTitle: TAG,
      seasonId: season.id,
      status: DraftEventStatus.LIVE,
    },
  });
  cleanup.push(() => prisma.draftEvent.delete({ where: { id: draftEventRehearsal.id } }));

  const draftEventLive = await prisma.draftEvent.create({
    data: {
      createdById: staffUser.id,
      currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION,
      displayToken: randomBytes(16).toString("hex"),
      name: `${TAG}_LIVE`,
      operatingMode: DraftEventOperatingMode.LIVE,
      publicTitle: TAG,
      seasonId: season.id,
      status: DraftEventStatus.LIVE,
    },
  });
  cleanup.push(() => prisma.draftEvent.delete({ where: { id: draftEventLive.id } }));

  const squad = await prisma.draftSquad.create({
    data: { divisionId: division.id, draftEventId: draftEventRehearsal.id, name: TAG, seasonId: season.id, sequence: 1 },
  });
  cleanup.push(() => prisma.draftSquad.delete({ where: { id: squad.id } }));

  const squadMember = await prisma.draftSquadMember.create({
    data: { draftSquadId: squad.id, playerId: player.id },
  });
  cleanup.push(() => prisma.draftSquadMember.delete({ where: { id: squadMember.id } }).catch(() => undefined));

  // --- Test 1: REHEARSAL confirm does not persist official assignment ---
  const rehearsalAllocation = await prisma.draftAllocation.create({
    data: {
      createdById: staffUser.id,
      divisionId: division.id,
      draftEventId: draftEventRehearsal.id,
      draftSquadId: squad.id,
      operatingMode: DraftEventOperatingMode.REHEARSAL,
      randomMethod: "test",
      randomSeed: "test",
      revealedAt: new Date(),
      seasonClubId: seasonClub.id,
      sequence: 1,
      status: AllocationStatus.REVEALED,
      subjectType: AllocationSubjectType.SQUAD,
    },
  });

  await confirmAllocation("cmt4odhgn0000wokk8fbwr6ro", rehearsalAllocation.id, staffUser.id);
  const playerAfterRehearsal = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  assert.equal(playerAfterRehearsal.seasonClubId, null, "REHEARSAL confirm must NOT write Player.seasonClubId");
  results.test1_rehearsal_does_not_persist = { pass: true };

  // --- Test 2: LIVE confirm DOES persist official assignment ---
  const liveAllocation = await prisma.draftAllocation.create({
    data: {
      createdById: staffUser.id,
      divisionId: division.id,
      draftEventId: draftEventLive.id,
      draftSquadId: squad.id,
      operatingMode: DraftEventOperatingMode.LIVE,
      randomMethod: "test",
      randomSeed: "test",
      revealedAt: new Date(),
      seasonClubId: seasonClub.id,
      sequence: 1,
      status: AllocationStatus.REVEALED,
      subjectType: AllocationSubjectType.SQUAD,
    },
  });

  await confirmAllocation("cmt4odhgn0000wokk8fbwr6ro", liveAllocation.id, staffUser.id);
  const playerAfterLive = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
  assert.equal(playerAfterLive.seasonClubId, seasonClub.id, "LIVE confirm MUST write Player.seasonClubId");
  results.test2_live_does_persist = { pass: true };

  await prisma.player.update({ where: { id: player.id }, data: { seasonClubId: null, status: PlayerStatus.DRAFT_ELIGIBLE } });

  // --- Test 3: rehearsal reset removes only REHEARSAL allocations, and refuses on a LIVE event ---
  const beforeReset = await prisma.draftAllocation.count({ where: { draftEventId: draftEventRehearsal.id } });
  await resetRehearsalAllocations("cmt4odhgn0000wokk8fbwr6ro", draftEventRehearsal.id, staffUser.id, "Rehearsal isolation integration test");
  const afterReset = await prisma.draftAllocation.count({ where: { draftEventId: draftEventRehearsal.id } });
  assert.equal(afterReset, 0, "Rehearsal reset must delete all REHEARSAL allocations for the event");
  results.test3a_rehearsal_reset_clears_allocations = { pass: true, before: beforeReset, after: afterReset };

  const liveStillExists = await prisma.draftAllocation.findUnique({ where: { id: liveAllocation.id } });
  assert.ok(liveStillExists, "LIVE allocation on a separate event must be untouched by rehearsal reset");
  results.test3b_live_allocation_survives_rehearsal_reset = { pass: true };

  let refused = false;
  try {
    await resetRehearsalAllocations("cmt4odhgn0000wokk8fbwr6ro", draftEventLive.id, staffUser.id, "should be refused");
  } catch (error) {
    refused = error instanceof Error && /Only rehearsal mode/.test(error.message);
  }
  assert.ok(refused, "Rehearsal reset action must refuse to run against a LIVE-mode DraftEvent");
  results.test3c_reset_refuses_live_event = { pass: true };

  await prisma.draftAllocation.deleteMany({ where: { draftEventId: draftEventLive.id } });

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

run()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const fn of cleanup.reverse()) {
      await fn().catch(() => undefined);
    }
    await prisma.$disconnect();
  });
