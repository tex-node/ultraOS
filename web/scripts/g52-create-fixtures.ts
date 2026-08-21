import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";
const VENUE_ID = "cmqfqpnsb001ilgkkwq13sr5s";
const EVENT_ID = "seed-event-season-zero-launch";

const CLUBS = {
  Apex: "cmqfqpnod000dlgkku9sqb9nm",
  Flux: "cmqfqpnoz000jlgkkv1i612md",
  Surge: "cmqfqpnpm000plgkk6fofe078",
  Vortex: "cmqfqpnm20007lgkk0nfwj431",
  Eclipse: "cmqfqpnrt001dlgkkskzah895",
  Ember: "cmqfqpnrb0017lgkkm9i40f6u",
  Halo: "cmqfqpnqs0011lgkkg2pvftnj",
  Nova: "cmqfqpnq6000vlgkk3tyi7n08",
};

// 11:30am start, 35-minute slots (20 game + 5 break + 10 transition), alternating F/M.
const schedule = [
  { time: "11:30", division: WOMEN_DIVISION_ID, home: "Eclipse", away: "Ember" },
  { time: "12:05", division: MEN_DIVISION_ID, home: "Apex", away: "Flux" },
  { time: "12:40", division: WOMEN_DIVISION_ID, home: "Eclipse", away: "Halo" },
  { time: "13:15", division: MEN_DIVISION_ID, home: "Apex", away: "Surge" },
  { time: "13:50", division: WOMEN_DIVISION_ID, home: "Eclipse", away: "Nova" },
  { time: "14:25", division: MEN_DIVISION_ID, home: "Apex", away: "Vortex" },
  { time: "15:00", division: WOMEN_DIVISION_ID, home: "Ember", away: "Halo" },
  { time: "15:35", division: MEN_DIVISION_ID, home: "Flux", away: "Surge" },
  { time: "16:10", division: WOMEN_DIVISION_ID, home: "Ember", away: "Nova" },
  { time: "16:45", division: MEN_DIVISION_ID, home: "Flux", away: "Vortex" },
  { time: "17:20", division: WOMEN_DIVISION_ID, home: "Halo", away: "Nova" },
  { time: "17:55", division: MEN_DIVISION_ID, home: "Surge", away: "Vortex" },
];

async function main() {
  for (const game of schedule) {
    const scheduledAt = new Date(`2026-08-15T${game.time}:00+01:00`);
    const fixture = await prisma.$transaction(async (tx) => {
      const created = await tx.fixture.create({
        data: {
          awaySeasonClubId: CLUBS[game.away as keyof typeof CLUBS],
          divisionId: game.division,
          eventId: EVENT_ID,
          homeSeasonClubId: CLUBS[game.home as keyof typeof CLUBS],
          scheduledAt,
          seasonId: SEASON_ID,
          status: "SCHEDULED",
          venueId: VENUE_ID,
        },
      });
      await writeAuditLog(tx, {
        action: "FIXTURE_CREATED",
        details: { awaySeasonClubId: CLUBS[game.away as keyof typeof CLUBS], homeSeasonClubId: CLUBS[game.home as keyof typeof CLUBS], scheduledAt: scheduledAt.toISOString(), seasonId: SEASON_ID },
        entityId: created.id,
        entityType: "Fixture",
        userId: ACTOR_ID,
      });
      return created;
    });
    console.log(`${game.time} ${game.home} vs ${game.away} -> ${fixture.id}`);
  }

  const count = await prisma.fixture.count({ where: { seasonId: SEASON_ID } });
  console.log("\nTotal fixtures now:", count);
}

main().finally(() => prisma.$disconnect());
