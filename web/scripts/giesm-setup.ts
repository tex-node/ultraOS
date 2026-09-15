// GIESM 2026 setup: create the volleyball + flag race competition, its event, and a public
// registration form so onboarding can resume at /giesm (and /register/neon-ultra/giesm).
//
// Idempotent: finds-or-creates by natural keys and never duplicates. Dry-run by default; pass
// --apply to write. Runs against the database in DATABASE_URL (staging or production) inside tenant
// context. Never invents a venue if one already exists - it reuses the organization's first venue
// unless --venue-name is given.
//
// Usage:
//   tsx scripts/giesm-setup.ts
//   tsx scripts/giesm-setup.ts --apply
//   tsx scripts/giesm-setup.ts --apply --date 2026-08-15 --venue-name "Main Court" --venue-city Lagos
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { writeAuditLog } from "../src/lib/audit";
import { buildAllFemaleTeamCompetitionConfig, parseSportConfigForm } from "../src/lib/registration/sport-config-admin";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "../src/lib/tenant-context";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ORG_SLUG = arg("organization-slug") ?? "neon-ultra";
const EVENT_SLUG = arg("event-slug") ?? "giesm";
const EVENT_NAME = arg("name") ?? "GIESM 2026 Volleyball Championship";
const COMPETITION_SLUG = arg("competition-slug") ?? "giesm-2026";
const SEASON_NAME = arg("season") ?? "2026";
const EVENT_DATE = arg("date") ?? "2026-08-01";
const START_TIME = arg("start-time") ?? `${EVENT_DATE}T09:00:00.000Z`;
const SEASON_END = arg("season-end") ?? "2026-12-31";
const VENUE_NAME = arg("venue-name");
const VENUE_CITY = arg("venue-city") ?? "TBD";

async function main() {
  const apply = flag("apply");
  const organization = await resolveActiveOrganizationBySlug(ORG_SLUG);
  const config = parseSportConfigForm(buildAllFemaleTeamCompetitionConfig());

  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} org=${ORG_SLUG} event=${EVENT_SLUG}`);
  console.log(`  name="${EVENT_NAME}" sports=${config.sports.join(",")} date=${EVENT_DATE}`);

  const summary = await withOrganizationContext(organization.id, async (tx) => {
    const sport = apply
      ? await tx.sport.upsert({
          where: { slug: "volleyball" },
          update: { name: "Volleyball", isActive: true },
          create: { name: "Volleyball", slug: "volleyball" },
        })
      : await tx.sport.findUnique({ where: { slug: "volleyball" }, select: { id: true } });

    let venue = VENUE_NAME
      ? await tx.venue.findFirst({ where: { organizationId: organization.id, name: VENUE_NAME } })
      : await tx.venue.findFirst({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" } });
    let venueCreated = false;
    if (!venue && apply) {
      venue = await tx.venue.create({
        data: {
          organizationId: organization.id,
          name: VENUE_NAME ?? "GIESM Main Venue",
          city: VENUE_CITY,
          address: arg("venue-address") ?? "TBD",
          capacity: Number(arg("venue-capacity") ?? 500),
        },
      });
      venueCreated = true;
    }

    let competition = await tx.competition.findFirst({
      where: { organizationId: organization.id, slug: COMPETITION_SLUG },
      select: { id: true },
    });
    if (!competition && apply && sport) {
      competition = await tx.competition.create({
        data: {
          organizationId: organization.id,
          sportId: sport.id,
          name: EVENT_NAME,
          slug: COMPETITION_SLUG,
          description: "GIESM 2026 Volleyball Championship (Volleyball + Flag Race).",
        },
        select: { id: true },
      });
    }

    let season = competition
      ? await tx.season.findFirst({ where: { competitionId: competition.id, name: SEASON_NAME }, select: { id: true } })
      : null;
    if (!season && apply && competition) {
      season = await tx.season.create({
        data: {
          organizationId: organization.id,
          competitionId: competition.id,
          name: SEASON_NAME,
          startDate: new Date(`${EVENT_DATE}T00:00:00.000Z`),
          endDate: new Date(`${SEASON_END}T23:59:59.000Z`),
        },
        select: { id: true },
      });
    }

    if (apply && competition) {
      const division = await tx.division.findFirst({ where: { competitionId: competition.id, slug: "all-female" }, select: { id: true } });
      if (!division) {
        await tx.division.create({
          data: { organizationId: organization.id, competitionId: competition.id, name: "All-female", slug: "all-female" },
        });
      }
    }

    let event = await tx.event.findFirst({ where: { organizationId: organization.id, slug: EVENT_SLUG }, select: { id: true } });
    if (apply) {
      if (!event && venue && season) {
        event = await tx.event.create({
          data: {
            organizationId: organization.id,
            name: EVENT_NAME,
            slug: EVENT_SLUG,
            date: new Date(`${EVENT_DATE}T00:00:00.000Z`),
            venueId: venue.id,
            seasonId: season.id,
            startTime: new Date(START_TIME),
            status: "PUBLISHED",
          },
          select: { id: true },
        });
      } else if (event) {
        event = await tx.event.update({
          where: { id: event.id },
          data: {
            name: EVENT_NAME,
            status: "PUBLISHED",
            ...(venue ? { venueId: venue.id } : {}),
            ...(season ? { seasonId: season.id } : {}),
          },
          select: { id: true },
        });
      }
    }

    let form = event
      ? await tx.registrationForm.findFirst({ where: { organizationId: organization.id, eventId: event.id }, select: { id: true } })
      : null;
    if (apply && event) {
      const data = {
        title: `${EVENT_NAME} — Team Registration`,
        description: arg("description") ?? "Register a team for the GIESM 2026 Volleyball Championship (volleyball and flag race).",
        status: "OPEN" as const,
        publicEnabled: true,
        requiresConsent: true,
        sports: config.sports,
        sportConfig: config as unknown as Prisma.InputJsonValue,
      };
      form = form
        ? await tx.registrationForm.update({ where: { id: form.id }, data, select: { id: true } })
        : await tx.registrationForm.create({
            data: { organizationId: organization.id, eventId: event.id, mode: "TEAM", ...data },
            select: { id: true },
          });
    }

    if (apply && event) {
      const admin = await tx.userRoleAssignment.findFirst({
        where: { organizationId: organization.id, role: "SUPER_ADMIN", revokedAt: null },
        select: { userId: true },
      });
      await writeAuditLog(tx, {
        organizationId: organization.id,
        userId: admin?.userId ?? "system",
        action: "GIESM_SETUP_APPLIED",
        entityType: "Event",
        entityId: event.id,
        details: { eventSlug: EVENT_SLUG, formId: form?.id ?? null, sports: config.sports },
      });
    }

    return {
      sportId: sport?.id ?? null,
      venueId: venue?.id ?? null,
      venueCreated,
      competitionId: competition?.id ?? null,
      seasonId: season?.id ?? null,
      eventId: event?.id ?? null,
      formId: form?.id ?? null,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("dry-run: nothing written. Re-run with --apply to create/update.");
    console.log("after --apply, the public page is /giesm (org " + ORG_SLUG + ", event " + EVENT_SLUG + ").");
  } else {
    console.log("applied. public registration: /giesm  (canonical: /register/" + ORG_SLUG + "/" + EVENT_SLUG + ")");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
