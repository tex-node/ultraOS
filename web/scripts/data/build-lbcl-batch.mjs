// Builder for lbcl-2026-batch1.json: expands compact per-player tuples into the full
// IngestBoxScoreInput shape so every required field (reportedName, didNotPlay, advanced, etc.)
// is present without hand-repeating ~25 keys per player across ~200 player-game rows.
import { writeFileSync } from "node:fs";

const ZERO_ADVANCED = {
  pointsFromTurnovers: 0, pointsInPaint: 0, pointsInPaintMade: 0, pointsInPaintAttempted: 0,
  secondChancePoints: 0, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
  biggestLead: 0, biggestScoringRun: 0, pointsPerPossession: 0, leadChanges: 0, timesTied: 0,
  timeWithLeadSeconds: 0,
};
// Not transcribed from the source sheets (see session.md) - box score fundamentals (points,
// rebounds, assists, shooting splits, etc.) are the transcribed, authoritative data; these
// "advanced" panel fields are explicit 0 placeholders, not measured/fabricated values.

const TOURNAMENT = { name: "Lagos Basketball Community League", slug: "lbcl", sportSlug: "basketball", vanitySlug: "lbcl" };
const DIVISION = { name: "Open Division", slug: "open" };
const SEASON = { name: "2026 Season", startDate: "2026-09-18T00:00:00.000Z", endDate: "2026-09-26T00:00:00.000Z" };
// endDate extended 2026-09-26 for Games 11-15; ensureSeason() only finds-or-creates by name,
// so an existing Season row's dates never get updated by re-running the ingest script - see
// scripts/update-lbcl-season-end-date.ts, run once after the first ingestion that needed this.
const PLAYER_GENDER = "MALE";

const VENUE_TBC = { name: "Venue TBC (unspecified in source sheet)", address: "Lagos, Nigeria", city: "Lagos", capacity: 300 };
const VENUE_IKEJA = { name: "Ikeja Community Court", address: "Ikeja, Lagos", city: "Lagos", capacity: 300 };
const VENUE_CANTONMENT = { name: "Cantonment Court", address: "Cantonment, Lagos", city: "Lagos", capacity: 300 };

// player tuple: [fullName, jersey, min, pts, fgm, fga, 2pm, 2pa, 3pm, 3pa, ftm, fta, or, dr, as, to, st, bs, pf, fd, pm, ef]
// DNP tuple: [fullName, jersey, "DNP"]
function player(t) {
  const fullName = t[0];
  const jerseyNumber = t[1];
  if (t[2] === "DNP") {
    return {
      fullName, reportedName: fullName, jerseyNumber, didNotPlay: true,
      minutesPlayed: 0, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
      twoPointsMade: 0, twoPointsAttempted: 0, threePointsMade: 0, threePointsAttempted: 0,
      freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0,
      assists: 0, turnovers: 0, steals: 0, blocks: 0, foulsCommitted: 0, foulsDrawn: 0,
      plusMinus: 0, efficiency: 0,
    };
  }
  const [, , min, pts, fgm, fga, p2m, p2a, p3m, p3a, ftm, fta, or_, dr, as, to, st, bs, pf, fd, pm, ef] = t;
  return {
    fullName, reportedName: fullName, jerseyNumber, didNotPlay: false,
    minutesPlayed: min, points: pts, fieldGoalsMade: fgm, fieldGoalsAttempted: fga,
    twoPointsMade: p2m, twoPointsAttempted: p2a, threePointsMade: p3m, threePointsAttempted: p3a,
    freeThrowsMade: ftm, freeThrowsAttempted: fta, offensiveRebounds: or_, defensiveRebounds: dr,
    assists: as, turnovers: to, steals: st, blocks: bs, foulsCommitted: pf, foulsDrawn: fd,
    plusMinus: pm, efficiency: ef,
  };
}

function team(clubName, clubShortName, totals, players) {
  return { clubName, clubShortName, totals, advanced: { ...ZERO_ADVANCED }, players: players.map(player) };
}

function game({ sourceLabel, venue, scheduledAt, homeScore, awayScore, periods, home, away }) {
  return {
    tournament: TOURNAMENT, division: DIVISION, season: SEASON, playerGender: PLAYER_GENDER,
    sourceLabel, venue, scheduledAt, homeScore, awayScore, periods, home, away,
  };
}

const games = [];

