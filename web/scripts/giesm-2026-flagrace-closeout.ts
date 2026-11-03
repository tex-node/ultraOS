import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { parseEventResults, type EventResults } from "../src/lib/public/event-results";

// GIESM 2026 close-out (streak v33): the flag-race field that was registered on paper at the venue, and
// the published results enriched with what the organiser actually recorded.
//
//   npx tsx scripts/giesm-2026-flagrace-closeout.ts --organization <orgId>            # dry run
//   npx tsx scripts/giesm-2026-flagrace-closeout.ts --organization <orgId> --apply    # write
//
// Two jobs, both idempotent:
//   1. INTAKE. The 17 male and 2 female flag-race athletes who entered at the venue were never in the
//      system. They become INDIVIDUAL entrants of a "GIESM 2026 Flag Race" competition, one division
//      per gender, with the bib number they were given at the venue stored as `seed` (the model has no
//      bib column, and seed is the entry-order integer the console already sorts by).
//   2. RESULTS. The four published categories keep their placements, and gain the two things a reader
//      needs and the original payload lacked: the bib next to each runner's name, and an honest note
//      that finish times were not captured at the venue. No time is invented.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const APPLY = process.argv.includes("--apply");
if (!ORGANIZATION) {
  console.error("usage: giesm-2026-flagrace-closeout.ts --organization <orgId> [--apply]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

const MALE_ATHLETES: { bib: string; name: string }[] = [
  { bib: "01", name: "Wisdom Gambo" },
  { bib: "02", name: "David Darasimi" },
  { bib: "03", name: "Ekechukwu Isaac" },
  { bib: "04", name: "Eluji Destiny" },
  { bib: "05", name: "Olatunji Emmanuel" },
  { bib: "06", name: "Abdoulaye Abdoumalic" },
  { bib: "07", name: "Nwanoruo Winner" },
  { bib: "08", name: "Ibrahim Abdoulquawiy" },
  { bib: "09", name: "Kasumu Olanrewaju" },
  { bib: "10", name: "Kadiri Ayomide" },
  { bib: "11", name: "Aino Abdoul Dayyan" },
  { bib: "12", name: "David Jimmy" },
  { bib: "13", name: "Ajayi Azeem" },
  { bib: "14", name: "Kamoru Abdoulrahmon" },
  { bib: "15", name: "Sunday David" },
  { bib: "16", name: "Adekanbi Adeboye Samuel" },
  { bib: "17", name: "Houndealo Felix" },
];

const FEMALE_ATHLETES: { bib: string; name: string }[] = [
  { bib: "01", name: "Rita Dickson" },
  { bib: "02", name: "Sara Testimory" },
];

// Bids recorded at the venue for the podium, where the intake list names the same person. Onugwu Obina
// finished third and is NOT on the intake sheet, so no bib is claimed for him.
const RESULT_BIBS: Record<string, string> = {
  "Houndealo Felix": "17",
  "Ekechukwu Isaac": "03",
  "Rita Dickson": "01",
  "Sara Testimory": "02",
};

// The published payload spelled the runner "Sara Testimony"; the venue sheet says "Sara Testimory", and so
// does the athlete record created by the intake. One person, two spellings - the results are corrected to the
// spelling the organiser gave in both lists, and the bib then attaches to a name that actually exists.
const NAME_FIXES: Record<string, string> = {
  "Sara Testimony": "Sara Testimory",
};

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { id: true, name: true } });
  console.log(`  organization: ${organization.name}`);

  const event = await withOrganizationContext(ORG, (tx) =>
    tx.event.findFirstOrThrow({
      where: { organizationId: ORG, slug: "giesm" },
      select: { id: true, name: true, status: true, results: true, startTime: true, seasonId: true },
    }),
  );
  console.log(`  event: ${event.name} (${event.status})`);

  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "flag-race" }, select: { id: true } });
    let competition = await tx.competition.findFirst({ where: { organizationId: ORG, slug: "giesm-2026-flag-race" }, select: { id: true } });
    if (!competition) {
      if (!APPLY) {
        console.log("  [dry run] would create competition GIESM 2026 Flag Race");
      } else {
        competition = await tx.competition.create({
          data: { organizationId: ORG, sportId: sport.id, name: "GIESM 2026 Flag Race", slug: "giesm-2026-flag-race" },
          select: { id: true },
        });
        console.log("  created competition GIESM 2026 Flag Race");
      }
    }
    if (!competition) return null;

    let season = await tx.season.findFirst({ where: { organizationId: ORG, competitionId: competition.id, name: "2026" }, select: { id: true } });
    if (!season) {
      if (!APPLY) {
        console.log("  [dry run] would create season 2026");
      } else {
        season = await tx.season.create({
          data: {
            organizationId: ORG,
            competitionId: competition.id,
            name: "2026",
            status: "COMPLETED",
            startDate: event.startTime,
            endDate: event.startTime,
          },
          select: { id: true },
        });
        console.log("  created season 2026");
      }
    }
    if (!season) return null;

    const divisions: Record<"MALE" | "FEMALE", { id: string; slug: string; name: string }> = {
      MALE: { id: "", slug: "male", name: "Male" },
      FEMALE: { id: "", slug: "female", name: "Female" },
    };
    for (const key of ["MALE", "FEMALE"] as const) {
      const existing = await tx.division.findFirst({ where: { organizationId: ORG, competitionId: competition.id, slug: divisions[key].slug }, select: { id: true } });
      if (existing) {
        divisions[key].id = existing.id;
      } else if (APPLY) {
        const created = await tx.division.create({
          data: { organizationId: ORG, competitionId: competition.id, name: divisions[key].name, slug: divisions[key].slug },
          select: { id: true },
        });
        divisions[key].id = created.id;
        console.log(`  created division ${divisions[key].name}`);
      } else {
        console.log(`  [dry run] would create division ${divisions[key].name}`);
      }
    }
    return { competitionId: competition.id, seasonId: season.id, divisions };
  });

  if (!setup || !setup.divisions.MALE.id || !setup.divisions.FEMALE.id) {
    console.log("  setup incomplete (dry run) - re-run with --apply");
    return;
  }

  const intake: { gender: "MALE" | "FEMALE"; bib: string; name: string; action: "created" | "updated" | "unchanged" }[] = [];
  for (const [gender, athletes] of [["MALE", MALE_ATHLETES], ["FEMALE", FEMALE_ATHLETES]] as const) {
    for (const athlete of athletes) {
      const division = setup.divisions[gender];
      const existing = await withOrganizationContext(ORG, (tx) =>
        tx.entrant.findFirst({
          where: { organizationId: ORG, competitionId: setup.competitionId, seasonId: setup.seasonId, divisionId: division.id, name: athlete.name },
          select: { id: true, seed: true },
        }),
      );
      if (!existing) {
        if (APPLY) {
          await withOrganizationContext(ORG, (tx) =>
            tx.entrant.create({
              data: {
                organizationId: ORG,
                competitionId: setup.competitionId,
                seasonId: setup.seasonId,
                divisionId: division.id,
                type: "INDIVIDUAL",
                name: athlete.name,
                seed: Number(athlete.bib),
                status: "ACTIVE",
              },
            }),
          );
        }
        intake.push({ gender, bib: athlete.bib, name: athlete.name, action: "created" });
      } else if (existing.seed !== Number(athlete.bib)) {
        if (APPLY) {
          await withOrganizationContext(ORG, (tx) => tx.entrant.update({ where: { id: existing.id }, data: { seed: Number(athlete.bib) } }));
        }
        intake.push({ gender, bib: athlete.bib, name: athlete.name, action: "updated" });
      } else {
        intake.push({ gender, bib: athlete.bib, name: athlete.name, action: "unchanged" });
      }
    }
  }

  const counts = intake.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.action]: (acc[row.action] ?? 0) + 1 }), {});
  console.log(`  intake: ${intake.length} athletes · created ${counts.created ?? 0} · updated ${counts.updated ?? 0} · unchanged ${counts.unchanged ?? 0}`);
  for (const row of intake.filter((entry) => entry.action !== "unchanged")) {
    console.log(`    ${row.action.padEnd(8)} ${row.gender.padEnd(6)} #${row.bib} ${row.name}`);
  }

  // RESULTS: keep the placements the organiser published, add the bibs we can substantiate, and say
  // plainly that times were not captured rather than leaving a reader to wonder.
  const current = parseEventResults(event.results);
  if (!current) {
    console.log("  no published results to enrich");
    return;
  }
  const enriched: EventResults = {
    publishedAt: current.publishedAt,
    categories: current.categories.map((category) => {
      const isFlagRace = (category.sport ?? "").toUpperCase() === "FLAG_RACE" || category.key?.includes("FLAG_RACE");
      if (!isFlagRace) return category;
      return {
        ...category,
        gender: category.key?.startsWith("MALE") ? "MALE" : category.key?.startsWith("FEMALE") ? "FEMALE" : category.gender,
        note: category.placements.length <= 2 ? "Only two athletes finished this race." : "Finish times were not captured at the venue; positions are as officially confirmed.",
        placements: category.placements.map((placement) => {
          const name = NAME_FIXES[placement.name] ?? placement.name;
          const bib = RESULT_BIBS[name];
          return {
            ...placement,
            name,
            ...(bib ? { bib } : {}),
            // A bib we cannot substantiate is left blank with a reason, never filled in from a guess.
            ...(!bib ? { note: "Bib not recorded at intake." } : {}),
          };
        }),
      };
    }),
  };

  const changed = JSON.stringify(current) !== JSON.stringify(enriched);
  console.log(`  results: ${changed ? (APPLY ? "enriched" : "[dry run] would enrich") : "already enriched"}`);

  if (APPLY && changed) {
    await withOrganizationContext(ORG, (tx) => tx.event.update({ where: { id: event.id }, data: { results: enriched } }));
    console.log("  results written");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
