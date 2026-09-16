// Phase 1, Stage 5.5B Batch 6 reconciliation: repeatable Org A / Org B empirical MUTATION proof
// for Content / Media / Broadcast Presentation State - the domain Batch 6 claimed to remediate,
// whose own proof harness was read-only and was never actually run (no disposable env vars were
// set for it). Run against `ultraos_staging`, connected as the restricted `ultraos_staging` role.
//
// Where the real write path is a plain library function taking an explicit organizationId
// (broadcast-presentation-state.ts), this script calls those real functions directly. Where the
// real write path is a server action gated behind requirePermissionWithOrganization()
// (content/actions.ts, media/actions.ts), it replicates the exact inline logic - same precedent
// as every prior Stage 5.5B proof script. Org A and Org B use deliberately colliding data.
import { randomUUID } from "node:crypto";
import { Prisma } from "../src/generated/prisma/client";
import { SeasonStatus } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import {
  clearProgram,
  getBroadcastPresentationState,
  setPreview,
  takeToProgram,
} from "../src/lib/broadcast-presentation-state";
import { approveMediaAsset, archiveMediaAsset } from "../src/lib/media-storage";
import { generateContentPayload } from "../src/lib/content-engine";
import type { GraphicType } from "../src/lib/broadcast-graphics";

