import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  AthleteGender,
  PlayerStatus,
  SeasonStatus,
  SeasonClubStatus,
  StaffRole,
  UserRole,
} from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

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

  await prisma.user.upsert({
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

  const sport = await prisma.sport.upsert({
    where: { slug: "basketball" },
    update: { name: "Basketball", isActive: true },
    create: { name: "Basketball", slug: "basketball" },
  });

  const competition = await prisma.competition.upsert({
    where: {
      sportId_slug: {
        sportId: sport.id,
        slug: "ultra-basketball",
      },
    },
    update: { name: "Ultra Basketball", isActive: true },
    create: {
      sportId: sport.id,
      name: "Ultra Basketball",
      slug: "ultra-basketball",
      description: "Ultra Basketball's flagship league competition.",
    },
  });

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
      startDate: new Date("2026-08-15T09:00:00+01:00"),
      endDate: new Date("2026-12-20T21:00:00+01:00"),
      status: SeasonStatus.ACTIVE,
    },
    create: {
      competitionId: competition.id,
      name: "Season Zero 2026",
      startDate: new Date("2026-08-15T09:00:00+01:00"),
      endDate: new Date("2026-12-20T21:00:00+01:00"),
      status: SeasonStatus.ACTIVE,
    },
  });

  const seededSeasonClubs = [];

  for (const [index, [name, shortName, primaryColor, secondaryColor]] of clubs.entries()) {
    const club = await prisma.club.upsert({
      where: {
        sportId_name: {
          sportId: sport.id,
          name,
        },
      },
      update: {
        shortName,
        primaryColor,
        secondaryColor,
      },
      create: {
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
      where: { email },
      update: {
        firstName,
        lastName,
        photoUrl: null,
      },
      create: {
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

    await prisma.player.upsert({
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
  }

  const venue = await prisma.venue.upsert({
    where: { name_city: { name: "Ultra Arena", city: "Lagos" } },
    update: {},
    create: {
      name: "Ultra Arena",
      address: "Lagos, Nigeria",
      city: "Lagos",
      capacity: 2500,
      contactPerson: "League Operations",
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
        },
        {
          seasonId: season.id,
          divisionId: mensDivision.id,
          homeSeasonClubId: seededSeasonClubs[2].id,
          awaySeasonClubId: seededSeasonClubs[3].id,
          scheduledAt: new Date("2026-08-15T18:00:00+01:00"),
          venueId: venue.id,
        },
      ],
    });
  }
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