// ---------------------------------------------------------------------------
// Game 1: Ultra Basketball 38 - 41 LXB Surulere - Fri 18 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 1 - Ultra Basketball vs LXB Surulere - Fri 18 Sep 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-09-18T15:58:00.000Z",
  homeScore: 38, awayScore: 41,
  periods: [
    { period: 1, label: "Q1", homeScore: 9, awayScore: 11 },
    { period: 2, label: "Q2", homeScore: 15, awayScore: 9 },
    { period: 3, label: "Q3", homeScore: 6, awayScore: 14 },
    { period: 4, label: "Q4", homeScore: 8, awayScore: 7 },
  ],
  home: team("Ultra Basketball", "UTA", { points: 38, rebounds: 30, assists: 4, turnovers: 12, fouls: 21 }, [
    ["Benjamin Chibuzor", 0, 23, 16, 6, 8, 6, 7, 0, 1, 4, 10, 0, 0, 0, 1, 1, 0, 3, 6, 3, 8],
    ["Musa Ibrahim", 1, 25, 3, 0, 4, 0, 3, 0, 1, 3, 4, 0, 2, 1, 3, 0, 0, 2, 2, -11, -2],
    ["David Udanyi", 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 1],
    ["Adam Oladipor", 4, 20, 6, 2, 3, 2, 3, 0, 0, 2, 4, 0, 1, 2, 3, 1, 0, 2, 4, 2, 4],
    ["Victor Obioha", 5, 34, 1, 0, 4, 0, 4, 0, 0, 1, 4, 4, 1, 0, 1, 0, 0, 2, 2, -4, -2],
    ["Ebuka Elebuchi", 7, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 1, 0, 6, 3],
    ["Muna Okafor", 8, 7, 0, 0, 2, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, -1, -1],
    ["Haleem Akinyemi", 9, 16, 2, 1, 2, 1, 2, 0, 0, 0, 0, 3, 3, 0, 2, 1, 2, 3, 1, 0, 8],
    ["Elijah Nwodo", 10, 25, 0, 0, 3, 0, 2, 0, 1, 0, 0, 2, 3, 0, 1, 1, 1, 2, 0, -5, 3],
    ["Chigozie Okeh", 11, 4, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    ["Micheal Igbanesi", 23, 21, 6, 2, 3, 1, 2, 1, 1, 1, 4, 0, 2, 0, 0, 0, 1, 3, 2, 0, 5],
    ["Tobi Egunjobi", 32, 9, 2, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 1, 0, -5, 2],
  ]),
  away: team("LXB Surulere", "LBS", { points: 41, rebounds: 30, assists: 3, turnovers: 9, fouls: 17 }, [
    ["Sunday Joshua", 2, 37, 9, 3, 8, 3, 7, 0, 1, 3, 8, 0, 4, 1, 2, 0, 0, 2, 4, 4, 5],
    ["Njere Ikechukwu", 6, 3, 4, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 4],
    ["Thomas Ayomide", 8, 24, 2, 1, 8, 1, 7, 0, 1, 0, 0, 1, 2, 2, 2, 0, 0, 4, 4, -2, -2],
    ["Ifeanyi Udeli", 12, 15, 4, 1, 4, 1, 2, 0, 2, 2, 2, 0, 1, 0, 1, 1, 0, 4, 1, 11, 2],
    ["Ahmed Abdul", 13, 29, 8, 2, 5, 2, 5, 0, 0, 4, 6, 5, 3, 0, 0, 1, 0, 6, 8, 12, 8],
    ["Promise Eze", 14, 19, 0, 0, 2, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 4, -1, 0],
    ["Oladeji Sheriff", 15, 7, 2, 1, 2, 1, 2, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, -8, 1],
    ["Rooseven Gaga", 16, 18, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, -3, 4],
    ["Segun Victor", 17, 23, 5, 1, 5, 0, 1, 1, 4, 2, 5, 0, 2, 0, 2, 0, 1, 1, 2, 9, -3],
    ["Jeku Madu", 20, 18, 4, 0, 0, 0, 0, 0, 0, 4, 6, 0, 0, 0, 0, 0, 0, 3, 3, -17, 2],
    ["Adekoya Toheeb", 21, 7, 1, 0, 1, 0, 1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 1, -8, 0],
    ["Chibuere Rapheal", 28, "DNP"],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 2: Cantonment Braves 62 - 63 Leo Kareem Foundation - Fri 18 Sep 2026
// Both clubs recur (CNT from Game 6, LEO from Game 10); names reconciled to each club's
// already-established canonical spelling, jerseyNumber nulled where a different real player
// already holds that jersey in the other game (see session.md).
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 2 - Cantonment Braves vs Leo Kareem Foundation - Fri 18 Sep 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-09-18T17:47:00.000Z",
  homeScore: 62, awayScore: 63,
  periods: [
    { period: 1, label: "Q1", homeScore: 16, awayScore: 16 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 14 },
    { period: 3, label: "Q3", homeScore: 13, awayScore: 18 },
    { period: 4, label: "Q4", homeScore: 17, awayScore: 15 },
  ],
  home: team("Cantonment Braves", "CNT", { points: 62, rebounds: 28, assists: 8, turnovers: 9, fouls: 20 }, [
    ["Otunyemi Seun", 4, 8, 0, 0, 5, 0, 3, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -13, -5],
    ["Agindigbadi Wasiu", 5, 14, 2, 1, 3, 1, 2, 0, 1, 0, 0, 0, 1, 0, 2, 1, 1, 2, 0, 4, 1],
    ["Ahmed Olusoji", 6, 22, 9, 3, 6, 2, 4, 1, 2, 2, 2, 2, 2, 3, 2, 2, 1, 2, 1, -8, 14],
    ["Salako Fisayo", 7, 10, 1, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1, 0, 0, 0, 0, 1, 1, 8, 1],
    ["Otowo Emmanuel", 8, 13, 4, 1, 1, 1, 1, 0, 0, 2, 2, 1, 2, 0, 0, 0, 0, 3, 1, -6, 7],
    ["Afulukwe Marvellous", 9, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, -4, 3],
    ["Kayode Olakunle", 10, 23, 4, 2, 5, 2, 5, 0, 0, 0, 0, 2, 4, 0, 0, 0, 0, 2, 0, -5, 7],
    ["Eli Francis", 11, 19, 2, 1, 6, 1, 3, 0, 3, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 7, -1],
    ["Oparaugo Ikay", 12, 31, 5, 1, 8, 0, 2, 1, 6, 2, 2, 1, 2, 2, 1, 0, 0, 2, 2, 5, 2],
    ["Clinton Koko", 13, 32, 20, 5, 9, 4, 6, 1, 3, 9, 12, 1, 1, 1, 3, 1, 1, 4, 8, -1, 15],
    ["Oluwanifemi Kuti", 14, 28, 13, 5, 7, 5, 7, 0, 0, 3, 5, 1, 1, 2, 1, 1, 0, 3, 3, 10, 13],
  ]),
  away: team("Leo Kareem Foundation", "LEO", { points: 63, rebounds: 35, assists: 10, turnovers: 10, fouls: 17 }, [
    ["Jackson Felix", null, 14, 2, 1, 3, 1, 3, 0, 0, 0, 0, 2, 1, 1, 0, 1, 0, 1, 0, 7, 5],
    ["Oche Nworie", 5, 32, 16, 6, 12, 6, 8, 0, 4, 4, 4, 0, 3, 3, 3, 1, 0, 3, 2, 0, 14],
    ["Obasana Sunday", null, 30, 6, 2, 5, 1, 3, 1, 2, 1, 2, 1, 3, 0, 1, 2, 0, 2, 5, -3, 7],
    ["Matthew Daniel", null, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    ["Joshua Agbonkese", 9, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, -4, -2],
    ["Kamal Ayanlere", 10, 18, 3, 1, 4, 0, 0, 1, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 7, 1],
    ["Akinofa Ope", 11, 33, 13, 6, 9, 6, 9, 0, 0, 1, 1, 1, 2, 2, 2, 1, 0, 5, 2, -4, 14],
    ["John I", 12, 27, 11, 3, 4, 3, 4, 0, 0, 5, 8, 2, 2, 2, 0, 1, 0, 3, 4, 0, 14],
    ["Urenwoke Morrison", null, 9, 5, 2, 6, 2, 5, 0, 1, 1, 2, 0, 2, 0, 1, 0, 1, 0, 1, 3, 2],
    ["Balogun Divine", 14, 17, 3, 1, 1, 1, 1, 0, 0, 1, 2, 1, 1, 1, 0, 0, 0, 1, 3, 6, 5],
    ["Samuel O", 15, 16, 4, 2, 5, 2, 4, 0, 1, 0, 2, 1, 2, 0, 2, 0, 0, 2, 1, -1, 0],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 3: Lagos Raptors 39 - 40 Ogra Hoop Kings - Sat 19 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 3 - Lagos Raptors vs Ogra Hoop Kings - Sat 19 Sep 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-09-19T11:03:00.000Z",
  homeScore: 39, awayScore: 40,
  periods: [
    { period: 1, label: "Q1", homeScore: 12, awayScore: 10 },
    { period: 2, label: "Q2", homeScore: 15, awayScore: 8 },
    { period: 3, label: "Q3", homeScore: 6, awayScore: 7 },
    { period: 4, label: "Q4", homeScore: 6, awayScore: 15 },
  ],
  home: team("Lagos Raptors", "LAR", { points: 39, rebounds: 29, assists: 4, turnovers: 14, fouls: 23 }, [
    ["Henry Adewola", 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
    ["Ojajuni Oluwatobi", 2, 11, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, -6, 0],
    ["Farayibi Oluwatamilore", 3, 26, 4, 2, 3, 2, 2, 0, 1, 0, 2, 0, 1, 0, 0, 1, 0, 2, 2, 0, 3],
    ["Sopuchukwu Emmanuell", 6, 18, 1, 0, 3, 0, 2, 0, 1, 1, 2, 1, 1, 0, 2, 1, 0, 2, 1, -6, -2],
    ["Timi Samuel", 7, 40, 11, 4, 15, 4, 13, 0, 2, 3, 3, 0, 3, 2, 7, 3, 0, 2, 2, -1, 1],
    ["Dannis Godwill", 8, 13, 4, 1, 2, 1, 1, 0, 1, 2, 2, 1, 1, 0, 0, 0, 0, 3, 1, 4, 5],
    ["Lucky Kisiso", 9, 13, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1, 3],
    ["Uhunmwangho Osaretin", 10, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 3, 0, 1, -2],
    ["Dele Ajigboye", 11, 26, 6, 3, 4, 3, 4, 0, 0, 0, 2, 1, 6, 0, 1, 0, 1, 5, 1, 2, 10],
    ["Ayomide Adeeko", 12, 8, 0, 0, 2, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 5, 0],
    ["Kizito Egbejiogu", 13, 24, 9, 3, 10, 3, 9, 0, 1, 3, 3, 0, 0, 0, 1, 0, 1, 1, 2, -6, 3],
    ["Ikeze David", 14, 17, 2, 1, 2, 1, 2, 0, 0, 0, 2, 2, 4, 2, 2, 1, 0, 0, 1, 5, 6],
  ]),
  away: team("Ogra Hoop Kings", "OGR", { points: 40, rebounds: 35, assists: 4, turnovers: 16, fouls: 10 }, [
    ["Soluade Simi", 2, 27, 4, 1, 4, 1, 2, 0, 2, 2, 4, 0, 2, 2, 0, 0, 0, 1, 3, 7, 3],
    ["John Yashin", 3, "DNP"],
    ["Wunmi Adebisi", 4, 29, 14, 5, 7, 5, 7, 0, 0, 4, 9, 3, 2, 0, 2, 1, 1, 2, 6, -2, 12],
    ["Ubi Delight", 5, 28, 4, 1, 4, 0, 1, 1, 3, 1, 2, 1, 4, 0, 1, 0, 0, 2, 1, -1, 4],
    ["Yunusa Paul", 6, 19, 0, 0, 1, 0, 1, 0, 0, 0, 2, 1, 1, 0, 1, 1, 0, 0, 2, -8, -1],
    ["Anthony Uche", 7, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, -2, -1],
    ["Irozuru Nathaniel", 9, 17, 4, 1, 2, 1, 2, 0, 0, 2, 7, 1, 0, 1, 3, 0, 1, 1, 4, -7, -2],
    ["Nnerive Peter", 10, 13, 6, 2, 2, 2, 2, 0, 0, 2, 6, 1, 1, 0, 1, 2, 0, 0, 3, 9, 5],
    ["David Nsitem", 11, 20, 4, 2, 9, 2, 8, 0, 1, 0, 0, 2, 3, 0, 1, 2, 0, 3, 2, 10, 3],
    ["Dodeke Bibowei", 15, "DNP"],
    ["Kelvin Dangiwa", 21, 28, 4, 2, 8, 2, 6, 0, 2, 0, 0, 0, 3, 1, 4, 0, 0, 0, 1, 5, -2],
    ["Anas Usman", 40, 19, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 1, 0, -6, -3],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 4: Seaside Hoopers 65 - 68 Campos Basketballers - Sat 19 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 4 - Seaside Hoopers vs Campos Basketballers - Sat 19 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-19T12:56:00.000Z",
  homeScore: 65, awayScore: 68,
  periods: [
    { period: 1, label: "Q1", homeScore: 12, awayScore: 15 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 18 },
    { period: 3, label: "Q3", homeScore: 16, awayScore: 18 },
    { period: 4, label: "Q4", homeScore: 21, awayScore: 17 },
  ],
  home: team("Seaside Hoopers", "SSH", { points: 65, rebounds: 31, assists: 12, turnovers: 20, fouls: 19 }, [
    ["Evans Christopher", 0, "DNP"],
    ["Makonjuola Oluwasegun", 1, 40, 12, 5, 8, 4, 6, 1, 2, 1, 2, 1, 2, 3, 2, 1, 1, 5, 1, -3, 14],
    ["Anicho Precious", 4, 10, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 4, 1, -7, -4],
    ["Opene Nathaniel", 5, "DNP"],
    ["Augustine Timothy", 6, 31, 14, 6, 15, 4, 8, 2, 7, 0, 2, 0, 5, 1, 2, 5, 0, 1, 4, 6, 12],
    ["Oluwasegun Junior", 7, 11, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, -1, -1],
    ["Evans Amadi", 10, 32, 20, 9, 13, 9, 12, 0, 1, 2, 3, 2, 10, 1, 2, 0, 3, 3, 1, 7, 29],
    ["Bright Adedeji", 11, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, -11, 1],
    ["Segun George", 12, 37, 17, 8, 14, 8, 12, 0, 2, 1, 2, 1, 2, 6, 6, 2, 0, 0, 2, -1, 15],
    ["Ayomide Mashebinu", 13, "DNP"],
    ["Answer Anthony", 14, 8, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 6, 1],
    ["Timilehin Ebenezer", 17, 16, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 2, 1, -11, -3],
  ]),
  away: team("Campos Basketballers", "CPS", { points: 68, rebounds: 52, assists: 8, turnovers: 20, fouls: 10 }, [
    ["Whatson Shedrack", 0, 39, 21, 8, 14, 8, 14, 0, 0, 5, 10, 0, 0, 3, 5, 2, 1, 2, 6, 7, 11],
    ["Andrew H", 2, 12, 2, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 3],
    ["Uzoma Donald", 3, 33, 9, 4, 13, 3, 6, 1, 7, 0, 2, 4, 1, 0, 1, 1, 0, 3, 1, 3, 3],
    ["Salawu Korede", 5, "DNP"],
    ["Stephen Q", 6, 41, 15, 5, 16, 4, 12, 1, 4, 4, 10, 4, 6, 4, 7, 2, 1, 0, 7, 3, 8],
    ["Waris W", 8, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -1],
    ["Malik Nasir", 9, 26, 6, 1, 5, 1, 4, 0, 1, 4, 6, 3, 1, 1, 5, 2, 0, 2, 2, 8, 2],
    ["Muiz H", 11, 9, 2, 1, 3, 1, 3, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, -3, 2],
    ["Somto T", 15, 35, 13, 6, 14, 6, 14, 0, 0, 1, 4, 11, 9, 0, 2, 2, 3, 2, 3, 3, 25],
    ["Teslim Ayatu", 30, 4, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -5, -2],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 5: White Fire 75 - 24 Square Team - Sat 19 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 5 - White Fire vs Square Team - Sat 19 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-19T14:55:00.000Z",
  homeScore: 75, awayScore: 24,
  periods: [
    { period: 1, label: "Q1", homeScore: 35, awayScore: 7 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 5 },
    { period: 3, label: "Q3", homeScore: 7, awayScore: 4 },
    { period: 4, label: "Q4", homeScore: 17, awayScore: 8 },
  ],
  home: team("White Fire", "WHF", { points: 75, rebounds: 26, assists: 10, turnovers: 10, fouls: 15 }, [
    ["Boluwadoro Jeboto", 2, 25, 2, 1, 4, 1, 3, 0, 1, 0, 0, 0, 1, 3, 1, 0, 0, 2, 0, 19, 2],
    ["Emmanuel Ireleore", 5, 20, 11, 3, 6, 2, 4, 1, 2, 4, 7, 2, 0, 1, 1, 1, 0, 1, 3, 23, 8],
    ["Madoud Fofana", 9, 20, 6, 2, 4, 2, 3, 0, 1, 2, 4, 1, 3, 0, 3, 1, 0, 1, 2, 15, 4],
    ["Udo-Oreye Elisha", 10, 31, 7, 3, 6, 2, 3, 1, 3, 0, 0, 1, 1, 1, 0, 1, 0, 3, 0, 40, 8],
    ["Stanley Olisaemeka", 12, 20, 20, 10, 12, 10, 11, 0, 1, 0, 1, 1, 2, 0, 0, 1, 1, 2, 2, 36, 22],
    ["Okeye Faith", 13, 16, 4, 2, 3, 2, 2, 0, 1, 0, 0, 0, 0, 0, 0, 3, 0, 2, 0, 30, 6],
    ["Vihni Obioma", 15, 29, 12, 6, 10, 6, 9, 0, 1, 0, 0, 3, 5, 3, 4, 6, 0, 1, 1, 35, 21],
    ["Iynoluwa Laditan", 19, 18, 3, 1, 2, 1, 2, 0, 0, 1, 2, 1, 1, 0, 0, 1, 0, 1, 1, 25, 4],
    ["Clinton David", 22, 22, 10, 4, 7, 3, 4, 1, 3, 1, 1, 0, 3, 2, 1, 0, 0, 2, 3, 32, 11],
    ["Reginald Kelechi", 27, "DNP"],
  ]),
  away: team("Square Team", "STM", { points: 24, rebounds: 22, assists: 1, turnovers: 23, fouls: 12 }, [
    ["Qadri Akolade", 2, 25, 1, 0, 1, 0, 0, 0, 1, 1, 2, 0, 0, 0, 2, 0, 0, 1, 1, -38, -3],
    ["Gideon Emmanuel", 3, 40, 2, 0, 4, 0, 2, 0, 2, 2, 4, 0, 1, 0, 5, 1, 0, 2, 5, -51, -7],
    ["Qudus Ibrahim", 5, 27, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 4, 1, 4, 1, 0, 3, 1, -41, 1],
    ["Sodiq Fetuga", 6, 13, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, -10, 1],
    ["Peter Okeke", 7, 39, 19, 7, 13, 7, 13, 0, 0, 5, 8, 3, 5, 0, 6, 1, 1, 3, 4, -50, 14],
    ["Creon Okwuzu", 9, 40, 2, 1, 8, 1, 4, 0, 4, 0, 0, 1, 3, 0, 4, 0, 0, 2, 2, -51, -5],
    ["Bassey Ubi", 10, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, -12, 0],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 6: Campos Basketballers 69 - 58 Cantonment Braves - Sat 19 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 6 - Campos Basketballers vs Cantonment Braves - Sat 19 Sep 2026",
  venue: VENUE_CANTONMENT,
  scheduledAt: "2026-09-19T16:42:00.000Z",
  homeScore: 69, awayScore: 58,
  periods: [
    { period: 1, label: "Q1", homeScore: 16, awayScore: 14 },
    { period: 2, label: "Q2", homeScore: 13, awayScore: 12 },
    { period: 3, label: "Q3", homeScore: 17, awayScore: 13 },
    { period: 4, label: "Q4", homeScore: 23, awayScore: 19 },
  ],
  home: team("Campos Basketballers", "CMP", { points: 69, rebounds: 41, assists: 12, turnovers: 15, fouls: 13 }, [
    // Same club as Game 4; names reconciled to that game's canonical spelling where a jersey
    // match makes the identity clear, and jerseyNumber nulled (not guessed) where two different
    // names share a jersey worn by a different real player in Game 4 (see session.md).
    ["Nasir Abdulmalik", null, 17, 2, 1, 4, 1, 2, 0, 2, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, -2, 2],
    ["Salawu Korede", 1, 34, 11, 4, 16, 3, 13, 1, 3, 2, 4, 0, 4, 2, 4, 2, 0, 2, 4, 12, 1],
    ["Uzoma Donald", 3, 13, 5, 2, 4, 2, 4, 0, 0, 1, 2, 2, 3, 0, 0, 0, 0, 1, 1, 6, 7],
    ["Stephen Q", 6, 27, 7, 2, 6, 2, 5, 0, 1, 3, 4, 0, 3, 2, 4, 1, 0, 2, 3, 7, 4],
    ["Adesuyi Adekunle", null, 30, 20, 7, 13, 4, 5, 3, 8, 3, 3, 1, 4, 0, 1, 3, 0, 0, 1, 7, 21],
    ["Ugonna Joshua", null, "DNP"],
    ["Muiz Salam", 12, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -3, 0],
    ["Andrew Iyere", null, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ["Somto T", 23, 14, 10, 5, 7, 5, 7, 0, 0, 0, 0, 2, 1, 0, 1, 1, 2, 4, 0, 7, 13],
    ["Gideon Danjuma", 24, "DNP"],
    ["Whatson Shedrack", 30, 29, 10, 3, 9, 2, 7, 1, 2, 3, 4, 0, 7, 7, 3, 4, 0, 1, 5, 15, 18],
    ["Tawo Adedoyin", 45, 32, 4, 2, 3, 2, 3, 0, 0, 0, 0, 2, 6, 0, 2, 0, 1, 2, 4, 11, 10],
  ]),
  away: team("Cantonment Braves", "CTB", { points: 58, rebounds: 40, assists: 8, turnovers: 15, fouls: 18 }, [
    ["Otunyemi Seun", 4, 21, 2, 1, 8, 1, 7, 0, 1, 0, 0, 1, 3, 1, 5, 1, 0, 2, 0, -4, -4],
    ["Agindigbadi Wasiu", 5, 19, 2, 1, 4, 1, 4, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 1, 1, -11, 2],
    ["Ahmed Olusoji", 6, 33, 18, 6, 15, 4, 10, 2, 5, 4, 6, 0, 2, 2, 2, 0, 0, 1, 4, -7, 9],
    ["Salako Fisayo", 7, "DNP"],
    ["Otowo Emmanuel", 8, 24, 4, 2, 7, 2, 7, 0, 0, 0, 1, 2, 3, 1, 0, 2, 0, 4, 1, -5, 6],
    ["Afulukwe Marvellous", 9, 18, 7, 3, 7, 3, 7, 0, 0, 1, 1, 1, 2, 2, 0, 0, 0, 4, 1, -3, 8],
    ["Kayode Olakunle", 10, 25, 6, 3, 5, 3, 5, 0, 0, 0, 1, 3, 8, 0, 5, 0, 1, 2, 1, -13, 10],
    ["Eli Francis", 11, 8, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, -1, 2],
    ["Oparaugo Ikay", 12, 25, 11, 5, 13, 4, 8, 1, 5, 0, 0, 1, 1, 1, 2, 1, 0, 1, 0, -3, 5],
    ["Clinton Koko", 13, "DNP"],
    ["Oluwanifemi Kuti", 14, 27, 6, 1, 4, 1, 3, 0, 1, 4, 4, 1, 4, 0, 1, 2, 2, 3, 4, -4, 11],
    ["Ajala A", 15, "DNP"],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 7: Seaside Hoopers 60 - 55 Ogra Hoop Kings - Sun 20 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 7 - Seaside Hoopers vs Ogra Hoop Kings - Sun 20 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-20T11:04:00.000Z",
  homeScore: 60, awayScore: 55,
  periods: [
    { period: 1, label: "Q1", homeScore: 14, awayScore: 16 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 14 },
    { period: 3, label: "Q3", homeScore: 14, awayScore: 13 },
    { period: 4, label: "Q4", homeScore: 16, awayScore: 12 },
  ],
  home: team("Seaside Hoopers", "SEA", { points: 60, rebounds: 35, assists: 9, turnovers: 13, fouls: 15 }, [
    ["Evans Christopher", 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0],
    ["Makonjuola Oluwasegun", 1, 37, 8, 3, 13, 3, 9, 0, 4, 2, 2, 1, 2, 3, 5, 0, 0, 5, 2, 3, -1],
    ["Anicho Precious", 4, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1],
    ["Opene Nathaniel", 5, "DNP"],
    ["Augustine Timothy", 6, 40, 19, 6, 13, 4, 9, 2, 4, 5, 8, 2, 5, 0, 1, 3, 0, 0, 6, 5, 18],
    ["Oluwasegun Junior", 7, 23, 6, 3, 7, 3, 7, 0, 0, 0, 0, 0, 3, 1, 0, 1, 1, 2, 0, -2, 8],
    ["Evans Amadi", 10, 40, 8, 2, 4, 2, 4, 0, 0, 4, 12, 4, 10, 1, 1, 1, 0, 4, 7, 5, 13],
    ["Bright Adedeji", 11, 17, 5, 1, 2, 1, 2, 0, 0, 3, 4, 0, 0, 0, 2, 2, 0, 2, 2, 1, 3],
    ["Segun George", 12, 40, 14, 7, 12, 7, 11, 0, 1, 0, 4, 2, 1, 4, 4, 7, 2, 2, 3, 5, 17],
    ["Ayomide Mashebinu", 13, "DNP"],
    ["Answer Anthony", 14, "DNP"],
    ["Timilehin Ebenezer", 17, "DNP"],
  ]),
  away: team("Ogra Hoop Kings", "OHK", { points: 55, rebounds: 38, assists: 11, turnovers: 22, fouls: 20 }, [
    ["Soluade Simi", 2, 13, 6, 2, 4, 1, 1, 1, 3, 1, 1, 0, 1, 0, 2, 1, 0, 1, 2, 1, 4],
    ["John Yashin", 3, 8, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0, 2, 0, -6, -3],
    ["Wunmi Adebisi", 4, 25, 3, 1, 7, 1, 7, 0, 0, 1, 2, 0, 3, 3, 3, 0, 0, 5, 2, -1, -1],
    ["Ubi Delight", 5, 30, 5, 2, 10, 2, 9, 0, 1, 1, 2, 2, 4, 1, 2, 0, 0, 4, 2, -2, 1],
    ["Anthony Uche", 7, 4, 3, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 3],
    ["Yunusa Paul", 8, 14, 2, 1, 3, 1, 2, 0, 1, 0, 0, 2, 3, 0, 2, 0, 0, 1, 0, -1, 3],
    ["Irozuru Nathaniel", 9, 9, 1, 0, 1, 0, 1, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 1, 2, -2, -1],
    ["David Nsitem", 11, 25, 17, 7, 10, 7, 10, 0, 0, 3, 4, 4, 6, 0, 3, 2, 1, 1, 3, 2, 23],
    ["Nnerive Peter", 12, 26, 4, 2, 2, 2, 2, 0, 0, 0, 0, 1, 0, 2, 2, 1, 0, 1, 2, -8, 6],
    ["Dodeke Bibowei", 15, 4, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 4, 0],
    ["Kelvin Dangiwa", 21, 31, 11, 4, 14, 2, 7, 2, 7, 1, 1, 0, 0, 3, 3, 1, 0, 1, 1, -5, 2],
    ["Anas Usman", 40, 12, 3, 1, 2, 0, 0, 1, 2, 0, 0, 0, 0, 1, 1, 0, 0, 3, 0, -6, 2],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 8: LXB Surulere 44 - 40 White Fire - Sun 20 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 8 - LXB Surulere vs White Fire - Sun 20 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-20T13:17:00.000Z",
  homeScore: 44, awayScore: 40,
  periods: [
    { period: 1, label: "Q1", homeScore: 10, awayScore: 13 },
    { period: 2, label: "Q2", homeScore: 6, awayScore: 10 },
    { period: 3, label: "Q3", homeScore: 13, awayScore: 8 },
    { period: 4, label: "Q4", homeScore: 15, awayScore: 9 },
  ],
  home: team("LXB Surulere", "LXB", { points: 44, rebounds: 47, assists: 6, turnovers: 20, fouls: 21 }, [
    // Same club as Game 1; reconciled to that game's canonical spelling / nulled where the
    // jersey collides with a different real player from Game 1 (see session.md).
    ["Sunday Joshua", 2, 15, 6, 3, 7, 3, 6, 0, 1, 0, 2, 0, 4, 2, 0, 0, 0, 0, 1, 5, 6],
    ["Njere Ikechukwu", 6, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    ["Thomas Ayomide", 8, 15, 2, 1, 6, 1, 6, 0, 0, 0, 0, 1, 3, 0, 5, 1, 0, 3, 0, 2, -3],
    ["Ifeanyi Udeli", 12, 28, 11, 4, 7, 4, 7, 0, 0, 3, 4, 4, 4, 1, 0, 1, 1, 1, 3, 5, 18],
    ["Ahmed Abdul", 13, 31, 2, 0, 3, 0, 3, 0, 0, 2, 6, 3, 1, 1, 3, 1, 0, 4, 6, 3, -2],
    ["Promise Eze", 14, 19, 2, 1, 5, 1, 3, 0, 2, 0, 2, 1, 1, 0, 3, 2, 0, 2, 3, 5, -3],
    ["Rooseven Gaga", 16, "DNP"],
    ["Florunsho Segun", null, 33, 6, 2, 10, 2, 7, 0, 3, 2, 5, 1, 1, 1, 4, 1, 0, 4, 2, 7, -5],
    ["Salisu Umar", 22, 16, 4, 2, 6, 2, 6, 0, 0, 0, 1, 2, 2, 0, 2, 0, 0, 4, 2, -6, 1],
    ["Ik Igwe", 25, 9, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, -9, 2],
    ["Chibuere Rapheal", 28, "DNP"],
    ["Anekwere Francis", 29, 26, 9, 3, 5, 2, 4, 1, 1, 2, 4, 1, 4, 0, 0, 1, 0, 2, 2, 11, 11],
  ]),
  away: team("White Fire", "WHT", { points: 40, rebounds: 33, assists: 9, turnovers: 17, fouls: 20 }, [
    // Same club as Game 5; reconciled to that game's canonical spelling / nulled where the
    // jersey collides with a different real player from Game 5 (see session.md).
    ["Boluwadoro Jeboto", 2, 29, 0, 0, 2, 0, 1, 0, 1, 0, 2, 0, 0, 3, 4, 2, 0, 2, 2, 0, -3],
    ["Emmanuel Ireleore", 5, 13, 4, 1, 5, 1, 4, 0, 1, 2, 2, 0, 3, 1, 3, 1, 0, 3, 1, 0, 2],
    ["Daniel Izondo", 6, 3, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 3, 1],
    ["Madoud Fofana", 9, 11, 0, 0, 1, 0, 1, 0, 0, 0, 2, 0, 2, 0, 1, 0, 0, 1, 2, -5, -2],
    ["Udo-Oreye Elisha", 10, 25, 0, 0, 5, 0, 2, 0, 3, 0, 0, 0, 2, 0, 4, 1, 0, 1, 0, -11, -6],
    ["Stanley Olisaemeka", 12, 30, 12, 4, 8, 4, 8, 0, 0, 4, 5, 2, 6, 0, 2, 2, 5, 4, 8, 1, 20],
    ["Okeye Faith", 13, 23, 5, 2, 7, 2, 5, 0, 2, 1, 2, 1, 3, 2, 0, 0, 0, 2, 1, -6, 5],
    ["Vihni Obioma", 15, 27, 12, 5, 13, 5, 11, 0, 2, 2, 2, 1, 1, 1, 0, 1, 0, 1, 3, -2, 8],
    ["Ikenna Arthur", 18, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 4, 1],
    ["Iynoluwa Laditan", 19, 14, 1, 0, 1, 0, 1, 0, 0, 1, 2, 0, 3, 1, 1, 1, 0, 2, 3, -2, 3],
    ["Negedo Joseph", null, 19, 4, 1, 6, 0, 1, 1, 5, 1, 2, 1, 0, 1, 1, 3, 2, 2, 1, 0, 4],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 9: Lagos Raptors 54 - 46 Ultra Basketball - Sun 20 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 9 - Lagos Raptors vs Ultra Basketball - Sun 20 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-20T15:10:00.000Z",
  homeScore: 54, awayScore: 46,
  periods: [
    { period: 1, label: "Q1", homeScore: 10, awayScore: 7 },
    { period: 2, label: "Q2", homeScore: 19, awayScore: 12 },
    { period: 3, label: "Q3", homeScore: 11, awayScore: 14 },
    { period: 4, label: "Q4", homeScore: 14, awayScore: 13 },
  ],
  home: team("Lagos Raptors", "LRA", { points: 54, rebounds: 39, assists: 8, turnovers: 12, fouls: 14 }, [
    // Same club as Game 3; reconciled to that game's canonical spelling / nulled where the
    // jersey collides with a different real player from Game 3 (see session.md).
    ["Uhunmwangho Osaretin", 1, 12, 0, 0, 3, 0, 1, 0, 2, 0, 2, 1, 0, 2, 0, 0, 0, 1, 1, 0, -2],
    ["Emmanuel S", null, 20, 7, 3, 7, 3, 4, 0, 3, 1, 1, 0, 4, 0, 1, 0, 0, 2, 1, 4, 6],
    ["Farayibi Oluwatamilore", 3, 31, 9, 4, 5, 3, 3, 1, 2, 0, 0, 0, 1, 0, 3, 2, 0, 2, 0, 6, 8],
    ["Joseph O", 4, 34, 7, 1, 2, 1, 2, 0, 0, 5, 10, 0, 0, 3, 1, 0, 0, 2, 6, -1, 3],
    ["Ayomide Adeeko", 5, 12, 2, 0, 1, 0, 1, 0, 0, 2, 4, 1, 4, 0, 0, 0, 0, 2, 2, 10, 4],
    ["David Chidera", null, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 1],
    ["Timi Samuel", 7, 5, 2, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 4, 4],
    ["Dannis Godwill", 8, 7, 4, 2, 3, 2, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 5],
    ["Timmy T", null, 40, 10, 4, 15, 4, 14, 0, 1, 2, 2, 0, 4, 3, 2, 3, 0, 1, 4, 8, 7],
    ["Dele Ajigboye", 11, 29, 9, 3, 7, 3, 7, 0, 0, 3, 6, 1, 6, 0, 0, 0, 4, 1, 5, 0, 13],
    ["Ojajuni Oluwatobi", null, 6, 4, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1, 0, 9, 2],
  ]),
  away: team("Ultra Basketball", "ULT", { points: 46, rebounds: 44, assists: 5, turnovers: 10, fouls: 19 }, [
    ["Benjamin Chibuzor", 0, 31, 15, 6, 20, 4, 14, 2, 6, 1, 2, 0, 1, 0, 0, 0, 0, 1, 3, -4, 1],
    ["Musa Ibrahim", 1, 23, 2, 1, 7, 1, 5, 0, 2, 0, 0, 2, 1, 1, 1, 2, 0, 1, 0, -11, 1],
    ["David Udanyi", 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -4, 0],
    ["Adam Oladipor", 4, 15, 3, 1, 3, 0, 2, 1, 1, 0, 0, 0, 2, 1, 1, 1, 0, 1, 0, 2, 4],
    ["Victor Obioha", 5, 26, 3, 1, 2, 1, 2, 0, 0, 1, 4, 1, 1, 0, 0, 0, 0, 2, 2, 2, 1],
    ["Ebuka Elebuchi", 7, "DNP"],
    ["Muna Okafor", 8, 9, 0, 0, 1, 0, 1, 0, 0, 0, 2, 1, 1, 0, 1, 1, 0, 1, 1, -1, -1],
    ["Haleem Akinyemi", 9, 22, 6, 2, 8, 2, 7, 0, 1, 2, 4, 2, 3, 0, 4, 0, 2, 3, 4, 7, 1],
    ["Elijah Nwodo", 10, 29, 10, 5, 11, 5, 9, 0, 2, 0, 0, 7, 4, 1, 1, 0, 1, 4, 1, -16, 16],
    ["Chigozie Okeh", 11, 9, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -10, 0],
    ["Micheal Igbanesi", 23, 24, 7, 3, 7, 3, 5, 0, 2, 1, 5, 1, 1, 1, 1, 0, 0, 3, 3, 1, 1],
    ["Tobi Egunjobi", 32, 12, 0, 0, 4, 0, 4, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, -5, -1],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 10: Leo Kareem Foundation 94 - 16 Square Team - Sun 20 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 10 - Leo Kareem Foundation vs Square Team - Sun 20 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-20T16:46:00.000Z",
  homeScore: 94, awayScore: 16,
  periods: [
    { period: 1, label: "Q1", homeScore: 27, awayScore: 7 },
    { period: 2, label: "Q2", homeScore: 18, awayScore: 4 },
    { period: 3, label: "Q3", homeScore: 26, awayScore: 0 },
    { period: 4, label: "Q4", homeScore: 23, awayScore: 5 },
  ],
  home: team("Leo Kareem Foundation", "LFK", { points: 94, rebounds: 36, assists: 24, turnovers: 5, fouls: 8 }, [
    ["Musa Alfa", 4, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 19, 1],
    ["Oche Nworie", 5, 29, 12, 5, 8, 4, 4, 1, 4, 1, 1, 0, 2, 4, 1, 1, 0, 1, 0, 50, 15],
    ["Tawo Ademola", 6, 17, 8, 4, 5, 4, 5, 0, 0, 0, 2, 1, 1, 1, 0, 3, 0, 0, 1, 28, 11],
    ["Kelvin O", 7, 19, 8, 3, 6, 1, 4, 2, 2, 0, 0, 1, 1, 2, 1, 1, 0, 0, 0, 41, 9],
    ["Nathaniel Ojo", 8, 5, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0],
    ["Joshua Agbonkese", 9, 9, 8, 4, 5, 4, 5, 0, 0, 0, 0, 0, 2, 0, 1, 2, 0, 0, 0, 16, 10],
    ["Kamal Ayanlere", 10, 17, 5, 2, 4, 1, 1, 1, 3, 0, 0, 1, 8, 5, 1, 4, 0, 1, 0, 40, 20],
    ["Akinofa Ope", 11, 23, 25, 12, 15, 11, 13, 1, 2, 0, 0, 1, 0, 2, 0, 3, 0, 2, 1, 50, 28],
    ["Moyin D", 12, 14, 4, 2, 2, 2, 2, 0, 0, 0, 0, 2, 3, 0, 0, 1, 0, 0, 0, 23, 10],
    ["John I", 13, 15, 10, 5, 7, 5, 7, 0, 0, 0, 2, 2, 3, 4, 0, 4, 0, 0, 1, 33, 19],
    ["Balogun Divine", 14, 18, 10, 5, 7, 5, 6, 0, 1, 0, 2, 2, 3, 1, 1, 2, 1, 1, 1, 43, 14],
    ["Samuel O", 15, 19, 4, 2, 5, 2, 4, 0, 1, 0, 0, 1, 0, 3, 0, 1, 1, 0, 1, 37, 6],
  ]),
  away: team("Square Team", "SQT", { points: 16, rebounds: 19, assists: 2, turnovers: 25, fouls: 5 }, [
    // Same club as Game 5; reconciled to that game's canonical spelling / nulled where the
    // jersey collides with a different real player from Game 5 (see session.md).
    ["Ibrahim Qadir", null, 12, 2, 1, 5, 1, 3, 0, 2, 0, 0, 0, 0, 0, 4, 1, 0, 1, 0, -21, -5],
    ["Gideon Emmanuel", 3, 35, 0, 0, 4, 0, 3, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0, -63, -5],
    ["Bamadyi B", 4, 26, 0, 0, 2, 0, 1, 0, 1, 0, 0, 1, 0, 1, 2, 1, 0, 0, 1, -57, -1],
    ["Qudus Ibrahim", 5, 14, 2, 1, 3, 1, 2, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, -28, -2],
    ["Sodiq Fetuga", 6, 28, 4, 2, 6, 2, 3, 0, 3, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, -49, 2],
    ["Peter Okeke", 7, 16, 4, 2, 7, 2, 6, 0, 1, 0, 0, 0, 0, 1, 3, 1, 0, 0, 1, -36, -2],
    ["Creon Okwuzu", 9, 30, 1, 0, 4, 0, 2, 0, 2, 1, 1, 1, 2, 0, 6, 0, 0, 0, 0, -58, -6],
    ["Bilal M", null, 40, 3, 1, 6, 1, 5, 0, 1, 1, 2, 0, 2, 0, 4, 0, 0, 2, 2, -78, -5],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 11: Square Team 14 - 63 LXB Surulere - Fri 25 Sep 2026
// Both clubs recur; names reconciled to established canonical spelling, jerseyNumber
// nulled where a different real player already holds that jersey (see session.md).
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 11 - Square Team vs LXB Surulere - Fri 25 Sep 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-09-25T15:39:00.000Z",
  homeScore: 14, awayScore: 63,
  periods: [
    { period: 1, label: "Q1", homeScore: 5, awayScore: 20 },
    { period: 2, label: "Q2", homeScore: 3, awayScore: 12 },
    { period: 3, label: "Q3", homeScore: 4, awayScore: 13 },
    { period: 4, label: "Q4", homeScore: 2, awayScore: 18 },
  ],
  home: team("Square Team", "STM", { points: 14, rebounds: 7, assists: 2, turnovers: 10, fouls: 15 }, [
    ["Bilal M", null, 29, 1, 0, 1, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0, 0, 0, 2, 2, -38, -1],
    ["Gideon Emmanuel", 3, 31, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, -36, -1],
    ["Bameyi Benjamin", null, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, -16, 0],
    ["Biu David", null, 35, 7, 3, 8, 3, 7, 0, 1, 1, 2, 0, 1, 1, 3, 0, 0, 2, 3, -42, 0],
    ["Sodiq Fetuga", 6, 17, 0, 0, 3, 0, 3, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, -26, -4],
    ["Creon Okwuzu", 9, 13, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, -13, 2],
    ["Bassey Wisdom", null, 33, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 2, 0, -41, -1],
    ["Felix David", 17, 27, 2, 1, 4, 1, 4, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 5, 0, -33, 2],
  ]),
  away: team("LXB Surulere", "LBS", { points: 63, rebounds: 20, assists: 4, turnovers: 2, fouls: 8 }, [
    ["Sunday Joshua", 2, 19, 6, 2, 3, 2, 2, 0, 1, 2, 3, 0, 0, 1, 1, 0, 0, 0, 2, 27, 4],
    ["Njere Ikechukwu", 6, 10, 4, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 13, 5],
    ["Thomas Ayomide", 8, 17, 3, 1, 2, 1, 2, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 2, 1, 18, 3],
    ["Ifeanyi Udeli", 12, 26, 13, 5, 6, 5, 5, 0, 1, 3, 4, 2, 2, 1, 0, 1, 1, 2, 2, 33, 18],
    ["Ahmed Abdul", 13, 15, 12, 4, 5, 4, 5, 0, 0, 4, 6, 2, 1, 0, 0, 0, 0, 1, 5, 11, 12],
    ["Promise Eze", 14, 10, 4, 2, 4, 2, 2, 0, 2, 0, 0, 0, 0, 0, 0, 3, 0, 1, 0, 11, 4],
    ["Oladeji Sheriff", 15, 24, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0],
    ["Florunsho Segun", null, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    ["Salisu Umar", 22, 14, 10, 4, 4, 4, 4, 0, 0, 2, 2, 0, 0, 0, 0, 2, 0, 0, 1, 25, 10],
    ["Ik Igwe", 25, 21, 4, 2, 3, 2, 2, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 27, 4],
    ["Chibuere Rapheal", 28, 20, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 28, 0],
    ["Anekwere Francis", 29, 23, 7, 2, 5, 2, 5, 0, 0, 3, 6, 0, 0, 1, 0, 0, 0, 1, 3, 28, 2],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 12: Leo Kareem Foundation 35 - 42 Campos Basketballers - Fri 25 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 12 - Leo Kareem Foundation vs Campos Basketballers - Fri 25 Sep 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-09-25T15:59:00.000Z",
  homeScore: 35, awayScore: 42,
  periods: [
    { period: 1, label: "Q1", homeScore: 9, awayScore: 13 },
    { period: 2, label: "Q2", homeScore: 11, awayScore: 15 },
    { period: 3, label: "Q3", homeScore: 10, awayScore: 10 },
    { period: 4, label: "Q4", homeScore: 5, awayScore: 4 },
  ],
  home: team("Leo Kareem Foundation", "LFK", { points: 35, rebounds: 31, assists: 5, turnovers: 19, fouls: 20 }, [
    ["Jackson Felix", null, 9, 0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 3, -3],
    ["Oche Nworie", 5, 39, 7, 3, 9, 3, 8, 0, 1, 1, 2, 0, 2, 1, 3, 0, 0, 2, 1, -1, 0],
    ["Tawo Ademola", 6, 21, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 3, 2, 0, -1],
    ["Obasana Sunday", null, 22, 3, 1, 6, 0, 3, 1, 3, 0, 0, 1, 2, 0, 1, 0, 0, 1, 0, 0, 0],
    ["Musa Alfa", null, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, -5, 0],
    ["Akinofa Ope", 11, 35, 2, 1, 7, 1, 6, 0, 1, 0, 0, 0, 3, 2, 5, 2, 1, 4, 0, -9, -1],
    ["John I", 12, 24, 2, 1, 7, 1, 7, 0, 0, 0, 0, 4, 4, 0, 5, 0, 0, 2, 1, -13, -1],
    ["Urenwoke Morrison", null, 21, 14, 5, 9, 4, 5, 1, 4, 3, 7, 3, 1, 0, 0, 4, 0, 2, 5, 7, 14],
    ["Balogun Divine", 14, 16, 4, 2, 3, 2, 3, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 4, 1, -9, 2],
    ["Samuel O", 15, 12, 3, 1, 2, 0, 0, 1, 2, 0, 3, 0, 0, 0, 1, 0, 0, 1, 1, -8, -2],
  ]),
  away: team("Campos Basketballers", "CPS", { points: 42, rebounds: 34, assists: 8, turnovers: 22, fouls: 11 }, [
    ["Whatson Shedrack", 0, 28, 12, 5, 13, 5, 10, 0, 3, 2, 3, 1, 1, 1, 7, 3, 2, 2, 5, 3, 4],
    ["Salawu Korede", 1, 19, 6, 2, 2, 2, 2, 0, 0, 2, 2, 0, 1, 0, 3, 0, 0, 3, 1, -2, 4],
    ["Obinna Akinebu", null, 26, 4, 1, 6, 1, 4, 0, 2, 2, 2, 2, 0, 1, 3, 0, 0, 2, 2, 5, -1],
    ["Uzoma Donald", 3, 17, 5, 1, 4, 1, 2, 0, 2, 3, 4, 0, 0, 1, 1, 1, 0, 1, 1, 17, 2],
    ["Stephen Q", 6, 12, 5, 2, 3, 2, 2, 0, 1, 1, 4, 1, 2, 1, 1, 1, 0, 1, 5, 7, 5],
    ["Adesuyi Adekunle", null, 19, 4, 1, 4, 0, 0, 1, 4, 1, 2, 0, 2, 2, 1, 1, 0, 0, 1, 9, 4],
    ["Okpe Matthias", null, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, -2, 1],
    ["Muiz Salam", null, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 2, 1, 0, 0, 1, -1, 2],
    ["Somto Pascal", 23, 18, 0, 0, 2, 0, 2, 0, 0, 0, 0, 3, 5, 1, 1, 0, 3, 0, 0, -2, 9],
    ["Joshua Anthony", 24, 11, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, -6, -2],
    ["Nasir Abdulmalik", 30, 2, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, -3, -2],
    ["Tawo Adedoyin", 45, 32, 6, 3, 4, 3, 4, 0, 0, 0, 2, 2, 5, 1, 1, 3, 2, 0, 3, 14, 15],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 13: Cantonment Braves 55 - 39 Ogra Hoop Kings - Sat 26 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 13 - Cantonment Braves vs Ogra Hoop Kings - Sat 26 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-26T10:54:00.000Z",
  homeScore: 55, awayScore: 39,
  periods: [
    { period: 1, label: "Q1", homeScore: 7, awayScore: 6 },
    { period: 2, label: "Q2", homeScore: 15, awayScore: 9 },
    { period: 3, label: "Q3", homeScore: 19, awayScore: 4 },
    { period: 4, label: "Q4", homeScore: 14, awayScore: 20 },
  ],
  home: team("Cantonment Braves", "CTB", { points: 55, rebounds: 40, assists: 15, turnovers: 21, fouls: 14 }, [
    ["Otunyemi Seun", 4, 26, 12, 4, 10, 3, 6, 1, 4, 3, 4, 0, 1, 4, 5, 2, 0, 2, 4, 17, 7],
    ["Agindigbadi Wasiu", 5, "DNP"],
    ["Ahmed Olusoji", 6, 24, 0, 0, 3, 0, 1, 0, 2, 0, 0, 0, 3, 5, 3, 1, 0, 0, 0, 15, 3],
    ["Salako Fisayo", 7, "DNP"],
    ["Emmanuel Ofono", null, "DNP"],
    ["Emmanuel Idornigie", null, 38, 8, 3, 11, 2, 4, 1, 7, 1, 1, 0, 2, 1, 3, 3, 1, 1, 0, 15, 4],
    ["Kayode Olakunle", 10, 26, 5, 2, 5, 2, 5, 0, 0, 1, 2, 2, 7, 0, 0, 0, 3, 3, 1, 10, 13],
    ["Eli Francis", 11, 28, 9, 4, 9, 4, 6, 0, 3, 1, 1, 1, 0, 2, 5, 1, 0, 1, 1, 6, 3],
    ["Oparaugo Ikay", 12, 26, 14, 5, 9, 1, 1, 4, 8, 0, 0, 0, 2, 1, 4, 1, 0, 3, 0, 13, 10],
    ["Clinton Koko", 13, "DNP"],
    ["Oluwanifemi Kuti", 14, 31, 7, 3, 7, 3, 7, 0, 0, 1, 2, 4, 12, 2, 1, 1, 0, 4, 3, 4, 20],
    ["Ajala A", 15, "DNP"],
  ]),
  away: team("Ogra Hoop Kings", "OGR", { points: 39, rebounds: 40, assists: 6, turnovers: 22, fouls: 9 }, [
    ["Soluade Simi", 2, 18, 2, 1, 3, 1, 1, 0, 2, 0, 0, 0, 1, 0, 4, 0, 0, 0, 1, -9, -3],
    ["Wunmi Adebisi", 4, 27, 4, 2, 5, 2, 5, 0, 0, 0, 0, 2, 3, 1, 4, 0, 0, 5, 0, -4, 3],
    ["Ubi Delight", 5, 25, 3, 1, 8, 1, 6, 0, 2, 1, 4, 1, 3, 2, 2, 3, 0, 1, 2, -18, 0],
    ["Anthony Uche", 7, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -5, 0],
    ["Irozuru Nathaniel", null, 7, 1, 0, 1, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0, 1, 1, -10, 0],
    ["Nnerive Peter", 10, 14, 5, 2, 3, 2, 3, 0, 0, 1, 4, 0, 0, 1, 0, 2, 0, 0, 2, -3, 4],
    ["David Nsitem", 11, 20, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0, 0, -8, 3],
    ["John Yashin", 15, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0],
    ["Kelvin Dangiwa", 21, 34, 12, 4, 18, 3, 7, 1, 11, 3, 7, 3, 3, 1, 2, 0, 0, 0, 5, -6, -1],
    ["Anas Usman", 40, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0],
    ["Chuka Sampson", 41, 29, 8, 4, 12, 4, 12, 0, 0, 0, 0, 3, 6, 1, 4, 0, 0, 0, 0, -11, 6],
    ["Kenneth Nnanna", 44, 17, 4, 2, 6, 2, 4, 0, 2, 0, 0, 0, 5, 0, 4, 0, 0, 2, 1, -2, 1],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 14: Seaside Hoopers 31 - 42 Ultra Basketball - Sat 26 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 14 - Seaside Hoopers vs Ultra Basketball - Sat 26 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-26T13:00:00.000Z",
  homeScore: 31, awayScore: 42,
  periods: [
    { period: 1, label: "Q1", homeScore: 8, awayScore: 2 },
    { period: 2, label: "Q2", homeScore: 4, awayScore: 19 },
    { period: 3, label: "Q3", homeScore: 10, awayScore: 11 },
    { period: 4, label: "Q4", homeScore: 9, awayScore: 10 },
  ],
  home: team("Seaside Hoopers", "SSH", { points: 31, rebounds: 41, assists: 4, turnovers: 29, fouls: 17 }, [
    ["Makonjuola Oluwasegun", 1, 19, 0, 0, 3, 0, 2, 0, 1, 0, 0, 0, 2, 0, 2, 0, 0, 1, 1, 3, -3],
    ["Chike Emmanuel", 2, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 4, 1],
    ["Opene Nathaniel", 5, 20, 5, 1, 7, 1, 5, 0, 2, 3, 4, 0, 3, 1, 3, 1, 1, 4, 2, 5, 1],
    ["Augustine Timothy", 6, 22, 5, 1, 6, 0, 2, 1, 4, 2, 2, 1, 0, 1, 3, 2, 0, 0, 2, -14, 1],
    ["Oluwasegun Junior", 7, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, -2, 0],
    ["Evans Amadi", 10, 37, 7, 2, 4, 2, 4, 0, 0, 3, 5, 5, 11, 0, 2, 0, 0, 1, 2, -6, 17],
    ["Bright Adedeji", 11, 8, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -3, 0],
    ["Segun George", 12, 28, 2, 1, 5, 1, 3, 0, 2, 0, 0, 0, 1, 1, 9, 0, 0, 1, 1, -9, -9],
    ["Ayomide Mashebinu", 13, 37, 2, 1, 3, 1, 3, 0, 0, 0, 1, 3, 6, 1, 5, 1, 0, 4, 2, -4, 5],
    ["Timilehin Ebenezer", 17, 16, 8, 3, 6, 1, 3, 2, 3, 0, 3, 0, 1, 0, 2, 0, 0, 2, 1, -14, 1],
    ["Chioke Anthony", null, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -6, -1],
    ["Nwata Destiny", null, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -7, -1],
  ]),
  away: team("Ultra Basketball", "UTA", { points: 42, rebounds: 32, assists: 7, turnovers: 12, fouls: 12 }, [
    ["Benjamin Chibuzor", 0, 27, 12, 5, 14, 4, 9, 1, 5, 1, 4, 2, 0, 0, 4, 1, 0, 1, 3, 9, -1],
    ["Musa Ibrahim", 1, 14, 0, 0, 2, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 2, 1, 3, -1],
    ["David Udanyi", 2, 8, 3, 0, 6, 0, 2, 0, 4, 3, 4, 0, 0, 1, 0, 2, 0, 0, 3, 7, -1],
    ["Adam Oladipor", 4, 26, 2, 1, 4, 1, 3, 0, 1, 0, 0, 0, 2, 2, 2, 4, 0, 0, 2, 8, 5],
    ["Haleem Akinyemi", 9, 21, 4, 2, 3, 2, 3, 0, 0, 0, 0, 0, 5, 0, 2, 1, 0, 2, 0, 13, 4],
    ["Ebuka Elebuchi", 8, 28, 2, 1, 2, 1, 1, 0, 1, 0, 0, 1, 4, 0, 2, 1, 1, 3, 0, 5, 6],
    ["Tawo Bamidele", null, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0],
    ["Elijah Nwodo", 10, 24, 4, 1, 3, 1, 3, 0, 0, 2, 3, 3, 3, 2, 0, 1, 0, 1, 2, 1, 10],
    ["Chigozie Okeh", 11, 6, 2, 1, 3, 1, 3, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, -1, 0],
    ["Micheal Igbanesi", 23, 38, 13, 5, 15, 5, 13, 0, 2, 3, 8, 0, 2, 2, 0, 0, 0, 2, 5, 8, 2],
    ["Tobi Egunjobi", 32, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -3, 1],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 15: White Fire 44 - 58 Lagos Raptors - Sat 26 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 15 - White Fire vs Lagos Raptors - Sat 26 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-26T14:47:00.000Z",
  homeScore: 44, awayScore: 58,
  periods: [
    { period: 1, label: "Q1", homeScore: 14, awayScore: 18 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 15 },
    { period: 3, label: "Q3", homeScore: 8, awayScore: 13 },
    { period: 4, label: "Q4", homeScore: 6, awayScore: 12 },
  ],
  home: team("White Fire", "WHF", { points: 44, rebounds: 32, assists: 9, turnovers: 15, fouls: 15 }, [
    ["Debo Osipitan", 1, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 3, 2, 0, 4, 0, -6, 4],
    ["Vihni Obioma", 2, 27, 13, 5, 12, 5, 10, 0, 2, 3, 4, 3, 1, 1, 0, 0, 1, 3, 3, -11, 11],
    ["Emmanuel I", 4, 15, 2, 1, 4, 1, 3, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, -6, -1],
    ["Okoye Faith", 11, 24, 5, 2, 5, 2, 4, 0, 1, 1, 2, 0, 1, 2, 2, 1, 0, 0, 3, -10, 3],
    ["Madoud Fofana", 14, 17, 0, 0, 4, 0, 3, 0, 1, 0, 2, 3, 3, 1, 1, 1, 1, 0, 2, -17, 2],
    ["Stanley Emeka", 21, 31, 12, 5, 12, 5, 12, 0, 0, 2, 4, 1, 5, 0, 2, 3, 1, 2, 3, -2, 11],
    ["Joseph Reginald", 22, 27, 3, 1, 5, 1, 4, 0, 1, 1, 2, 1, 0, 1, 2, 2, 0, 0, 1, -4, 0],
    ["Dauda Ayomide", 23, 21, 9, 4, 8, 4, 8, 0, 0, 1, 2, 1, 3, 0, 1, 2, 0, 5, 1, -8, 9],
    ["Clinton David", 31, 10, 0, 0, 2, 0, 1, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 0, 1, -6, -4],
  ]),
  away: team("Lagos Raptors", "LAR", { points: 58, rebounds: 38, assists: 10, turnovers: 18, fouls: 14 }, [
    ["Neuman Ejirinade", null, 24, 10, 5, 9, 5, 8, 0, 1, 0, 3, 0, 2, 2, 0, 0, 0, 1, 2, 9, 7],
    ["Joseph Aloju", 5, 13, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 2, 0, 1, 2, 0, 1, 0, 2, 4],
    ["Damilare Sowere", null, 28, 8, 3, 6, 3, 6, 0, 0, 2, 4, 2, 2, 4, 6, 1, 0, 3, 3, 4, 6],
    ["Uhunmwangho Osaretin", 7, 5, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 3, -2],
    ["Timmy T", 8, 34, 12, 6, 13, 6, 13, 0, 0, 0, 0, 2, 4, 1, 5, 4, 1, 1, 2, 18, 12],
    ["Kizito Egbejiogu", 9, 13, 5, 2, 8, 2, 5, 0, 3, 1, 1, 1, 1, 2, 0, 0, 0, 1, 2, 5, 3],
    ["David Chidera", 10, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -3, 1],
    ["Dele Ajigboye", 11, 30, 6, 3, 6, 3, 6, 0, 0, 0, 0, 4, 2, 0, 1, 0, 2, 3, 0, 10, 6],
    ["Timrore Daniel", null, 8, 2, 1, 2, 1, 1, 0, 1, 0, 2, 2, 1, 1, 1, 1, 0, 1, 1, 7, 2],
    ["Ayomide John", null, 28, 13, 6, 8, 6, 8, 0, 0, 1, 6, 2, 2, 0, 2, 0, 0, 2, 5, 12, 8],
    ["Makwachuckwu Samuel", null, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, -1, 0],
    ["Ojajuni Oluwatobi", 15, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 6, 1],
  ]),
}));

const batch = {
  organization: {
    mode: "new",
    organization: {
      name: "Lagos Basketball Community League",
      slug: "lagos-basketball-community-league",
      idPrefixAthlete: "LBA",
      idPrefixStaff: "LBS",
    },
  },
  actorId: "cmqgct5pb000020kkm0aqtes2",
  games,
};

writeFileSync(new URL("./lbcl-2026-batch1.json", import.meta.url), JSON.stringify(batch, null, 2));
console.log(`Wrote ${games.length} games to lbcl-2026-batch1.json`);
