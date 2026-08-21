import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { approvedPlayerDuplicateGroups, saveDuplicateResolution } from "../src/lib/data-quality";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const selectedIds = new Set(selectedPlayers.map((p) => p.applicationId));
const APPLY = process.argv.includes("--apply");

async function main() {
  const groups = await approvedPlayerDuplicateGroups();
  const cohortGroups = groups.filter(
    (g) => g.currentResolution === "UNRESOLVED" && g.applications.some((a) => selectedIds.has(a.applicationId))
  );
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${cohortGroups.length} unresolved groups intersecting the 58 selected cohort`);

  for (const group of cohortGroups) {
    const selectedMembers = group.applications.filter((a) => selectedIds.has(a.applicationId));
    if (selectedMembers.length > 1) {
      console.log(`\n!! DISTINCT_PEOPLE (multiple independently-selected players share this group) — ${group.id}`);
      for (const m of selectedMembers) console.log(`   selected: ${m.applicationId} (${m.fullName})`);
      for (const m of group.applications.filter((a) => !selectedIds.has(a.applicationId))) console.log(`   other:    ${m.applicationId} (${m.fullName})`);
      if (APPLY) {
        await saveDuplicateResolution({
          groupId: group.id,
          action: "DISTINCT_PEOPLE",
          reason: "Grouped only because these applications share the same linked login/User email (family/shared device); submitted names and applicant emails are different real people, each independently selected in the authoritative TryOutsPlayers.xlsx workbook. Not a duplicate identity.",
          secondaryApplicationIds: group.applications.map((a) => a.applicationId),
          actorUserId: ACTOR_ID,
        });
      }
      continue;
    }
    const canonical = selectedMembers[0];
    if (!canonical) { console.log(`SKIP ${group.id}: no selected-cohort application found (unexpected)`); continue; }
    const others = group.applications.filter((a) => a.applicationId !== canonical.applicationId).map((a) => a.applicationId);
    console.log(`${group.id}: canonical=${canonical.applicationId} (${canonical.fullName}), historical=${JSON.stringify(others)}`);
    if (!APPLY) continue;
    await saveDuplicateResolution({
      groupId: group.id,
      action: "SAME_PERSON_LINK",
      reason: "Canonical Season Zero Application selected from authoritative TryOutsPlayers.xlsx workbook Application ID column; other applications are the same person's earlier duplicate submissions, preserved as historical records.",
      primaryApplicationId: canonical.applicationId,
      secondaryApplicationIds: others,
      actorUserId: ACTOR_ID,
    });
  }
}

main().finally(() => prisma.$disconnect());