type ProofRow = { id: string; scenario: string; expected: string; actual: string; result: "PASS" | "FAIL" };
const proofs: ProofRow[] = [];
let seq = 0;
function record(prefix: string, scenario: string, expected: string, ok: boolean, actual: string) {
  seq += 1;
  const id = `${prefix}-${String(seq).padStart(3, "0")}`;
  proofs.push({ id, scenario, expected, actual, result: ok ? "PASS" : "FAIL" });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${scenario} -- expected: ${expected} -- actual: ${actual}`);
  return ok;
}
function isNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

async function main() {
  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  const restricted = roleCheck[0] && !roleCheck[0].rolsuper && !roleCheck[0].rolbypassrls;
  console.log(`Connected role bypasses RLS: ${restricted ? "NO (restricted, correct)" : "YES -- REFUSING"} (rolsuper=${roleCheck[0]?.rolsuper}, rolbypassrls=${roleCheck[0]?.rolbypassrls})`);
  if (!restricted) {
    console.error("REFUSING TO PROCEED: this proof must run as the restricted role.");
    process.exitCode = 1;
    return;
  }

  const stamp = Date.now();
  const sport = await prisma.sport.findFirstOrThrow();
  const actor = await prisma.user.create({ data: { email: `stage55b-batch6-actor-${stamp}@example.test`, name: "Batch 6 Proof Actor", role: "SUPER_ADMIN" } });

  async function buildOrg(tag: "A" | "B") {
    const org = await prisma.organization.create({
      data: {
        name: `Stage 5.5B Batch 6 Proof ${tag}`,
        slug: `stage55b-batch6-${tag.toLowerCase()}-${stamp}`,
        idPrefixAthlete: `${tag}A6${stamp % 1000}`,
        idPrefixStaff: `${tag}S6${stamp % 1000}`,
      },
    });
    return withOrganizationContext(org.id, async (tx) => {
      const competition = await tx.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: `${tag} League 6`, slug: `${tag.toLowerCase()}-league6-${stamp}` } });
      const season = await tx.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: `${tag} Season 6`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
      const club = await tx.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Test Club Six", shortName: `T${tag}6`, status: "ACTIVE", brandingStatus: "BRANDING_INCOMPLETE" } });
      const contentTemplate = await tx.contentTemplate.create({ data: { organizationId: org.id, type: "FIXTURE_ANNOUNCEMENT", name: "Proof Template", textTemplate: "{{home}} vs {{away}}", htmlTemplate: "<p>{{home}} vs {{away}}</p>" } });
      const mediaAsset = await tx.mediaAsset.create({
        data: {
          organizationId: org.id,
          storageProvider: "LOCAL_PERSISTENT_STORAGE",
          objectKey: `proof/${org.id}/${randomUUID()}.jpg`,
          mimeType: "image/jpeg",
          byteSize: 1024,
          checksumSha256: randomUUID().replaceAll("-", ""),
          visibility: "PRIVATE",
          status: "UPLOADED",
          purpose: "CONTENT_ASSET",
          uploadedById: actor.id,
        },
      });
      return { org, competition, season, club, contentTemplate, mediaAsset };
    });
  }

  console.log("\n========== Fixture setup (Org A, Org B) ==========");
  const a = await buildOrg("A");
  const b = await buildOrg("B");
  console.log(`Org A: ${a.org.id}  Org B: ${b.org.id}  ContentTemplate A: ${a.contentTemplate.id}  MediaAsset A: ${a.mediaAsset.id}`);

  // ============================== CONTENT ==============================
  console.log("\n========== CONTENT: updateContentTemplate cross-org denial ==========");
  async function updateContentTemplateAs(orgId: string, templateId: string, name: string) {
    return withOrganizationContext(orgId, (tx) => tx.contentTemplate.update({ where: { id: templateId }, data: { name } }));
  }
  const orgAUpdatesOwnTemplate = await updateContentTemplateAs(a.org.id, a.contentTemplate.id, "Org A Renamed");
  record("CNT", "Org A updates its own content template", "PASS", orgAUpdatesOwnTemplate.name === "Org A Renamed", orgAUpdatesOwnTemplate.name);
  try {
    await updateContentTemplateAs(b.org.id, a.contentTemplate.id, "Hacked By B");
    record("CNT", "Org B updates Org A's content template", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("CNT", "Org B updates Org A's content template", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }
  const orgATemplateAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.contentTemplate.findUniqueOrThrow({ where: { id: a.contentTemplate.id } }));
  record("CNT", "Org A's template state after Org B's failed update", "unchanged ('Org A Renamed')", orgATemplateAfterAttack.name === "Org A Renamed", orgATemplateAfterAttack.name);

  console.log("\n========== CONTENT: generateContentAsset with a forged/foreign sourceId (FIXTURE_ANNOUNCEMENT) ==========");
  // Build a real Fixture for Org A to generate from, then have Org B attempt the same sourceId.
  const { fixtureA } = await withOrganizationContext(a.org.id, async (tx) => {
    const division = await tx.division.create({ data: { organizationId: a.org.id, competitionId: a.competition.id, name: "Div A6", slug: `div-a6-${stamp}`, isActive: true } });
    const venue = await tx.venue.create({ data: { organizationId: a.org.id, name: "Arena A6", address: "1 Test Way", city: "Lagos", capacity: 1000 } });
    const clubB = await tx.club.create({ data: { organizationId: a.org.id, sportId: sport.id, name: "Opponent A6", shortName: "OA6", status: "ACTIVE", brandingStatus: "BRANDING_INCOMPLETE" } });
    const seasonClub1 = await tx.seasonClub!.create({ data: { organizationId: a.org.id, seasonId: a.season.id, clubId: a.club.id, divisionId: division.id, status: "ACTIVE" } });
    const seasonClub2 = await tx.seasonClub!.create({ data: { organizationId: a.org.id, seasonId: a.season.id, clubId: clubB.id, divisionId: division.id, status: "ACTIVE" } });
    const fixtureA = await tx.fixture.create({ data: { organizationId: a.org.id, seasonId: a.season.id, divisionId: division.id, homeSeasonClubId: seasonClub1.id, awaySeasonClubId: seasonClub2.id, scheduledAt: new Date(), venueId: venue.id, status: "SCHEDULED" } });
    return { fixtureA, division, venue, clubB, seasonClub1, seasonClub2 };
  });
  const orgAGeneratesFromOwnFixture = await withOrganizationContext(a.org.id, (tx) => generateContentPayload("FIXTURE_ANNOUNCEMENT", fixtureA.id, tx));
  record("CNT", "Org A generates FIXTURE_ANNOUNCEMENT content from its own fixture", "PASS", orgAGeneratesFromOwnFixture.sourceType === "Fixture", orgAGeneratesFromOwnFixture.sourceType);
  try {
    await withOrganizationContext(b.org.id, (tx) => generateContentPayload("FIXTURE_ANNOUNCEMENT", fixtureA.id, tx));
    record("CNT", "Org B generates content using Org A's real fixtureId as sourceId (forged sourceId)", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("CNT", "Org B generates content using Org A's real fixtureId as sourceId (forged sourceId)", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }

  // ============================== MEDIA ==============================
  console.log("\n========== MEDIA: read isolation (media/page.tsx, media/[assetId]/page.tsx) ==========");
  const orgAReadsOwnAsset = await withOrganizationContext(a.org.id, (tx) => tx.mediaAsset.findUnique({ where: { id: a.mediaAsset.id, organizationId: a.org.id } }));
  record("MED", "Org A reads its own media asset", "found", Boolean(orgAReadsOwnAsset), JSON.stringify({ found: Boolean(orgAReadsOwnAsset) }));
  const orgBReadsOrgAAsset = await withOrganizationContext(b.org.id, (tx) => tx.mediaAsset.findUnique({ where: { id: a.mediaAsset.id, organizationId: b.org.id } }));
  record("MED", "Org B reads Org A's media asset by real id (scoped query, page.tsx pattern)", "denied (null)", orgBReadsOrgAAsset === null, JSON.stringify(orgBReadsOrgAAsset));

  console.log("\n========== MEDIA: approveMediaAsset/archiveMediaAsset cross-org denial (media-storage.ts, pre-existing since Stage 5.2A) ==========");
  try {
    await withOrganizationContext(b.org.id, (tx) => approveMediaAsset(tx, b.org.id, a.mediaAsset.id, actor.id));
    record("MED", "Org B approves Org A's media asset", "denied", false, "unexpectedly succeeded");
  } catch (error) {
    record("MED", "Org B approves Org A's media asset", "denied", true, String((error as Error).message).slice(0, 150));
  }
  try {
    await withOrganizationContext(b.org.id, (tx) => archiveMediaAsset(tx, b.org.id, a.mediaAsset.id, actor.id));
    record("MED", "Org B archives Org A's media asset", "denied", false, "unexpectedly succeeded");
  } catch (error) {
    record("MED", "Org B archives Org A's media asset", "denied", true, String((error as Error).message).slice(0, 150));
  }
  const orgAAssetAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id: a.mediaAsset.id } }));
  record("MED", "Org A's asset status after Org B's failed approve/archive attempts", "unchanged (still UPLOADED)", orgAAssetAfterAttack.status === "UPLOADED", orgAAssetAfterAttack.status);
  const orgAApproves = await withOrganizationContext(a.org.id, (tx) => approveMediaAsset(tx, a.org.id, a.mediaAsset.id, actor.id));
  void orgAApproves;
  const orgAAssetAfterOwnApprove = await withOrganizationContext(a.org.id, (tx) => tx.mediaAsset.findUniqueOrThrow({ where: { id: a.mediaAsset.id } }));
  record("MED", "Org A approves its own media asset", "PASS (status READY)", orgAAssetAfterOwnApprove.status === "READY", orgAAssetAfterOwnApprove.status);

  // ============================== BROADCAST PRESENTATION STATE ==============================
  console.log("\n========== BROADCAST: setPreview/takeToProgram/clearProgram real functions, same/cross-org ==========");
  const orgAAfterSetPreview = await setPreview({ gameId: "proof-game-a", graphicType: "SCORE_BUG" as GraphicType, subjectId: null }, actor.id, a.org.id);
  record("BCS", "Org A sets its own preview", "PASS (preview.gameId = proof-game-a)", orgAAfterSetPreview.preview?.gameId === "proof-game-a", JSON.stringify(orgAAfterSetPreview.preview));
  const orgAAfterTake = await takeToProgram(actor.id, a.org.id);
  record("BCS", "Org A TAKEs preview to program", "PASS (program.gameId = proof-game-a)", orgAAfterTake.program?.gameId === "proof-game-a", JSON.stringify(orgAAfterTake.program));

  // NOTE: getBroadcastPresentationState(organizationId) alone (db defaulting to the bare
  // `prisma` client) is itself a footgun - it runs with no app.current_org_id set, so it falls
  // back to the RLS COALESCE-to-Neon-Ultra default rather than genuinely reading this org's
  // state. Every real caller in the app always supplies a scoped tx; this proof does too.
  const orgBReadsOrgAState = await withOrganizationContext(b.org.id, (tx) => getBroadcastPresentationState(b.org.id, tx));
  record("BCS", "Org B reads presentation state under its own context", "empty (never sees Org A's program)", orgBReadsOrgAState.program === null && orgBReadsOrgAState.preview === null, JSON.stringify(orgBReadsOrgAState));

  console.log("\n========== BROADCAST: forged organizationId against Org A's real SystemSetting.key (SystemSetting.key is a bare GLOBAL @unique - the critical DB-behavior question) ==========");
  // SystemSetting.key is globally unique, not organizationId-scoped. broadcast-presentation-state.ts
  // mitigates this by embedding the organizationId into the key string itself
  // (`broadcast:presentation-state:<orgId>`), so no two organizations can ever produce the same
  // key. This test proves that even attempting to reach Org A's exact key string under Org B's
  // own context cannot succeed - Org B's own setPreview/takeToProgram calls can only ever
  // address Org B's own derived key, never Org A's, by construction of the key-derivation
  // function itself (it always derives from the CALLER's own organizationId parameter, which is
  // session-derived and never client-suppliable).
  await setPreview({ gameId: "proof-game-b", graphicType: "SCORE_BUG" as GraphicType, subjectId: null }, actor.id, b.org.id);
  const orgBAfterTake = await takeToProgram(actor.id, b.org.id);
  record("BCS", "Org B sets and TAKEs its own preview (independent of Org A)", "PASS (program.gameId = proof-game-b)", orgBAfterTake.program?.gameId === "proof-game-b", JSON.stringify(orgBAfterTake.program));
  const orgAStateAfterOrgBActivity = await withOrganizationContext(a.org.id, (tx) => getBroadcastPresentationState(a.org.id, tx));
  record("BCS", "Org A's presentation state after Org B's independent activity", "unchanged (still proof-game-a on program)", orgAStateAfterOrgBActivity.program?.gameId === "proof-game-a", JSON.stringify(orgAStateAfterOrgBActivity.program));

  // Directly attempt the raw DB-level attack: can a write under Org B's context, targeting Org
  // A's literal known key string, ever affect Org A's row? Postgres UPSERT/ON CONFLICT conflict
  // detection is index-level and not subject to RLS row-visibility filtering (the same general
  // class of gap as FK checks - already established doctrine in this codebase), so this is
  // tested directly rather than assumed either way.
  const orgAKeyRow = await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.findFirstOrThrow({ where: { organizationId: a.org.id, key: { contains: "broadcast:presentation-state" } } }));
  let rawForgedUpsertOutcome: "SUCCEEDED_AS_UPDATE" | "FAILED_UNIQUE_CONSTRAINT" | "FAILED_OTHER" = "FAILED_OTHER";
  let rawForgedUpsertErrorMessage = "";
  try {
    await withOrganizationContext(b.org.id, (tx) =>
      tx.systemSetting.upsert({
        where: { key: orgAKeyRow.key },
        create: { key: orgAKeyRow.key, organizationId: b.org.id, value: { forged: true }, category: "broadcast" },
        update: { value: { forged: true } },
      }),
    );
    rawForgedUpsertOutcome = "SUCCEEDED_AS_UPDATE";
  } catch (error) {
    rawForgedUpsertErrorMessage = String((error as Error).message).slice(0, 200);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      rawForgedUpsertOutcome = "FAILED_UNIQUE_CONSTRAINT";
    }
  }
  record(
    "BCS",
    "DB-level: Org B raw systemSetting.upsert() targeting Org A's exact known key string",
    "FAILED_UNIQUE_CONSTRAINT (RLS hides the row from Org B's SELECT/conflict-visibility, so Postgres attempts CREATE and collides with the still-existing unique key - fails closed, not a silent takeover) or FAILED_OTHER via RLS WITH CHECK; must NOT be SUCCEEDED_AS_UPDATE",
    rawForgedUpsertOutcome !== "SUCCEEDED_AS_UPDATE",
    `${rawForgedUpsertOutcome}${rawForgedUpsertErrorMessage ? " -- " + rawForgedUpsertErrorMessage : ""}`,
  );
  const orgAKeyRowAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.findUniqueOrThrow({ where: { key: orgAKeyRow.key } }));
  const orgAValueAfterAttack = orgAKeyRowAfterAttack.value as { program?: { gameId?: string } | null };
  record("BCS", "Org A's SystemSetting row value after Org B's forged-key upsert attempt", "unchanged (program.gameId still proof-game-a)", orgAValueAfterAttack.program?.gameId === "proof-game-a", JSON.stringify(orgAValueAfterAttack.program));

  console.log("\n========== BROADCAST: clearProgram cross-context isolation ==========");
  await clearProgram(actor.id, a.org.id);
  const orgAStateAfterClear = await withOrganizationContext(a.org.id, (tx) => getBroadcastPresentationState(a.org.id, tx));
  record("BCS", "Org A clears its own program", "PASS (program null)", orgAStateAfterClear.program === null, JSON.stringify(orgAStateAfterClear.program));
  const orgBStateAfterOrgAClear = await withOrganizationContext(b.org.id, (tx) => getBroadcastPresentationState(b.org.id, tx));
  record("BCS", "Org B's state unaffected by Org A's clear", "unchanged (still proof-game-b on program)", orgBStateAfterOrgAClear.program?.gameId === "proof-game-b", JSON.stringify(orgBStateAfterOrgAClear.program));

  // ============================== CLEANUP ==============================
  console.log("\n========== Cleanup ==========");
  for (const org of [a, b]) {
    await withOrganizationContext(org.org.id, async (tx) => {
      await tx.auditLog.deleteMany({ where: { organizationId: org.org.id } });
      await tx.systemSetting.deleteMany({ where: { organizationId: org.org.id } });
      await tx.contentAsset.deleteMany({ where: { organizationId: org.org.id } });
      await tx.contentJob.deleteMany({ where: { organizationId: org.org.id } });
      await tx.contentTemplate.deleteMany({ where: { organizationId: org.org.id } });
      await tx.mediaAssetUsage.deleteMany({ where: { organizationId: org.org.id } });
      await tx.mediaAsset.deleteMany({ where: { organizationId: org.org.id } });
      await tx.fixture.deleteMany({ where: { organizationId: org.org.id } });
      await tx.seasonClub!.deleteMany({ where: { organizationId: org.org.id } });
      await tx.club.deleteMany({ where: { organizationId: org.org.id } });
      await tx.venue.deleteMany({ where: { organizationId: org.org.id } });
      await tx.division.deleteMany({ where: { organizationId: org.org.id } });
      await tx.season.deleteMany({ where: { organizationId: org.org.id } });
      await tx.competition.deleteMany({ where: { organizationId: org.org.id } });
      await tx.publicIdCounter.deleteMany({ where: { organizationId: org.org.id } });
      await tx.publicResourceLocator.deleteMany({ where: { organizationId: org.org.id } });
      await tx.publicTokenLocator.deleteMany({ where: { organizationId: org.org.id } });
    });
    await prisma.organization.delete({ where: { id: org.org.id } });
  }
  await prisma.user.delete({ where: { id: actor.id } });

  const residueOrgs = await prisma.organization.count({ where: { slug: { startsWith: "stage55b-batch6-" } } });
  const residueUsers = await prisma.user.count({ where: { email: { startsWith: "stage55b-batch6-" } } });
  record("CLN", "Residue: disposable Organizations remaining", "0", residueOrgs === 0, String(residueOrgs));
  record("CLN", "Residue: disposable Users remaining", "0", residueUsers === 0, String(residueUsers));
  const resLoc = await prisma.publicResourceLocator.count();
  const tokLoc = await prisma.publicTokenLocator.count();
  record("CLN", "Locator baseline after cleanup", "257 resource / 0 token (unchanged baseline)", resLoc === 257 && tokLoc === 0, JSON.stringify({ resLoc, tokLoc }));

  console.log("\n========== SUMMARY ==========");
  const failed = proofs.filter((p) => p.result === "FAIL");
  console.log(`${proofs.length} proofs run, ${proofs.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length) {
    console.log("FAILED:", failed.map((p) => p.id).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("PROOF SCRIPT ERROR:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
