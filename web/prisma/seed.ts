import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  AthleteGender,
  ContentType,
  EventStatus,
  PlayerStatus,
  ProductCategory,
  SeasonStatus,
  SeasonClubStatus,
  StaffRole,
  UserRole,
} from "../src/generated/prisma/enums";
import { upsertRoleAssignment } from "../src/lib/user-roles";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const seedMode = process.env.SEED_MODE ?? process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] ?? "demo";

if (seedMode === "demo" && process.env.NODE_ENV === "production") {
  throw new Error("Demo seed is blocked when NODE_ENV=production.");
}

const clubs = [
  ["Vortex", "VTX", "#16F2B3", "#071713"],
  ["Apex", "APX", "#9B5CFF", "#160C24"],
  ["Flux", "FLX", "#36A3FF", "#071524"],
  ["Surge", "SRG", "#FF4D8D", "#240812"],
  ["Nova", "NVA", "#FFB84D", "#231506"],
  ["Halo", "HLO", "#F6F76C", "#1E1F08"],
  ["Ember", "EMB", "#FF6534", "#251008"],
  ["Eclipse", "ECL", "#B5C4D8", "#10151C"],
] as const;

const athleteNames = [
  ["Tobi", "Adebayo"],
  ["Chidi", "Okafor"],
  ["Femi", "Lawal"],
  ["Seyi", "Balogun"],
  ["Damilola", "Adeyemi"],
  ["Ikenna", "Eze"],
  ["Kunle", "Ogunleye"],
  ["David", "Essien"],
] as const;

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@neonultra.ng";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-me-before-use";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Ultra League Admin",
      passwordHash: await hash(adminPassword, 12),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name: "Ultra League Admin",
      email: adminEmail,
      passwordHash: await hash(adminPassword, 12),
      role: UserRole.SUPER_ADMIN,
    },
  });
  await Promise.all(
    [UserRole.SUPER_ADMIN, UserRole.FAN].map((role) => upsertRoleAssignment(prisma, { userId: admin.id, role })),
  );

  const organization = await prisma.organization.upsert({
    where: { slug: "neon-ultra" },
    update: {},
    create: { name: "Neon Ultra Basketball League", slug: "neon-ultra" },
  });

  const sport = await prisma.sport.upsert({
    where: { slug: "basketball" },
    update: { name: "Basketball", isActive: true },
    create: { name: "Basketball", slug: "basketball" },
  });

  const competition = await prisma.competition.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "ultra-basketball",
      },
    },
    update: { name: "Ultra Basketball", isActive: true },
    create: {
      organizationId: organization.id,
      sportId: sport.id,
      name: "Ultra Basketball",
      slug: "ultra-basketball",
      description: "Ultra Basketball's flagship league competition.",
    },
  });

  const contentTemplates = [
    {
      id: "seed-template-draft-v1",
      type: ContentType.DRAFT_ANNOUNCEMENT,
      name: "Draft Pick Announcement v1",
      textTemplate:
        "WITH THE {{pickOrdinal}} PICK IN THE ULTRA BASKETBALL {{season}} DRAFT,\n\n{{club}} SELECTS\n\n{{player}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">{{season}} DRAFT | PICK #{{pick}}</p><h1>WITH THE {{pickOrdinal}} PICK</h1><h2>{{club}} SELECTS</h2><p style=\"font-size:42px;font-weight:800\">{{player}}</p></main>",
    },
    {
      id: "seed-template-fixture-v1",
      type: ContentType.FIXTURE_ANNOUNCEMENT,
      name: "Fixture Release v1",
      textTemplate:
        "FIXTURE RELEASE\n\n{{home}} VS {{away}}\n{{date}} | {{time}}\n{{venue}}\n\n{{season}} | {{division}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">FIXTURE RELEASE</p><h1>{{home}} VS {{away}}</h1><p>{{date}} | {{time}}</p><p>{{venue}}</p></main>",
    },
    {
      id: "seed-template-result-v1",
      type: ContentType.RESULT_ANNOUNCEMENT,
      name: "Final Result v1",
      textTemplate:
        "FINAL\n\n{{winner}} {{winnerScore}}\n{{loser}} {{loserScore}}\n\nPLAYER OF THE GAME\n{{mvp}} | {{mvpLine}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">FINAL</p><h1>{{winner}} {{winnerScore}}-{{loserScore}} {{loser}}</h1><h2>Player of the Game</h2><p>{{mvp}} | {{mvpLine}}</p></main>",
    },
    {
      id: "seed-template-mvp-v1",
      type: ContentType.MVP_ANNOUNCEMENT,
      name: "MVP Announcement v1",
      textTemplate:
        "PLAYER OF THE GAME\n\n{{mvp}}\n{{mvpLine}}\n\n{{winner}} {{winnerScore}}-{{loserScore}} {{loser}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">PLAYER OF THE GAME</p><h1>{{mvp}}</h1><p style=\"font-size:24px\">{{mvpLine}}</p><p>{{winner}} {{winnerScore}}-{{loserScore}} {{loser}}</p></main>",
    },
    {
      id: "seed-template-standings-v1",
      type: ContentType.STANDINGS_UPDATE,
      name: "Standings Update v1",
      textTemplate:
        "STANDINGS UPDATE\n\n{{leader}} LEADS THE TABLE\nWITH A {{record}} RECORD\n\n{{table}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">STANDINGS UPDATE | {{season}}</p><h1>{{leader}} LEADS THE TABLE</h1><h2>{{record}} RECORD</h2><pre style=\"color:#d4d4d8\">{{table}}</pre></main>",
    },
    {
      id: "seed-template-sponsor-v1",
      type: ContentType.SPONSOR_REPORT,
      name: "Sponsor Performance v1",
      textTemplate:
        "SPONSOR PERFORMANCE REPORT\n\n{{sponsor}} | {{campaign}}\n{{event}}\n\nImpressions: {{impressions}}\nRedemptions: {{redemptions}}\nUnits sold: {{unitsSold}}\nAttributed revenue: {{revenue}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">SPONSOR PERFORMANCE</p><h1>{{sponsor}}</h1><h2>{{campaign}}</h2><p>{{impressions}} impressions | {{redemptions}} redemptions | {{unitsSold}} units</p><p>{{revenue}} attributed revenue</p></main>",
    },
    {
      id: "seed-template-fan-club-v1",
      type: ContentType.FAN_CLUB_REPORT,
      name: "Fan Club Report v1",
      textTemplate:
        "FAN CLUB REPORT\n\n{{fanClub}} | {{club}}\n\nMembers: {{members}}\nReservations: {{reservations}}\nAdmissions: {{admissions}}\nPaid orders: {{orders}}\nOrder value: {{revenue}}",
      htmlTemplate:
        "<main style=\"font-family:Arial;background:#050807;color:white;padding:48px\"><p style=\"color:#16f2b3\">FAN CLUB REPORT</p><h1>{{fanClub}}</h1><h2>{{club}}</h2><p>{{members}} members | {{admissions}} admissions | {{orders}} paid orders</p><p>{{revenue}} order value</p></main>",
    },
  ] as const;
  await Promise.all(
    contentTemplates.map((template) =>
      prisma.contentTemplate.upsert({
        where: { id: template.id },
        update: {
          name: template.name,
          textTemplate: template.textTemplate,
          htmlTemplate: template.htmlTemplate,
          isActive: true,
        },
        create: {
          ...template,
          competitionId: competition.id,
        },
      }),
    ),
  );

  const mensDivision = await prisma.division.upsert({
    where: {
      competitionId_slug: {
        competitionId: competition.id,
        slug: "men",
      },
    },
    update: { name: "Men's Division", isActive: true },
    create: {
      competitionId: competition.id,
      name: "Men's Division",
      slug: "men",
    },
  });

  await prisma.division.upsert({
    where: {
      competitionId_slug: {
        competitionId: competition.id,
        slug: "women",
      },
    },
    update: { name: "Women's Division", isActive: true },
    create: {
      competitionId: competition.id,
      name: "Women's Division",
      slug: "women",
    },
  });

  const season = await prisma.season.upsert({
    where: {
      competitionId_name: {
        competitionId: competition.id,
        name: "Season Zero 2026",
      },
    },
    update: {
      startDate: new Date("2026-08-15T00:00:00+01:00"),
      endDate: new Date("2026-12-20T21:00:00+01:00"),
      status: SeasonStatus.ACTIVE,
    },
    create: {
      competitionId: competition.id,
      name: "Season Zero 2026",
      startDate: new Date("2026-08-15T00:00:00+01:00"),
      endDate: new Date("2026-12-20T21:00:00+01:00"),
      status: SeasonStatus.ACTIVE,
    },
  });

  const settings = [
    ["season-zero.launchDate", "2026-08-15", "Season Zero launch date."],
    ["season-zero.timezone", "Africa/Lagos", "Operational timezone for events and schedules."],
    ["season-zero.currency", "NGN", "Operational currency."],
    ["season-zero.minRosterSize", 10, "Minimum players required before a SeasonClub is roster-ready."],
    ["season-zero.maxRosterSize", 14, "Maximum players allowed per SeasonClub roster."],
    ["season-zero.clubsPerDivision", 4, "Required active SeasonClubs per division."],
    ["season-zero.squadsPerDivision", 4, "Required Draft Day squads per division."],
    ["season-zero.playersPerSquad", 12, "Target players per Draft Day squad."],
    ["MEN_MAIN_DRAFT_TARGET_SIZE", 7, "Target number of players for each men's Main Draft squad."],
    ["WOMEN_MAIN_DRAFT_TARGET_SIZE", 5, "Target number of players for each women's Main Draft squad."],
    ["DRAFT_SQUAD_MINIMUM_ALLOWED", 1, "Minimum non-empty draft squad size allowed before Draft Day."],
    ["season-zero.requiredHeadCoaches", 1, "Required head coaches per SeasonClub."],
    ["season-zero.optionalAssistantCoaches", 1, "Target assistant coaches per SeasonClub."],
    ["season-zero.winLeaguePoints", 3, "Default league points for a win."],
    ["season-zero.lossLeaguePoints", 0, "Default league points for a loss."],
    ["season-zero.reservationHoldMinutes", 15, "Reservation hold duration before payment confirmation."],
    [
      "season-zero.qrCheckInRules",
      { duplicateScan: "block", allowManualEntry: true, requireOperatorRole: true },
      "QR check-in operating rules.",
    ],
    [
      "season-zero.contentPublishingDefaults",
      { previewWatermark: "PREVIEW - NOT FOR PUBLICATION", requireApproval: true, publicByDefault: false },
      "Default controls for generated launch content.",
    ],
  ] as const;

  await Promise.all(
    settings.map(([key, value, description]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: {
          competitionId: competition.id,
          seasonId: season.id,
          value,
          description,
          category: "season-zero",
        },
        create: {
          key,
          value,
          description,
          category: "season-zero",
          competitionId: competition.id,
          seasonId: season.id,
        },
      }),
    ),
  );

  if (seedMode === "system") {
    console.log("Seeded system records only. Demo clubs, players, events, fixtures, reservations, orders, vendors, sponsors, and draft allocations were skipped.");
    return;
  }

  const seededSeasonClubs = [];
  const seededPlayers = [];

  for (const [index, [name, shortName, primaryColor, secondaryColor]] of clubs.entries()) {
    const club = await prisma.club.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name,
        },
      },
      update: {
        shortName,
        primaryColor,
        secondaryColor,
      },
      create: {
        organizationId: organization.id,
        sportId: sport.id,
        name,
        shortName,
        primaryColor,
        secondaryColor,
      },
    });

    const coach = await prisma.staff.upsert({
      where: { id: `seed-coach-${shortName.toLowerCase()}` },
      update: { name: `Coach ${name}`, role: StaffRole.HEAD_COACH },
      create: {
        id: `seed-coach-${shortName.toLowerCase()}`,
        name: `Coach ${name}`,
        role: StaffRole.HEAD_COACH,
      },
    });

    const seasonClub = await prisma.seasonClub.upsert({
      where: {
        seasonId_clubId_divisionId: {
          seasonId: season.id,
          clubId: club.id,
          divisionId: mensDivision.id,
        },
      },
      update: {
        headCoachId: coach.id,
        status: SeasonClubStatus.ACTIVE,
      },
      create: {
        seasonId: season.id,
        clubId: club.id,
        divisionId: mensDivision.id,
        headCoachId: coach.id,
      },
    });

    seededSeasonClubs.push(seasonClub);

    await prisma.standing.upsert({
      where: { seasonClubId: seasonClub.id },
      update: {},
      create: { seasonId: season.id, seasonClubId: seasonClub.id },
    });

    await prisma.fanClub.upsert({
      where: { clubId: club.id },
      update: { captainName: `${name} Fan Captain` },
      create: {
        clubId: club.id,
        name: `${name} Nation`,
        captainName: `${name} Fan Captain`,
        description: `Official supporters club for ${name}.`,
      },
    });

    const [firstName, lastName] = athleteNames[index];
    const email = `${firstName}.${lastName}@athletes.neonultra.ng`.toLowerCase();
    const athlete = await prisma.athlete.upsert({
      where: { organizationId_email: { organizationId: organization.id, email } },
      update: {
        firstName,
        lastName,
        photoUrl: null,
      },
      create: {
        organizationId: organization.id,
        firstName,
        lastName,
        gender: AthleteGender.MALE,
        dateOfBirth: new Date(`200${index % 5}-0${(index % 8) + 1}-15T00:00:00Z`),
        dominantHand: index % 3 === 0 ? "LEFT" : "RIGHT",
        email,
        previousTeam: "Open Combine",
        nationality: "Nigerian",
      },
    });

    const player = await prisma.player.upsert({
      where: {
        athleteId_seasonId: {
          athleteId: athlete.id,
          seasonId: season.id,
        },
      },
      update: {
        seasonClubId: seasonClub.id,
        status: PlayerStatus.DRAFTED,
        position: ["PG", "SG", "SF", "PF", "C"][index % 5],
        heightCm: 184 + index * 2,
        weightKg: 76 + index * 2,
      },
      create: {
        athleteId: athlete.id,
        seasonId: season.id,
        seasonClubId: seasonClub.id,
        status: PlayerStatus.DRAFTED,
        position: ["PG", "SG", "SF", "PF", "C"][index % 5],
        heightCm: 184 + index * 2,
        weightKg: 76 + index * 2,
        jerseyNumber: index + 1,
      },
    });
    seededPlayers.push(player);
  }

  const venue = await prisma.venue.upsert({
    where: { organizationId_name_city: { organizationId: organization.id, name: "Ultra Arena", city: "Lagos" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Ultra Arena",
      address: "Lagos, Nigeria",
      city: "Lagos",
      capacity: 2500,
      contactPerson: "League Operations",
    },
  });

  const sections = await Promise.all(
    [
      ["seed-section-vip", "VIP Courtside", "VIP", 20],
      ["seed-section-premium", "Premium", "PREM", 80],
      ["seed-section-general", "General Admission", "GA", 200],
    ].map(([id, name, code, capacity]) =>
      prisma.venueSection.upsert({
        where: { id: String(id) },
        update: {
          name: String(name),
          code: String(code),
          capacity: Number(capacity),
          isActive: true,
        },
        create: {
          id: String(id),
          venueId: venue.id,
          name: String(name),
          code: String(code),
          capacity: Number(capacity),
        },
      }),
    ),
  );

  const launchEvent = await prisma.event.upsert({
    where: { id: "seed-event-season-zero-launch" },
    update: {
      name: "Season Zero Opening Night",
      venueId: venue.id,
      seasonId: season.id,
      status: EventStatus.PUBLISHED,
    },
    create: {
      id: "seed-event-season-zero-launch",
      name: "Season Zero Opening Night",
      date: new Date("2026-08-15T00:00:00+01:00"),
      venueId: venue.id,
      seasonId: season.id,
      doorsOpenTime: new Date("2026-08-15T13:00:00+01:00"),
      startTime: new Date("2026-08-15T15:00:00+01:00"),
      endTime: new Date("2026-08-15T21:00:00+01:00"),
      status: EventStatus.PUBLISHED,
    },
  });

  const vortexFanClub = await prisma.fanClub.findFirstOrThrow({
    where: { clubId: seededSeasonClubs[0].clubId },
  });
  await Promise.all([
    prisma.seatZone.upsert({
      where: {
        eventId_name: { eventId: launchEvent.id, name: "VIP Courtside" },
      },
      update: { capacity: 20, priceKobo: 2500000, isActive: true },
      create: {
        eventId: launchEvent.id,
        venueSectionId: sections[0].id,
        name: "VIP Courtside",
        capacity: 20,
        priceKobo: 2500000,
      },
    }),
    prisma.seatZone.upsert({
      where: {
        eventId_name: { eventId: launchEvent.id, name: "Premium" },
      },
      update: { capacity: 80, priceKobo: 1000000, isActive: true },
      create: {
        eventId: launchEvent.id,
        venueSectionId: sections[1].id,
        name: "Premium",
        capacity: 80,
        priceKobo: 1000000,
      },
    }),
    prisma.seatZone.upsert({
      where: {
        eventId_name: { eventId: launchEvent.id, name: "General Admission" },
      },
      update: {
        capacity: 200,
        priceKobo: 300000,
        fanClubId: vortexFanClub.id,
        fanClubDiscountBps: 1000,
        isActive: true,
      },
      create: {
        eventId: launchEvent.id,
        venueSectionId: sections[2].id,
        name: "General Admission",
        capacity: 200,
        priceKobo: 300000,
        fanClubId: vortexFanClub.id,
        fanClubDiscountBps: 1000,
        fanClubEarlyAccessAt: new Date("2026-07-15T09:00:00+01:00"),
      },
    }),
  ]);

  const concessions = await prisma.vendor.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Ultra Concessions" } },
    update: { isActive: true },
    create: {
      organizationId: organization.id,
      name: "Ultra Concessions",
      contactName: "Matchday Concessions Lead",
    },
  });
  const seededProducts = await Promise.all(
    [
      ["Water", ProductCategory.WATER, 50000],
      ["Soft Drink", ProductCategory.SOFT_DRINK, 80000],
      ["Popcorn", ProductCategory.POPCORN, 120000],
      ["Hotdog", ProductCategory.HOTDOG, 180000],
      ["Ultra Vortex Jersey", ProductCategory.MERCHANDISE, 1500000],
    ].map(([name, category, priceKobo]) =>
      prisma.vendorProduct.upsert({
        where: {
          vendorId_name: {
            vendorId: concessions.id,
            name: String(name),
          },
        },
        update: {
          category: category as ProductCategory,
          priceKobo: Number(priceKobo),
          isActive: true,
        },
        create: {
          vendorId: concessions.id,
          name: String(name),
          category: category as ProductCategory,
          priceKobo: Number(priceKobo),
          fanClubDiscountBps:
            category === ProductCategory.MERCHANDISE ? 1000 : 0,
        },
      }),
    ),
  );
  await Promise.all(
    seededProducts.map((product, index) =>
      prisma.vendorInventory.upsert({
        where: {
          eventId_productId: {
            eventId: launchEvent.id,
            productId: product.id,
          },
        },
        update: { stock: [300, 250, 150, 120, 40][index] },
        create: {
          eventId: launchEvent.id,
          productId: product.id,
          stock: [300, 250, 150, 120, 40][index],
        },
      }),
    ),
  );
  const campaign = await prisma.sponsorCampaign.upsert({
    where: { id: "seed-campaign-refresh-season-zero" },
    update: {
      sponsorName: "Refresh Beverages",
      eventId: launchEvent.id,
      productId: seededProducts[1].id,
      isActive: true,
    },
    create: {
      id: "seed-campaign-refresh-season-zero",
      name: "Opening Night Refresh",
      sponsorName: "Refresh Beverages",
      eventId: launchEvent.id,
      productId: seededProducts[1].id,
    },
  });
  await prisma.promoCode.upsert({
    where: { code: "REFRESH10" },
    update: {
      eventId: launchEvent.id,
      sponsorCampaignId: campaign.id,
      discountBps: 1000,
      maxRedemptions: 100,
      isActive: true,
    },
    create: {
      code: "REFRESH10",
      description: "Opening night sponsor offer",
      eventId: launchEvent.id,
      sponsorCampaignId: campaign.id,
      discountBps: 1000,
      maxRedemptions: 100,
    },
  });

  const fixtureCount = await prisma.fixture.count({ where: { seasonId: season.id } });
  if (fixtureCount === 0) {
    await prisma.fixture.createMany({
      data: [
        {
          seasonId: season.id,
          divisionId: mensDivision.id,
          homeSeasonClubId: seededSeasonClubs[0].id,
          awaySeasonClubId: seededSeasonClubs[1].id,
          scheduledAt: new Date("2026-08-15T15:00:00+01:00"),
          venueId: venue.id,
          eventId: launchEvent.id,
        },
        {
          seasonId: season.id,
          divisionId: mensDivision.id,
          homeSeasonClubId: seededSeasonClubs[2].id,
          awaySeasonClubId: seededSeasonClubs[3].id,
          scheduledAt: new Date("2026-08-15T18:00:00+01:00"),
          venueId: venue.id,
          eventId: launchEvent.id,
        },
      ],
    });
  }
  await prisma.fixture.updateMany({
    where: {
      seasonId: season.id,
      eventId: null,
      scheduledAt: {
        gte: new Date("2026-08-15T00:00:00+01:00"),
        lt: new Date("2026-08-16T00:00:00+01:00"),
      },
    },
    data: { eventId: launchEvent.id },
  });

  const draft = await prisma.draft.upsert({
    where: {
      seasonId_divisionId_name: {
        seasonId: season.id,
        divisionId: mensDivision.id,
        name: "Season Zero Draft",
      },
    },
    update: {
      status: "COMPLETED",
      currentRound: 1,
      nextPickNumber: 2,
    },
    create: {
      name: "Season Zero Draft",
      seasonId: season.id,
      divisionId: mensDivision.id,
      status: "COMPLETED",
      currentRound: 1,
      nextPickNumber: 2,
      startedAt: new Date("2026-07-15T18:00:00+01:00"),
      completedAt: new Date("2026-07-15T20:00:00+01:00"),
    },
  });
  await prisma.draftPick.upsert({
    where: {
      draftId_playerId: {
        draftId: draft.id,
        playerId: seededPlayers[0].id,
      },
    },
    update: {
      round: 1,
      pickNumber: 1,
      seasonClubId: seededSeasonClubs[0].id,
    },
    create: {
      confirmedAt: new Date("2026-07-15T18:05:00+01:00"),
      createdById: admin.id,
      draftId: draft.id,
      round: 1,
      pickNumber: 1,
      seasonClubId: seededSeasonClubs[0].id,
      playerId: seededPlayers[0].id,
      pickedAt: new Date("2026-07-15T18:05:00+01:00"),
      status: "CONFIRMED",
    },
  });

  const completedFixture = await prisma.fixture.upsert({
    where: { id: "seed-fixture-content-showcase" },
    update: {
      status: "FINAL",
      homeScore: 78,
      awayScore: 71,
      winnerSeasonClubId: seededSeasonClubs[0].id,
    },
    create: {
      id: "seed-fixture-content-showcase",
      seasonId: season.id,
      divisionId: mensDivision.id,
      homeSeasonClubId: seededSeasonClubs[0].id,
      awaySeasonClubId: seededSeasonClubs[2].id,
      scheduledAt: new Date("2026-08-01T18:00:00+01:00"),
      venueId: venue.id,
      status: "FINAL",
      homeScore: 78,
      awayScore: 71,
      winnerSeasonClubId: seededSeasonClubs[0].id,
    },
  });
  const showcaseGame = await prisma.game.upsert({
    where: { fixtureId: completedFixture.id },
    update: {
      status: "FINAL",
      currentPeriod: 4,
      clockSecondsRemaining: 0,
      endedAt: new Date("2026-08-01T20:00:00+01:00"),
    },
    create: {
      fixtureId: completedFixture.id,
      status: "FINAL",
      currentPeriod: 4,
      clockSecondsRemaining: 0,
      startedAt: new Date("2026-08-01T18:00:00+01:00"),
      endedAt: new Date("2026-08-01T20:00:00+01:00"),
    },
  });
  await prisma.playerStat.upsert({
    where: {
      gameId_playerId: {
        gameId: showcaseGame.id,
        playerId: seededPlayers[0].id,
      },
    },
    update: { points: 24, rebounds: 7, assists: 6 },
    create: {
      gameId: showcaseGame.id,
      playerId: seededPlayers[0].id,
      seasonClubId: seededSeasonClubs[0].id,
      points: 24,
      rebounds: 7,
      assists: 6,
    },
  });

  await prisma.standing.update({
    where: { seasonClubId: seededSeasonClubs[0].id },
    data: {
      played: 1,
      won: 1,
      lost: 0,
      pointsFor: 78,
      pointsAgainst: 71,
      pointDifference: 7,
      leaguePoints: 3,
    },
  });
  await prisma.standing.update({
    where: { seasonClubId: seededSeasonClubs[2].id },
    data: {
      played: 1,
      won: 0,
      lost: 1,
      pointsFor: 71,
      pointsAgainst: 78,
      pointDifference: -7,
      leaguePoints: 0,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
