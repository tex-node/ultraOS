import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AthleteGender,
  DraftEventOperatingMode,
  DraftEventStage,
  DraftEventStatus,
  DraftPickStatus,
  DraftStatus,
  DraftTier,
  PlayerStatus,
} from "../src/generated/prisma/enums";
import {
  confirmSecondaryDraftPick,
  correctSecondaryDraftPick,
  publicSecondaryDraftState,
  reserveSecondaryDraftPick,
  resetSecondaryDraftRehearsal,
  revealSecondaryDraftPick,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

// Real Prisma-transaction integration test for Secondary Draft (Draft/DraftPick)
// REHEARSAL/LIVE isolation, run against a real reachable Postgres (staging)
// WITHOUT requiring CREATEDB. Uses fully disposable, uniquely-tagged fixtures
// that never touch real participant, club, or season data, and are deleted at
// the end regardless of pass/fail. Not part of `npm test` (no reachable DB
// there by design) — run manually: npx tsx scripts/secondary-draft-isolation-integration-test.ts
const TAG = `SECONDARY_ISOLATION_TEST_${Date.now()}`;
const cleanup: Array<() => Promise<unknown>> = [];

async function makePlayerFixture(seasonId: string, suffix: string) {
  const user = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-${suffix}@example.invalid`, name: `${TAG}_${suffix}`, passwordHash: randomUUID(), recordOrigin: "REHEARSAL" } });
  cleanup.push(() => prisma.auditLog.deleteMany({ where: { userId: user.id } }));
  cleanup.push(() => prisma.user.delete({ where: { id: user.id } }));
  const athlete = await prisma.athlete.create({
    data: { dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT", firstName: TAG, gender: AthleteGender.MALE, lastName: suffix, userId: user.id },
  });
  cleanup.push(() => prisma.athlete.delete({ where: { id: athlete.id } }));
  const player = await prisma.player.create({
    data: { athleteId: athlete.id, draftSelectionGroup: "SECONDARY_DRAFT", heightCm: 190, position: "G", seasonId, status: PlayerStatus.DRAFT_ELIGIBLE, weightKg: 85 },
  });
  cleanup.push(() => prisma.player.delete({ where: { id: player.id } }));
  return player;
}

async function main() {
  const sport = await prisma.sport.findFirstOrThrow({ select: { id: true } });
  const competition = await prisma.competition.findFirstOrThrow({ select: { id: true } });
  const season = await prisma.season.findFirstOrThrow({ orderBy: { startDate: "desc" }, select: { id: true } });
  const actor = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-actor@example.invalid`, name: `${TAG}_ACTOR`, passwordHash: randomUUID(), recordOrigin: "REHEARSAL" } });
  // Pushed in this order so cleanup (LIFO) deletes AuditLog rows referencing
  // `actor` before attempting to delete `actor` itself.
  cleanup.push(() => prisma.user.delete({ where: { id: actor.id } }));
  cleanup.push(() => prisma.auditLog.deleteMany({ where: { userId: actor.id } }));

  const division = await prisma.division.create({ data: { competitionId: competition.id, isActive: true, name: TAG, slug: TAG.toLowerCase() } });
  cleanup.push(() => prisma.division.delete({ where: { id: division.id } }));
  const club = await prisma.club.create({ data: { name: TAG, recordOrigin: "REHEARSAL", shortName: TAG.slice(0, 12), sportId: sport.id } });
  cleanup.push(() => prisma.club.delete({ where: { id: club.id } }));
  const seasonClub = await prisma.seasonClub!.create({ data: { clubId: club.id, divisionId: division.id, seasonId: season.id } });
  cleanup.push(() => prisma.seasonClub!.delete({ where: { id: seasonClub.id } }));

  const rehearsalEvent = await prisma.draftEvent.create({
    data: { createdById: actor.id, currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION, displayToken: randomBytes(16).toString("hex"), name: `${TAG}_EVENT_REHEARSAL`, operatingMode: DraftEventOperatingMode.REHEARSAL, publicTitle: TAG, seasonId: season.id, status: DraftEventStatus.LIVE },
  });
  cleanup.push(() => prisma.draftEvent.delete({ where: { id: rehearsalEvent.id } }));
  const liveEvent = await prisma.draftEvent.create({
    data: { createdById: actor.id, currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION, displayToken: randomBytes(16).toString("hex"), name: `${TAG}_EVENT_LIVE`, operatingMode: DraftEventOperatingMode.LIVE, publicTitle: TAG, seasonId: season.id, status: DraftEventStatus.LIVE },
  });
  cleanup.push(() => prisma.draftEvent.delete({ where: { id: liveEvent.id } }));

  const rehearsalDraft = await prisma.draft.create({
    data: { divisionId: division.id, draftEventId: rehearsalEvent.id, name: `${TAG}_DRAFT_REHEARSAL`, seasonId: season.id, status: DraftStatus.LIVE, tier: DraftTier.SECONDARY },
  });
  cleanup.push(() => prisma.draft.delete({ where: { id: rehearsalDraft.id } }));
  const liveDraft = await prisma.draft.create({
    data: { divisionId: division.id, draftEventId: liveEvent.id, name: `${TAG}_DRAFT_LIVE`, seasonId: season.id, status: DraftStatus.LIVE, tier: DraftTier.SECONDARY },
  });
  cleanup.push(() => prisma.draft.delete({ where: { id: liveDraft.id } }));
  const unlinkedDraft = await prisma.draft.create({
    data: { divisionId: division.id, name: `${TAG}_DRAFT_UNLINKED`, seasonId: season.id, status: DraftStatus.LIVE, tier: DraftTier.SECONDARY },
  });
  cleanup.push(() => prisma.draft.delete({ where: { id: unlinkedDraft.id } }));

  const results: Record<string, unknown> = {};

  // --- Test 1: REHEARSAL-linked confirm does not write Player.seasonClubId ---
  const p1 = await makePlayerFixture(season.id, "P1");
  const pick1 = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftId: rehearsalDraft.id, playerId: p1.id, round: 1, seasonClubId: seasonClub.id, userId: actor.id });
  await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick1.id, actor.id);
  await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick1.id, actor.id);
  const p1After = await prisma.player.findUniqueOrThrow({ where: { id: p1.id } });
  assert.equal(p1After.seasonClubId, null, "REHEARSAL-linked Secondary Draft confirm must NOT write Player.seasonClubId");
  results.test1_rehearsal_does_not_persist = { pass: true };

  // --- Test 2: LIVE-linked confirm DOES write Player.seasonClubId ---
  const p2 = await makePlayerFixture(season.id, "P2");
  const pick2 = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftId: liveDraft.id, playerId: p2.id, round: 1, seasonClubId: seasonClub.id, userId: actor.id });
  await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick2.id, actor.id);
  await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick2.id, actor.id);
  const p2After = await prisma.player.findUniqueOrThrow({ where: { id: p2.id } });
  assert.equal(p2After.seasonClubId, seasonClub.id, "LIVE-linked Secondary Draft confirm MUST write Player.seasonClubId");
  results.test2_live_does_persist = { pass: true };
  await prisma.player.update({ where: { id: p2.id }, data: { seasonClubId: null, status: PlayerStatus.DRAFT_ELIGIBLE } });

  // --- Test 3: unlinked Draft (no DraftEvent) defaults to REHEARSAL-safe ---
  const p3 = await makePlayerFixture(season.id, "P3");
  const pick3 = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftId: unlinkedDraft.id, playerId: p3.id, round: 1, seasonClubId: seasonClub.id, userId: actor.id });
  assert.equal(pick3.operatingMode, DraftEventOperatingMode.REHEARSAL, "Unlinked Draft must record operatingMode REHEARSAL");
  await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick3.id, actor.id);
  await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick3.id, actor.id);
  const p3After = await prisma.player.findUniqueOrThrow({ where: { id: p3.id } });
  assert.equal(p3After.seasonClubId, null, "Unlinked Draft confirm must default to REHEARSAL-safe (no official write)");
  results.test3_unlinked_defaults_to_rehearsal = { pass: true };

  // --- Test 4: pre-reveal privacy — RESERVED/REVEALING hide player + Club identity ---
  const p4 = await makePlayerFixture(season.id, "P4");
  const pick4 = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftId: rehearsalDraft.id, playerId: p4.id, round: 2, seasonClubId: seasonClub.id, userId: actor.id });
  const stateReserved = await publicSecondaryDraftState(rehearsalDraft.id);
  const latestReserved = stateReserved!.picks.at(-1)!;
  assert.equal(latestReserved.player, null, "RESERVED Secondary Draft pick must not expose player identity");
  assert.equal(latestReserved.seasonClub!, null, "RESERVED Secondary Draft pick must not expose destination Club");
  await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick4.id, actor.id);
  const stateRevealed = await publicSecondaryDraftState(rehearsalDraft.id);
  const latestRevealed = stateRevealed!.picks.at(-1)!;
  assert.notEqual(latestRevealed.player, null, "REVEALED Secondary Draft pick must expose player identity");
  results.test4_pre_reveal_privacy = { pass: true };
  await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick4.id, actor.id);

  // --- Test 5: duplicate protection — same player cannot be picked twice ---
  let duplicateRejected = false;
  try {
    await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftId: rehearsalDraft.id, playerId: p1.id, round: 3, seasonClubId: seasonClub.id, userId: actor.id });
  } catch (error) {
    duplicateRejected = error instanceof Error && /already been picked/.test(error.message);
  }
  assert.ok(duplicateRejected, "Reserving an already-picked player in the same draft must be rejected");
  results.test5_duplicate_protection = { pass: true };

  // --- Test 6: correction reverses official effect and preserves audit ---
  const p6 = await makePlayerFixture(season.id, "P6");
  const pick6 = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro",  draftId: liveDraft.id, playerId: p6.id, round: 2, seasonClubId: seasonClub.id, userId: actor.id });
  await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick6.id, actor.id);
  await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick6.id, actor.id);
  const p6Confirmed = await prisma.player.findUniqueOrThrow({ where: { id: p6.id } });
  assert.equal(p6Confirmed.seasonClubId, seasonClub.id, "Precondition: LIVE confirm should have written the official assignment");
  await correctSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", pick6.id, actor.id, "Integration test correction");
  const p6Corrected = await prisma.player.findUniqueOrThrow({ where: { id: p6.id } });
  assert.equal(p6Corrected.seasonClubId, null, "Correction must reverse the official assignment it made");
  const pick6Row = await prisma.draftPick.findUniqueOrThrow({ where: { id: pick6.id } });
  assert.equal(pick6Row.status, DraftPickStatus.CORRECTED);
  assert.equal(pick6Row.correctionReason, "Integration test correction");
  results.test6_correction_reverses_official_write = { pass: true };

  // --- Test 7: reset removes only REHEARSAL picks for that draft ---
  const beforeReset = await prisma.draftPick.count({ where: { draftId: rehearsalDraft.id } });
  await resetSecondaryDraftRehearsal("cmt4odhgn0000wokk8fbwr6ro", rehearsalDraft.id, actor.id, "Integration test reset");
  const afterReset = await prisma.draftPick.count({ where: { draftId: rehearsalDraft.id } });
  assert.equal(afterReset, 0, "Reset must remove all REHEARSAL picks for the draft");
  const liveDraftPicksStillExist = await prisma.draftPick.count({ where: { draftId: liveDraft.id } });
  assert.ok(liveDraftPicksStillExist > 0, "Reset on the rehearsal draft must not touch a separate LIVE draft's picks");
  results.test7_reset_scoped_to_rehearsal = { pass: true, before: beforeReset, after: afterReset };

  let resetRefusedOnLive = false;
  try {
    await resetSecondaryDraftRehearsal("cmt4odhgn0000wokk8fbwr6ro", liveDraft.id, actor.id, "should be refused");
  } catch (error) {
    resetRefusedOnLive = error instanceof Error && /REHEARSAL DraftEvent/.test(error.message);
  }
  assert.ok(resetRefusedOnLive, "Reset must refuse to run against a LIVE-governed Draft");
  results.test8_reset_refuses_live = { pass: true };

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => undefined);
    await prisma.$disconnect();
  });
