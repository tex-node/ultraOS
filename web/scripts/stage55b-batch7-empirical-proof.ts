// Phase 1, Stage 5.5B Batch 7: repeatable Org A / Org B empirical proof for the 21 genuine
// tenant-context conversions committed in a8c4404.
//
// Run against `ultraos_staging`, connected as the restricted `ultraos_staging` role
// (NOSUPERUSER, NOBYPASSRLS). Never production, never the privileged `ultraos` role.
//
// Fidelity note (important, not hidden): where the Batch 7 change is a plain exported library
// function that takes an explicit scoped db / organizationId, this script calls the REAL function
// (all-star-teams.ts reads/writes, season-zero-production-reconciliation.ts reads/writes,
// live-game-snapshot-v2.ts model build). Where the Batch 7 change lives inside a React Server
// Component or a `"use server"` action that calls NextAuth's auth() and cannot execute from a bare
// script (ops read pages, rehearsal pages, public/celebrations/actions.ts), this script replicates
// the exact inline Prisma logic and the same withOrganizationContext()/resolveDefaultPublicOrganization()
// entry points - same precedent as every prior Stage 5.5B proof script. Those rows are reported as
// BEHAVIORAL_REPLICATION, not as an imported-function proof.
//
// Org A and Org B use deliberately colliding business names so a pass can never be explained by
// incidentally-unique names.
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "../src/lib/tenant-context";
import { canViewAnnouncement, getViewerClubMemberships } from "../src/lib/announcements";
import { buildLivePresentationModelForGame } from "../src/lib/live-game-snapshot-v2";
import {
  addAllStarRosterMember,
  getAllStarCandidatePool,
  getAllStarTeams,
  lockAllStarRoster,
  unlockAllStarRoster,
  updateAllStarPlayer,
  type AllStarTeamSlug,
} from "../src/lib/all-star-teams";
import {
  applySeasonZeroPlayerApproval,
  duplicateCandidatesForApplication,
  saveSeasonZeroPlayerResolution,
  seasonZeroProductionReconciliation,
  SEASON_ZERO_SELECTED_PLAYERS,
} from "../src/lib/season-zero-production-reconciliation";

