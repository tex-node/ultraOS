import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const KEY_PREFIX = "all-star-team:";

const teams = [
  {
    slug: "zenith",
    name: "Zenith",
    captainStaffId: "cmqurqfhh0001h3kkc6gfa79i", // Olusegun Imah
    coachStaffIds: [
      "cmqurqfhh0001h3kkc6gfa79i", // Olusegun Imah (captain)
      "cmsm34n7w00046jkkm8brqy39", // Afunku Adeyinka
      "cmsmlv4dp0005o9kke0kxrlnu", // Imomoh Kewwe Blessing
      "cmr0nqyoz0001utkkchz8uj8p", // Adetokunbo Olaosebikan Ijomah
    ],
  },
  {
    slug: "pulse",
    name: "Pulse",
    captainStaffId: "cmr1tyxgt002gutkkor5xxxuh", // Bilqis Adekoya
    coachStaffIds: [
      "cmr1tyxgt002gutkkor5xxxuh", // Bilqis Adekoya (captain)
      "cmr0m6h8h0000z7kkfov56yoa", // Mcspencer Akpan
      "cmrh7mw160006c9kkuii9i0dk", // Christopher Ndifon Ekpe
      "cmsm34grj00016jkkthefvewo", // Udeaja Chioma Priscilla
    ],
  },
];

async function main() {
  for (const team of teams) {
    const staff = await prisma.staff.findMany({ where: { id: { in: team.coachStaffIds } }, select: { id: true, name: true, ultraStaffId: true } });
    if (staff.length !== team.coachStaffIds.length) throw new Error(`Team ${team.name}: expected ${team.coachStaffIds.length} coaches, found ${staff.length}`);
    const captain = staff.find((s) => s.id === team.captainStaffId);
    if (!captain) throw new Error(`Team ${team.name}: captain not found among roster.`);

    const value = {
      name: team.name,
      captain: { staffId: captain.id, name: captain.name, ultraStaffId: captain.ultraStaffId },
      coaches: staff.map((s) => ({ staffId: s.id, name: s.name, ultraStaffId: s.ultraStaffId })),
      players: [] as string[],
      playersAssignedOnMatchDay: true,
      createdAt: new Date().toISOString(),
      createdBy: ACTOR_ID,
      note: "Exhibition/all-star team, separate from Season Zero league Clubs. Does not affect Club/SeasonClub counts, fixtures, or standings.",
    };

    await prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: `${KEY_PREFIX}${team.slug}` },
        update: { value, description: `All-star exhibition team: ${team.name}`, category: "all-star-exhibition" },
        create: { key: `${KEY_PREFIX}${team.slug}`, value, description: `All-star exhibition team: ${team.name}`, category: "all-star-exhibition" },
      });
      await writeAuditLog(tx, {
        action: "ALL_STAR_TEAM_CREATED",
        details: value,
        entityId: team.slug,
        entityType: "AllStarTeam",
        userId: ACTOR_ID,
      });
    });

    console.log(`${team.name}: captain=${captain.name}, coaches=[${staff.map((s) => s.name).join(", ")}]`);
  }
}

main().finally(() => prisma.$disconnect());