type ProofRow = { id: string; group: string; scenario: string; expected: string; actual: string; result: "PASS" | "FAIL" | "BLOCKED" };
const proofs: ProofRow[] = [];
let seq = 0;
function record(group: string, scenario: string, expected: string, ok: boolean, actual: string) {
  seq += 1;
  const id = `${group}-${String(seq).padStart(3, "0")}`;
  proofs.push({ id, group, scenario, expected, actual, result: ok ? "PASS" : "FAIL" });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${scenario} -- expected: ${expected} -- actual: ${actual}`);
  return ok;
}
function blocked(group: string, scenario: string, reason: string) {
  seq += 1;
  const id = `${group}-${String(seq).padStart(3, "0")}`;
  proofs.push({ id, group, scenario, expected: "n/a", actual: reason, result: "BLOCKED" });
  console.log(`BLOCKED [${id}] ${scenario} -- ${reason}`);
}
function isNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
function errName(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return String((error as Error)?.message ?? error).slice(0, 160);
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
  const actor = await prisma.user.create({ data: { email: `stage55b-batch7-actor-${stamp}@example.test`, name: "Batch 7 Proof Actor", role: "SUPER_ADMIN" } });

  const createdOrgIds: string[] = [];
  let neonCleanup: { orgId: string; wellWishId: string; announcementId: string; playerId: string; athleteId: string } | null = null;

  async function buildOrg(tag: "A" | "B") {
    const org = await prisma.organization.create({
      data: {
        name: `Stage 5.5B Batch 7 Proof ${tag}`,
        slug: `stage55b-batch7-${tag.toLowerCase()}-${stamp}`,
        idPrefixAthlete: `${tag}A7${stamp % 1000}`,
        idPrefixStaff: `${tag}S7${stamp % 1000}`,
      },
    });
    createdOrgIds.push(org.id);
    return withOrganizationContext(org.id, async (tx) => {
      const competition = await tx.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: `${tag} League`, slug: `${tag.toLowerCase()}-league-${stamp}` } });
      const division = await tx.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: `${tag} Division`, slug: `${tag.toLowerCase()}-division-${stamp}`, isActive: true } });
      const season = await tx.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: `${tag} Season`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "ACTIVE" } });
      const venue = await tx.venue.create({ data: { organizationId: org.id, name: "Test Arena", address: "1 Test Way", city: "Lagos", capacity: 500 } });
      const club = await tx.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Test Club", shortName: `T${tag}C`, status: "ACTIVE", brandingStatus: "BRANDING_INCOMPLETE" } });
      const clubB = await tx.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Test Club Two", shortName: `T${tag}D`, status: "ACTIVE", brandingStatus: "BRANDING_INCOMPLETE" } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: club.id, divisionId: division.id, status: "ACTIVE" } });
      const seasonClubB = await tx.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: clubB.id, divisionId: division.id, status: "ACTIVE" } });
      const coach = await tx.staff.create({ data: { organizationId: org.id, name: "Test Coach", role: "HEAD_COACH", ultraStaffId: `T${tag}S-${stamp}` } });
      const athlete = await tx.athlete.create({
        data: {
          organizationId: org.id,
          firstName: "Test",
          lastName: "Player",
          gender: "MALE",
          dateOfBirth: new Date("2000-01-01"),
          dominantHand: "RIGHT",
          ultraAthleteId: `T${tag}A-${stamp}`,
        },
      });
      const player = await tx.player.create({ data: { organizationId: org.id, athleteId: athlete.id, seasonId: season.id, seasonClubId: seasonClub.id, position: "Guard", heightCm: 190, weightKg: 85, status: "DRAFT_ELIGIBLE", draftSelectionGroup: "MAIN_DRAFT" } });
      const fixture = await tx.fixture.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          divisionId: division.id,
          homeSeasonClubId: seasonClub.id,
          awaySeasonClubId: seasonClubB.id,
          scheduledAt: new Date(),
          venueId: venue.id,
          status: "SCHEDULED",
          recordOrigin: "REHEARSAL",
        },
      });
      const game = await tx.game.create({ data: { organizationId: org.id, fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 600 } });

      // Group A fixtures: one disposable row per Batch 7 ops read model.
      const auditLog = await tx.auditLog.create({ data: { organizationId: org.id, userId: actor.id, action: "PROOF_BATCH7_AUDIT", entityType: "Proof", entityId: `proof-${tag}-${stamp}`, details: { tag } } });
      const displayHeartbeat = await tx.displayHeartbeat.create({ data: { organizationId: org.id, surface: "PUBLIC_DISPLAY", label: `Proof Display ${tag}`, status: "GREEN" } });
      const opsDocument = await tx.opsDocument.create({ data: { organizationId: org.id, title: `Proof Document ${tag}`, category: "proof", uploadedById: actor.id } });
      const equipment = await tx.equipment.create({ data: { organizationId: org.id, name: `Proof Equipment ${tag}`, type: "projector", serial: `PROOF-${tag}-${stamp}` } });
      const incident = await tx.incident.create({ data: { organizationId: org.id, title: `Proof Incident ${tag}`, type: "TECHNICAL", severity: "MEDIUM", reportedById: actor.id } });
      const opsNotification = await tx.opsNotification.create({ data: { organizationId: org.id, title: `Proof Notification ${tag}`, message: "proof", category: "proof" } });
      const rehearsal = await tx.rehearsal.create({ data: { organizationId: org.id, name: `Proof Rehearsal ${tag}`, type: "proof", rehearsalDate: new Date(), createdById: actor.id } });
      const checklist = await tx.operationalChecklist.create({ data: { organizationId: org.id, name: `Proof Checklist ${tag}`, category: "proof", createdById: actor.id } });
      const runbook = await tx.runbook.create({ data: { organizationId: org.id, name: `Proof Runbook ${tag}`, category: "proof", createdById: actor.id } });
      const opsTask = await tx.opsTask.create({ data: { organizationId: org.id, title: `Proof Task ${tag}`, createdById: actor.id } });

      return { org, competition, division, season, venue, club, clubB, seasonClub, seasonClubB, coach, athlete, player, fixture, game, auditLog, displayHeartbeat, opsDocument, equipment, incident, opsNotification, rehearsal, checklist, runbook, opsTask };
    });
  }

  try {
    console.log("\n========== Fixture setup (Org A, Org B; colliding names by design) ==========");
    const a = await buildOrg("A");
    const b = await buildOrg("B");
    console.log(`Org A: ${a.org.id}  Org B: ${b.org.id}`);

    // ============================================================ GROUP A
    console.log("\n========== GROUP A: operations read pages (scoped reads, exact page query shapes) ==========");
    async function assertScopedRead(label: string, aId: string, bId: string, query: (tx: Prisma.TransactionClient) => Promise<Array<{ id: string }>>) {
      const aRows = await withOrganizationContext(a.org.id, query);
      const aIds = new Set(aRows.map((r) => r.id));
      record("A", `${label}: Org A context`, "own present, Org B's absent", aIds.has(aId) && !aIds.has(bId), JSON.stringify({ own: aIds.has(aId), cross: aIds.has(bId), total: aIds.size }));
      const bRows = await withOrganizationContext(b.org.id, query);
      const bIds = new Set(bRows.map((r) => r.id));
      record("A", `${label}: Org B context`, "own present, Org A's absent", bIds.has(bId) && !bIds.has(aId), JSON.stringify({ own: bIds.has(bId), cross: bIds.has(aId), total: bIds.size }));
    }

    await assertScopedRead("audit/page.tsx auditLog", a.auditLog.id, b.auditLog.id, (tx) => tx.auditLog.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 250 }));
    await assertScopedRead("display-monitoring/page.tsx displayHeartbeat", a.displayHeartbeat.id, b.displayHeartbeat.id, (tx) => tx.displayHeartbeat.findMany({ orderBy: [{ status: "desc" }, { updatedAt: "desc" }] }));
    await assertScopedRead("documents/page.tsx opsDocument", a.opsDocument.id, b.opsDocument.id, (tx) => tx.opsDocument.findMany({ orderBy: { createdAt: "desc" } }));
    await assertScopedRead("equipment/page.tsx equipment", a.equipment.id, b.equipment.id, (tx) => tx.equipment.findMany({ orderBy: [{ status: "asc" }, { type: "asc" }, { name: "asc" }] }));
    await assertScopedRead("incidents/page.tsx incident", a.incident.id, b.incident.id, (tx) => tx.incident.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }));
    await assertScopedRead("notifications/page.tsx opsNotification", a.opsNotification.id, b.opsNotification.id, (tx) => tx.opsNotification.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
    await assertScopedRead("rehearsals/page.tsx rehearsal", a.rehearsal.id, b.rehearsal.id, (tx) => tx.rehearsal.findMany({ orderBy: { rehearsalDate: "desc" } }));
    await assertScopedRead("tasks/page.tsx opsTask", a.opsTask.id, b.opsTask.id, (tx) => tx.opsTask.findMany({ orderBy: [{ dueAt: "asc" }, { priority: "desc" }] }));
    await assertScopedRead("runbooks/page.tsx operationalChecklist", a.checklist.id, b.checklist.id, (tx) => tx.operationalChecklist.findMany({ include: { items: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } }));
    await assertScopedRead("runbooks/page.tsx runbook", a.runbook.id, b.runbook.id, (tx) => tx.runbook.findMany({ include: { tasks: { orderBy: { dueAt: "asc" } } }, orderBy: { createdAt: "desc" } }));

    // ============================================================ GROUP B
    console.log("\n========== GROUP B: public celebrations / well-wish submission (Pattern D default public org) ==========");
    const defaultOrg = await resolveDefaultPublicOrganization();
    record("B", "resolveDefaultPublicOrganization() resolves the intended default public organization", "slug=neon-ultra (documented, not caller-selected)", defaultOrg.slug === "neon-ultra", `slug=${defaultOrg.slug}`);
    try {
      neonCleanup = await withOrganizationContext(defaultOrg.id, async (tx) => {
        const season = await tx.season.findFirstOrThrow({ orderBy: { startDate: "desc" } });
        const athlete = await tx.athlete.create({ data: { organizationId: defaultOrg.id, firstName: "Batch7", lastName: `WellWish-${stamp}`, gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT", ultraAthleteId: `B7-WW-${stamp}` } });
        const player = await tx.player.create({ data: { organizationId: defaultOrg.id, athleteId: athlete.id, seasonId: season.id, position: "Guard", heightCm: 190, weightKg: 85, status: "DRAFT_ELIGIBLE", draftSelectionGroup: "MAIN_DRAFT" } });
        const announcement = await tx.announcement.create({ data: { organizationId: defaultOrg.id, playerId: player.id, celebrationYear: 2099, status: "PUBLISHED", visibility: "PUBLIC", createdById: actor.id } });
        return { orgId: defaultOrg.id, wellWishId: "", announcementId: announcement.id, playerId: player.id, athleteId: athlete.id };
      });

      // Replicate public/celebrations/actions.ts submitWellWish exactly, including the client
      // form carrying a FORGED organizationId field that must be ignored.
      async function submitWellWishReplica(announcementId: string, formData: { authorName: string; message: string; organizationId?: string }) {
        const organization = await resolveDefaultPublicOrganization();
        const input = { authorName: formData.authorName.trim(), message: formData.message.trim() }; // zod schema has no organizationId -> stripped
        return withOrganizationContext(organization.id, async (tx) => {
          const announcement = await tx.announcement.findUniqueOrThrow({ where: { id: announcementId } });
          if (announcement.status !== "PUBLISHED") throw new Error("This announcement is not currently public.");
          const viewerClubIds = await getViewerClubMemberships(undefined, tx);
          if (!canViewAnnouncement(announcement.visibility, announcement.visibilityClubId, viewerClubIds)) throw new Error("You don't have access to this announcement.");
          return tx.wellWish.create({ data: { organizationId: organization.id, announcementId, authorUserId: null, authorName: input.authorName, message: input.message } });
        });
      }
      const wellWish = await submitWellWishReplica(neonCleanup.announcementId, { authorName: "Public Fan", message: "Well done!", organizationId: b.org.id });
      neonCleanup.wellWishId = wellWish.id;
      record("B", "Unauthenticated public submission writes a WellWish stamped with the default public org (forged organizationId=B ignored)", `organizationId=${defaultOrg.id}`, wellWish.organizationId === defaultOrg.id, `organizationId=${wellWish.organizationId}${wellWish.organizationId === b.org.id ? " -- FORGED ORG HONORED" : ""}`);
      record("B", "Public submission preserves unauthenticated behavior (authorUserId null)", "authorUserId=null", wellWish.authorUserId === null, `authorUserId=${String(wellWish.authorUserId)}`);

      const seenInDefault = await withOrganizationContext(defaultOrg.id, (tx) => tx.wellWish.findUnique({ where: { id: wellWish.id } }));
      record("B", "WellWish visible inside the default public org context", "found", Boolean(seenInDefault), String(Boolean(seenInDefault)));
      const seenInB = await withOrganizationContext(b.org.id, (tx) => tx.wellWish.findUnique({ where: { id: wellWish.id } }));
      record("B", "WellWish invisible from Org B context (no cross-org read)", "null", seenInB === null, JSON.stringify(seenInB));
      try {
        await withOrganizationContext(b.org.id, (tx) => tx.wellWish.update({ where: { id: wellWish.id }, data: { message: "hijacked" } }));
        record("B", "Org B mutates Org A/default org's WellWish by id", "denied (not found)", false, "unexpectedly succeeded");
      } catch (error) {
        record("B", "Org B mutates Org A/default org's WellWish by id", "denied (not found)", isNotFound(error), errName(error));
      }
    } catch (error) {
      blocked("B", "Public celebrations proof", `setup failed: ${errName(error)}`);
    }

    // ============================================================ GROUP C
    console.log("\n========== GROUP C: rehearsal broadcast / live fixture scoping ==========");
    async function rehearsalPageReplica(orgId: string, fixtureId: string) {
      return withOrganizationContext(orgId, async (tx) => {
        const fixture = await tx.fixture.findUnique({
          where: { id: fixtureId },
          include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
        });
        if (!fixture || fixture.recordOrigin !== "REHEARSAL" || !fixture.game || !["LIVE", "PAUSED"].includes(fixture.game.status)) return null;
        const model = await buildLivePresentationModelForGame(fixture.game.id, tx);
        return { fixture, model };
      });
    }
    const ownA = await rehearsalPageReplica(a.org.id, a.fixture.id);
    record("C", "Org A reads its own REHEARSAL fixture and builds the presentation model", "non-null model", Boolean(ownA), `fixture=${Boolean(ownA?.fixture)} model=${Boolean(ownA?.model)}`);
    const crossB = await rehearsalPageReplica(b.org.id, a.fixture.id);
    record("C", "Org B uses Org A's real fixture id", "fail-closed (null -> notFound)", crossB === null, JSON.stringify(crossB));
    const ownB = await rehearsalPageReplica(b.org.id, b.fixture.id);
    record("C", "Org B reads its own REHEARSAL fixture and builds the presentation model", "non-null model", Boolean(ownB), `fixture=${Boolean(ownB?.fixture)} model=${Boolean(ownB?.model)}`);
    const unknown = await rehearsalPageReplica(a.org.id, `forged-${stamp}`);
    record("C", "Forged/unknown fixture id under Org A", "fail-closed (null -> notFound)", unknown === null, JSON.stringify(unknown));
    try {
      await withOrganizationContext(b.org.id, (tx) => buildLivePresentationModelForGame(a.game.id, tx));
      record("C", "Org B builds the presentation model for Org A's real game id (model builder tenant-scoped)", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("C", "Org B builds the presentation model for Org A's real game id (model builder tenant-scoped)", "denied (not found)", isNotFound(error), errName(error));
    }

    // ============================================================ GROUP D
    console.log("\n========== GROUP D: all-star team reads/writes (real library functions) ==========");
    // Known Stage 5.4A limitation, surfaced not hidden: `SystemSetting.key` is a bare GLOBAL
    // unique, and staging's real `all-star-team:zenith` / `:pulse` rows belong to Neon Ultra (the
    // production org). A disposable org therefore cannot own the real slugs. Proven here:
    //   (a) real-slug reads/writes from a disposable org are denied;
    //   (b) the real function's same-org write path succeeds and stamps org provenance, using
    //       proof-only slug keys (`batch7-proof-zenith` / `-pulse`) so no real Neon Ultra
    //       exhibition data is touched. The slug is the only deviation; the function under test
    //       (keyFor -> findUniqueOrThrow -> quota -> update -> audit) is the real one.
    const slugA = "batch7-proof-zenith" as unknown as AllStarTeamSlug;
    const slugB = "batch7-proof-pulse" as unknown as AllStarTeamSlug;

    const aTeams = await withOrganizationContext(a.org.id, (tx) => getAllStarTeams(tx));
    record("D", "getAllStarTeams(db) under disposable Org A (real slugs)", "[] - Neon Ultra's zenith/pulse do not leak", aTeams.length === 0, JSON.stringify(aTeams.map((t) => t.slug)));
    const bTeams = await withOrganizationContext(b.org.id, (tx) => getAllStarTeams(tx));
    record("D", "getAllStarTeams(db) under disposable Org B (real slugs)", "[] - no leak", bTeams.length === 0, JSON.stringify(bTeams.map((t) => t.slug)));
    const neonOrgForAllStar = await resolveDefaultPublicOrganization();
    const neonTeams = await withOrganizationContext(neonOrgForAllStar.id, (tx) => getAllStarTeams(tx));
    record("D", "getAllStarTeams(db) under the owning org reads its real teams", "includes zenith and pulse", neonTeams.some((t) => t.slug === "zenith") && neonTeams.some((t) => t.slug === "pulse"), JSON.stringify(neonTeams.map((t) => t.slug)));

    const aPool = await withOrganizationContext(a.org.id, (tx) => getAllStarCandidatePool(tx));
    const aPoolIds = new Set([...aPool.playersMale, ...aPool.playersFemale].map((c) => c.sourceId));
    record("D", "getAllStarCandidatePool(db) under Org A", "contains Org A player, not Org B player", aPoolIds.has(a.player.id) && !aPoolIds.has(b.player.id), JSON.stringify({ hasA: aPoolIds.has(a.player.id), hasB: aPoolIds.has(b.player.id) }));
    const bPool = await withOrganizationContext(b.org.id, (tx) => getAllStarCandidatePool(tx));
    const bPoolIds = new Set([...bPool.playersMale, ...bPool.playersFemale].map((c) => c.sourceId));
    record("D", "getAllStarCandidatePool(db) under Org B", "contains Org B player, not Org A player", bPoolIds.has(b.player.id) && !bPoolIds.has(a.player.id), JSON.stringify({ hasB: bPoolIds.has(b.player.id), hasA: bPoolIds.has(a.player.id) }));

    // Real-slug cross-org write denial against Neon Ultra's real rows.
    try {
      await addAllStarRosterMember("zenith", { kind: "PLAYER", sourceId: a.player.id }, actor.id, a.org.id);
      record("D", "Disposable Org A writes to the real `zenith` slug owned by Neon Ultra", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("D", "Disposable Org A writes to the real `zenith` slug owned by Neon Ultra", "denied (not found)", isNotFound(error), errName(error));
    }

    // Same-org write path with proof-only slug keys (no real data touched).
    await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.create({ data: { organizationId: a.org.id, key: `all-star-team:${slugA}`, value: { name: "Proof Zenith", players: [], locked: false }, category: "all-star-proof", description: "batch7 proof" } }));
    await withOrganizationContext(b.org.id, (tx) => tx.systemSetting.create({ data: { organizationId: b.org.id, key: `all-star-team:${slugB}`, value: { name: "Proof Pulse", players: [], locked: false }, category: "all-star-proof", description: "batch7 proof" } }));
    const aAdded = await addAllStarRosterMember(slugA, { kind: "PLAYER", sourceId: a.player.id }, actor.id, a.org.id);
    record("D", "Org A adds its own player to its own all-star team (real function)", "PASS", aAdded.sourcePlayerId === a.player.id, JSON.stringify({ sourcePlayerId: aAdded.sourcePlayerId === a.player.id }));
    const bAdded = await addAllStarRosterMember(slugB, { kind: "PLAYER", sourceId: b.player.id }, actor.id, b.org.id);
    record("D", "Org B's own all-star operation remains functional", "PASS", bAdded.sourcePlayerId === b.player.id, JSON.stringify({ sourcePlayerId: bAdded.sourcePlayerId === b.player.id }));
    try {
      await addAllStarRosterMember(slugA, { kind: "PLAYER", sourceId: a.player.id }, actor.id, b.org.id);
      record("D", "Org B writes to Org A's all-star team", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("D", "Org B writes to Org A's all-star team", "denied (not found)", isNotFound(error), errName(error));
    }
    try {
      await addAllStarRosterMember(slugB, { kind: "PLAYER", sourceId: a.player.id }, actor.id, b.org.id);
      record("D", "Org B adds Org A's player (forged playerId) to Org B's own team", "denied (Player not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("D", "Org B adds Org A's player (forged playerId) to Org B's own team", "denied (Player not found)", String(error).includes("not found") || isNotFound(error), errName(error));
    }
    const aUpdated = await updateAllStarPlayer(slugA, aAdded.id, { position: "Forward" }, actor.id, a.org.id);
    record("D", "Org A updates a member on its own all-star team", "PASS", aUpdated.position === "Forward", String(aUpdated.position));
    try {
      await updateAllStarPlayer(slugA, aAdded.id, { position: "Hacked" }, actor.id, b.org.id);
      record("D", "Org B updates a member on Org A's all-star team", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("D", "Org B updates a member on Org A's all-star team", "denied (not found)", isNotFound(error), errName(error));
    }
    const aAddAudit = await withOrganizationContext(a.org.id, (tx) => tx.auditLog.findFirst({ where: { action: "ALL_STAR_MEMBER_ADDED", organizationId: a.org.id } }));
    record("D", "All-star write audit row stamped with Org A", `organizationId=${a.org.id}`, aAddAudit?.organizationId === a.org.id, String(aAddAudit?.organizationId));
    const bSeesAAddAudit = await withOrganizationContext(b.org.id, (tx) => tx.auditLog.findFirst({ where: { action: "ALL_STAR_MEMBER_ADDED", organizationId: a.org.id } }));
    record("D", "Org B cannot see Org A's all-star audit row", "null", bSeesAAddAudit === null, JSON.stringify(bSeesAAddAudit));

    // Lock/unlock need an exact 2M/2F player + 2M/2F coach roster; seed it directly.
    const mkMember = (id: string, kind: "PLAYER" | "COACH", gender: "MALE" | "FEMALE") => ({ id, fullName: `${gender} ${kind} ${id}`, kind, gender, sourcePlayerId: kind === "PLAYER" ? `src-${id}` : null, sourceStaffId: kind === "COACH" ? `src-${id}` : null, clubName: "Test Club", phone: null, bio: null, position: null, heightCm: null, weightKg: null, stats: null, addedAt: new Date().toISOString(), addedBy: actor.id, updatedAt: null, updatedBy: null });
    const fullRoster = { name: "Proof Zenith", locked: false, players: [mkMember("p-m1", "PLAYER", "MALE"), mkMember("p-m2", "PLAYER", "MALE"), mkMember("p-f1", "PLAYER", "FEMALE"), mkMember("p-f2", "PLAYER", "FEMALE"), mkMember("c-m1", "COACH", "MALE"), mkMember("c-m2", "COACH", "MALE"), mkMember("c-f1", "COACH", "FEMALE"), mkMember("c-f2", "COACH", "FEMALE")] };
    await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.update({ where: { key: `all-star-team:${slugA}` }, data: { value: fullRoster } }));
    await lockAllStarRoster(slugA, actor.id, a.org.id);
    const locked = await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.findUniqueOrThrow({ where: { key: `all-star-team:${slugA}` } }));
    record("D", "Org A locks its own quota-complete all-star roster", "locked=true", Boolean((locked.value as { locked?: boolean }).locked), JSON.stringify({ locked: (locked.value as { locked?: boolean }).locked }));
    await unlockAllStarRoster(slugA, actor.id, "proof unlock", a.org.id);
    const unlocked = await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.findUniqueOrThrow({ where: { key: `all-star-team:${slugA}` } }));
    record("D", "Org A unlocks its own all-star roster", "locked=false", (unlocked.value as { locked?: boolean }).locked === false, JSON.stringify({ locked: (unlocked.value as { locked?: boolean }).locked }));
    try {
      await lockAllStarRoster(slugA, actor.id, b.org.id);
      record("D", "Org B locks Org A's all-star roster", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("D", "Org B locks Org A's all-star roster", "denied (not found)", isNotFound(error), errName(error));
    }
    blocked("D", "All-star same-org writes against the REAL slugs (zenith/pulse)", "SystemSetting.key is globally unique and those keys belong to Neon Ultra; using them for a disposable org is impossible and mutating Neon Ultra's real exhibition data is out of scope. Same-org writes proven with proof-only slug keys; real-slug denial proven.");

    // ============================================================ GROUP E
    console.log("\n========== GROUP E: Season Zero production reconciliation (real library functions) ==========");
    // The 58 authoritative cohort Application ids are real Neon Ultra rows that already exist in
    // staging, so a disposable org cannot own them (and mutating real cohort Applications is out
    // of scope). Proven here: (a) read isolation against the real cohort data; (b) same-org write
    // success + cross-org denial using the real functions; (c) a disposable-org apply.
    const cohortAppId = SEASON_ZERO_SELECTED_PLAYERS[0].applicationId;
    const neonOrgForS0 = await resolveDefaultPublicOrganization();

    const recNeon = await withOrganizationContext(neonOrgForS0.id, (tx) => seasonZeroProductionReconciliation(tx, neonOrgForS0.id));
    const cohortNeon = recNeon.find((r) => r.applicationId === cohortAppId);
    record("E", "seasonZeroProductionReconciliation(db, org) under the owning org reads the real cohort Application", "not MISSING", cohortNeon !== undefined && cohortNeon.productionApplicationStatus !== "MISSING", String(cohortNeon?.productionApplicationStatus));
    const recA = await withOrganizationContext(a.org.id, (tx) => seasonZeroProductionReconciliation(tx, a.org.id));
    const cohortRowA = recA.find((r) => r.applicationId === cohortAppId);
    record("E", "same reconciliation under disposable Org A cannot see the real cohort Application", "MISSING", cohortRowA?.productionApplicationStatus === "MISSING", String(cohortRowA?.productionApplicationStatus));
    const recB = await withOrganizationContext(b.org.id, (tx) => seasonZeroProductionReconciliation(tx, b.org.id));
    const cohortRowB = recB.find((r) => r.applicationId === cohortAppId);
    record("E", "same reconciliation under disposable Org B cannot see the real cohort Application", "MISSING", cohortRowB?.productionApplicationStatus === "MISSING", String(cohortRowB?.productionApplicationStatus));

    const dupsNeon = await withOrganizationContext(neonOrgForS0.id, (tx) => duplicateCandidatesForApplication(cohortAppId, tx, neonOrgForS0.id));
    record("E", "duplicateCandidatesForApplication under the owning org finds the canonical Application", ">=1 candidate", dupsNeon.length >= 1, `candidates=${dupsNeon.length}`);
    try {
      await withOrganizationContext(a.org.id, (tx) => duplicateCandidatesForApplication(cohortAppId, tx, a.org.id));
      record("E", "duplicateCandidatesForApplication under disposable Org A for the real cohort id", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("E", "duplicateCandidatesForApplication under disposable Org A for the real cohort id", "denied (not found)", isNotFound(error), errName(error));
    }

    const resKey = `season-zero-player-resolution:${cohortAppId}`;
    const neonResBefore = await withOrganizationContext(neonOrgForS0.id, (tx) => tx.systemSetting.findUnique({ where: { key: resKey } }));
    await saveSeasonZeroPlayerResolution({ applicationId: cohortAppId, action: "APPROVE_FOR_SEASON_ZERO_OVERRIDE", reason: "batch7 proof", actorUserId: actor.id, organizationId: a.org.id });
    const resA = await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.findUnique({ where: { key: resKey } }));
    record("E", "saveSeasonZeroPlayerResolution under Org A writes an Org A-owned resolution (real function, same-org)", `organizationId=${a.org.id}`, resA?.organizationId === a.org.id, String(resA?.organizationId));
    const resB = await withOrganizationContext(b.org.id, (tx) => tx.systemSetting.findUnique({ where: { key: resKey } }));
    record("E", "Org B cannot read Org A's resolution row", "null", resB === null, JSON.stringify(resB));
    const neonResAfter = await withOrganizationContext(neonOrgForS0.id, (tx) => tx.systemSetting.findUnique({ where: { key: resKey } }));
    record("E", "Owning org's resolution state unchanged by Org A's write", "unchanged", (neonResBefore?.organizationId ?? null) === (neonResAfter?.organizationId ?? null), JSON.stringify({ before: neonResBefore?.organizationId ?? null, after: neonResAfter?.organizationId ?? null }));
    try {
      await saveSeasonZeroPlayerResolution({ applicationId: cohortAppId, action: "APPROVE_FOR_SEASON_ZERO_OVERRIDE", reason: "attack", actorUserId: actor.id, organizationId: b.org.id });
      record("E", "Org B records a resolution for the same global key now owned by Org A", "denied (unique/RLS fails closed)", false, "unexpectedly succeeded");
    } catch (error) {
      record("E", "Org B records a resolution for the same global key now owned by Org A", "denied (unique/RLS fails closed)", isUniqueViolation(error) || String(error).includes("row-level security"), errName(error));
    }
    const resAAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.systemSetting.findUnique({ where: { key: resKey } }));
    record("E", "Org A's resolution row unchanged after Org B's failed write", `organizationId=${a.org.id}`, resAAfterAttack?.organizationId === a.org.id, String(resAAfterAttack?.organizationId));

    // applySeasonZeroPlayerApproval same-org success + cross-org denial, on a disposable application.
    const applyAppId = `batch7-apply-${stamp}`;
    await withOrganizationContext(a.org.id, async (tx) => {
      await tx.application.create({ data: { id: applyAppId, organizationId: a.org.id, type: "PLAYER", status: "SUBMITTED", submittedData: { email: `batch7-apply-${stamp}@example.test`, fullName: "Batch 7 Apply" } } });
      await tx.systemSetting.create({ data: { organizationId: a.org.id, key: `season-zero-player-resolution:${applyAppId}`, value: { action: "APPROVE_FOR_SEASON_ZERO_OVERRIDE", reason: "batch7 proof", resolvedById: actor.id, resolvedAt: new Date().toISOString() }, category: "data-quality", description: "batch7 proof" } });
    });
    await applySeasonZeroPlayerApproval(applyAppId, actor.id, a.org.id);
    const appliedA = await withOrganizationContext(a.org.id, (tx) => tx.application.findUniqueOrThrow({ where: { id: applyAppId } }));
    record("E", "applySeasonZeroPlayerApproval under Org A flips its own Application to APPROVED (real function, same-org)", "APPROVED", appliedA.status === "APPROVED", appliedA.status);
    const applyAudit = await withOrganizationContext(a.org.id, (tx) => tx.auditLog.findFirst({ where: { action: "SEASON_ZERO_PLAYER_APPLICATION_APPROVED", organizationId: a.org.id } }));
    record("E", "applySeasonZeroPlayerApproval audit row stamped with Org A", `organizationId=${a.org.id}`, applyAudit?.organizationId === a.org.id, String(applyAudit?.organizationId));
    try {
      await applySeasonZeroPlayerApproval(applyAppId, actor.id, b.org.id);
      record("E", "Org B applies Approval to Org A's disposable Application", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("E", "Org B applies Approval to Org A's disposable Application", "denied (not found)", isNotFound(error) || String(error).includes("No recorded resolution"), errName(error));
    }
    const stillApproved = await withOrganizationContext(a.org.id, (tx) => tx.application.findUniqueOrThrow({ where: { id: applyAppId } }));
    record("E", "Org A's Application unchanged after Org B's failed apply", "APPROVED", stillApproved.status === "APPROVED", stillApproved.status);
    blocked("E", "Season Zero reconciliation same-org write against the REAL cohort Applications", "the 58 authoritative cohort ids are real Neon Ultra rows; mutating them (apply flips Application.status) is out of scope. Read isolation against real cohort data and same-org writes on disposable ids are proven.");

    // ============================================================ GROUP F
    console.log("\n========== GROUP F: negative controls + named DB-level limitation ==========");
    const bareRead = await prisma.player.findFirst({ where: { id: a.player.id } });
    record("F", "Bare (unscoped) prisma read of Org A's real player id under the restricted role", "null (RLS/fallback blocks Org A data)", bareRead === null, JSON.stringify(bareRead));
    const bareCount = await prisma.$queryRaw<{ count: bigint }[]>`select count(*)::bigint as count from "Player" where "organizationId" = ${a.org.id}`;
    record("F", "Raw SQL count of Org A players under no org context (restricted role)", "0", Number(bareCount[0]?.count ?? -1) === 0, String(bareCount[0]?.count));
    const crossUpdate = await withOrganizationContext(b.org.id, (tx) => tx.player.updateMany({ where: { id: a.player.id }, data: { position: "HACKED" } }));
    record("F", "Org B raw updateMany on Org A's player id", "0 rows affected", crossUpdate.count === 0, `count=${crossUpdate.count}`);
    const aPlayerAfter = await withOrganizationContext(a.org.id, (tx) => tx.player.findUniqueOrThrow({ where: { id: a.player.id } }));
    record("F", "Org A's player unchanged after Org B's forged update", "position=Guard", aPlayerAfter.position === "Guard", aPlayerAfter.position);
    const sameOrg = await withOrganizationContext(a.org.id, (tx) => tx.player.findFirst({ where: { id: a.player.id } }));
    record("F", "Same-org control: Org A reads its own player (test is not passing because everything is broken)", "found", Boolean(sameOrg), String(Boolean(sameOrg)));

    // Named DB-level limitation, deliberately surfaced not hidden: Player.athleteId/seasonId are
    // simple (non-composite) FKs, so a raw DB-level forged create bypassing the application guard
    // still succeeds. This is out of Batch 7 scope (the batch did not change the schema) and is
    // reported separately.
    const forgedRaw = await withOrganizationContext(b.org.id, (tx) => tx.player.create({ data: { organizationId: b.org.id, athleteId: a.athlete.id, seasonId: b.season.id, position: "Forward", heightCm: 200, weightKg: 100, status: "DRAFT_ELIGIBLE", draftSelectionGroup: "MAIN_DRAFT" } }).catch(() => null));
    record("F", "KNOWN DB-LEVEL GAP (outside Batch 7 scope): raw Player.create with org B + Org A athlete + Org B season", "SUCCEEDS at DB level (simple FKs, schema not changed this batch)", Boolean(forgedRaw?.id), forgedRaw ? "DB_LEVEL_GAP_NAMED_NOT_FIXED_THIS_BATCH" : "did not succeed (gap may be closed)");
    if (forgedRaw) await withOrganizationContext(b.org.id, (tx) => tx.player.delete({ where: { id: forgedRaw.id } }));
  } finally {
    // ============================================================ CLEANUP
    console.log("\n========== Cleanup ==========");
    const nc = neonCleanup;
    if (nc) {
      await withOrganizationContext(nc.orgId, async (tx) => {
        if (nc.wellWishId) await tx.wellWish.deleteMany({ where: { id: nc.wellWishId } });
        await tx.wellWish.deleteMany({ where: { announcementId: nc.announcementId } });
        await tx.announcement.deleteMany({ where: { id: nc.announcementId } });
        await tx.player.deleteMany({ where: { id: nc.playerId } });
        await tx.athlete.deleteMany({ where: { id: nc.athleteId } });
      });
    }
    for (const orgId of createdOrgIds) {
      await withOrganizationContext(orgId, async (tx) => {
        await tx.auditLog.deleteMany({ where: { organizationId: orgId } });
        await tx.game.deleteMany({ where: { organizationId: orgId } });
        await tx.fixture.deleteMany({ where: { organizationId: orgId } });
        await tx.operationalChecklistItem.deleteMany({ where: { organizationId: orgId } });
        await tx.operationalChecklist.deleteMany({ where: { organizationId: orgId } });
        await tx.runbookTask.deleteMany({ where: { organizationId: orgId } });
        await tx.runbook.deleteMany({ where: { organizationId: orgId } });
        await tx.application.deleteMany({ where: { organizationId: orgId } });
        await tx.incident.deleteMany({ where: { organizationId: orgId } });
        await tx.opsNotification.deleteMany({ where: { organizationId: orgId } });
        await tx.opsDocument.deleteMany({ where: { organizationId: orgId } });
        await tx.opsTask.deleteMany({ where: { organizationId: orgId } });
        await tx.rehearsal.deleteMany({ where: { organizationId: orgId } });
        await tx.equipment.deleteMany({ where: { organizationId: orgId } });
        await tx.displayHeartbeat.deleteMany({ where: { organizationId: orgId } });
        await tx.systemSetting.deleteMany({ where: { organizationId: orgId } });
        await tx.player.deleteMany({ where: { organizationId: orgId } });
        await tx.athlete.deleteMany({ where: { organizationId: orgId } });
        await tx.seasonClub.deleteMany({ where: { organizationId: orgId } });
        await tx.staff.deleteMany({ where: { organizationId: orgId } });
        await tx.club.deleteMany({ where: { organizationId: orgId } });
        await tx.venue.deleteMany({ where: { organizationId: orgId } });
        await tx.season.deleteMany({ where: { organizationId: orgId } });
        await tx.division.deleteMany({ where: { organizationId: orgId } });
        await tx.competition.deleteMany({ where: { organizationId: orgId } });
        await tx.publicIdCounter.deleteMany({ where: { organizationId: orgId } });
        await tx.publicResourceLocator.deleteMany({ where: { organizationId: orgId } });
        await tx.publicTokenLocator.deleteMany({ where: { organizationId: orgId } });
      });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    await prisma.user.delete({ where: { id: actor.id } });
  }

  const residueOrgs = await prisma.organization.count({ where: { slug: { startsWith: "stage55b-batch7-" } } });
  const residueUsers = await prisma.user.count({ where: { email: { startsWith: "stage55b-batch7-" } } });
  const residueNeonAthletes = await withOrganizationContext((await resolveDefaultPublicOrganization()).id, (tx) => tx.athlete.count({ where: { ultraAthleteId: { startsWith: "B7-WW-" } } }));
  const resLoc = await prisma.publicResourceLocator.count();
  const tokLoc = await prisma.publicTokenLocator.count();
  record("CLN", "Residue: disposable Organizations", "0", residueOrgs === 0, String(residueOrgs));
  record("CLN", "Residue: disposable Users", "0", residueUsers === 0, String(residueUsers));
  record("CLN", "Residue: disposable Neon-Ultra well-wish athletes", "0", residueNeonAthletes === 0, String(residueNeonAthletes));
  record("CLN", "Locator baseline after cleanup", "257 resource / 0 token", resLoc === 257 && tokLoc === 0, JSON.stringify({ resLoc, tokLoc }));

  console.log("\n========== SUMMARY ==========");
  const failed = proofs.filter((p) => p.result === "FAIL");
  const blockedRows = proofs.filter((p) => p.result === "BLOCKED");
  console.log(`${proofs.length} assertions run, ${proofs.length - failed.length - blockedRows.length} PASS, ${failed.length} FAIL, ${blockedRows.length} BLOCKED`);
  if (failed.length) {
    console.log("FAILED:", failed.map((p) => p.id).join(", "));
    process.exitCode = 1;
  }
  if (blockedRows.length) {
    console.log("BLOCKED:", blockedRows.map((p) => p.id).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("PROOF SCRIPT ERROR:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
