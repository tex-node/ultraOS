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
const SEASON = { name: "2026 Season", startDate: "2026-09-18T00:00:00.000Z", endDate: "2026-11-29T00:00:00.000Z" };
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
    ["Joshua Anthony", null, 11, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, -6, -2],
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
    ["Nathaniel Chibueze", null, 7, 1, 0, 1, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0, 1, 1, -10, 0],
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
    ["Stanley Olisaemeka", 21, 31, 12, 5, 12, 5, 12, 0, 0, 2, 4, 1, 5, 0, 2, 3, 1, 2, 3, -2, 11],
    ["Joseph Reginald", null, 27, 3, 1, 5, 1, 4, 0, 1, 1, 2, 1, 0, 1, 2, 2, 0, 0, 1, -4, 0],
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

// ---------------------------------------------------------------------------
// Game 16: LXB Surulere 50 - 40 Leo Kareem Foundation - Sat 26 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 16 - LXB Surulere vs Leo Kareem Foundation - Sat 26 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-26T16:18:00.000Z",
  homeScore: 50, awayScore: 40,
  periods: [
    { period: 1, label: "Q1", homeScore: 16, awayScore: 14 },
    { period: 2, label: "Q2", homeScore: 11, awayScore: 12 },
    { period: 3, label: "Q3", homeScore: 11, awayScore: 9 },
    { period: 4, label: "Q4", homeScore: 12, awayScore: 5 },
  ],
  home: team("LXB Surulere", "LBS", { points: 50, rebounds: 52, assists: 7, turnovers: 16, fouls: 24 }, [
    ["Sunday Joshua", 2, 6, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, -5, -1],
    ["Njere Ikechukwu", 6, "DNP"],
    ["Thomas Ayomide", 8, 26, 4, 2, 6, 2, 6, 0, 0, 0, 0, 1, 2, 3, 1, 2, 0, 1, 0, 8, 7],
    ["Ifeanyi Udeli", 12, 34, 12, 6, 12, 6, 12, 0, 0, 0, 0, 4, 13, 0, 2, 1, 0, 2, 1, 18, 22],
    ["Ahmad Momoh", null, 33, 11, 3, 7, 3, 7, 0, 0, 5, 7, 5, 7, 0, 1, 0, 2, 3, 6, 6, 18],
    ["Promise Eze", 14, 17, 4, 2, 6, 2, 5, 0, 1, 0, 0, 0, 2, 1, 0, 1, 0, 2, 2, 14, 4],
    ["Sesimi Olorunsho", null, 21, 4, 2, 7, 2, 4, 0, 3, 0, 0, 2, 0, 1, 4, 1, 0, 5, 2, 5, -1],
    ["Jeku Madu", 20, 9, 4, 2, 3, 2, 3, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 5, 0, 2, 3],
    ["Adekoya Toheeb", 21, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, -3, 1],
    ["Salisu Umar", 22, 10, 1, 0, 2, 0, 2, 0, 0, 1, 2, 1, 0, 0, 1, 0, 0, 3, 1, 2, -2],
    ["Ik Igwe", 25, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -1],
    ["Anekwere Francis", 29, 37, 10, 3, 10, 3, 10, 0, 0, 4, 7, 2, 2, 2, 4, 2, 0, 1, 4, 7, 4],
  ]),
  away: team("Leo Kareem Foundation", "LFK", { points: 40, rebounds: 35, assists: 4, turnovers: 17, fouls: 16 }, [
    ["Jackson Felix", 4, 14, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -9, -1],
    ["Oche Nworie", 5, 40, 10, 2, 11, 2, 8, 0, 3, 6, 10, 2, 5, 2, 6, 0, 0, 2, 6, -10, 0],
    ["Obasana Sunday", 7, 40, 11, 4, 13, 3, 9, 1, 4, 2, 4, 3, 6, 1, 3, 0, 1, 1, 2, -10, 8],
    ["Matthew Daniel", 8, 2, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, -2, -2],
    ["Musa Alfa", 9, 14, 0, 0, 2, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1, -3],
    ["Somadina Dike", null, "DNP"],
    ["Akinofa Ope", 11, 27, 7, 2, 9, 1, 7, 1, 2, 2, 6, 1, 4, 0, 3, 3, 0, 4, 4, -2, 1],
    ["John I", null, "DNP"],
    ["Urenwoke Morrison", 13, 33, 7, 2, 6, 2, 6, 0, 0, 3, 6, 2, 1, 1, 2, 0, 1, 2, 5, -16, 3],
    ["Balogun Divine", 14, 26, 5, 1, 4, 0, 3, 1, 1, 2, 6, 1, 2, 0, 1, 0, 0, 4, 5, -2, 0],
    ["Tawo Ademola", null, "DNP"],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 17: White Fire 49 - 66 Seaside Hoopers - Sun 27 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 17 - White Fire vs Seaside Hoopers - Sun 27 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-27T11:08:00.000Z",
  homeScore: 49, awayScore: 66,
  periods: [
    { period: 1, label: "Q1", homeScore: 12, awayScore: 17 },
    { period: 2, label: "Q2", homeScore: 13, awayScore: 16 },
    { period: 3, label: "Q3", homeScore: 9, awayScore: 16 },
    { period: 4, label: "Q4", homeScore: 15, awayScore: 17 },
  ],
  home: team("White Fire", "WHF", { points: 49, rebounds: 35, assists: 8, turnovers: 12, fouls: 23 }, [
    ["Debo Osipitan", 1, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 1, 4, 0, 4, 1, -9, 9],
    ["Vihni Obioma", 2, 21, 13, 5, 17, 5, 15, 0, 2, 3, 4, 0, 2, 0, 1, 2, 0, 1, 3, -17, 3],
    ["Boluwadoro Jeboto", 4, 16, 7, 3, 7, 2, 4, 1, 3, 0, 0, 0, 2, 0, 2, 1, 1, 3, 0, 0, 5],
    ["Okoye Faith", 11, 14, 0, 0, 6, 0, 4, 0, 2, 0, 0, 2, 1, 1, 1, 0, 0, 3, 1, -11, -3],
    ["Madoud Fofana", 14, 14, 2, 1, 2, 1, 1, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 1, 2, -8, -1],
    ["Stanley Olisaemeka", 21, 25, 9, 4, 11, 4, 11, 0, 0, 1, 1, 1, 3, 0, 2, 0, 0, 4, 1, -5, 4],
    ["Reginald Kelechi", 22, 29, 4, 2, 9, 2, 2, 0, 7, 0, 0, 0, 0, 3, 1, 5, 0, 1, 1, -13, 4],
    ["Dauda Ayomide", 23, 37, 14, 7, 14, 7, 13, 0, 1, 0, 0, 4, 5, 1, 4, 1, 0, 4, 1, -14, 14],
    ["Clinton David", 31, 10, 0, 0, 2, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -8, -1],
  ]),
  away: team("Seaside Hoopers", "SSH", { points: 66, rebounds: 46, assists: 15, turnovers: 19, fouls: 10 }, [
    ["Evans Christopher", 0, "DNP"],
    ["Makonjuola Oluwasegun", 1, 28, 3, 1, 3, 1, 2, 0, 1, 1, 2, 0, 3, 3, 6, 0, 0, 1, 1, 6, 0],
    ["Chike Emmanuel", 2, 19, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 4, 0, 0, 2, 1, -2, -3],
    ["Opene Nathaniel", 5, 27, 12, 4, 8, 3, 5, 1, 3, 3, 6, 0, 0, 4, 1, 1, 0, 1, 4, 16, 9],
    ["Augustine Timothy", 6, 21, 4, 1, 5, 0, 1, 1, 4, 1, 2, 1, 4, 1, 0, 5, 1, 0, 2, 11, 11],
    ["Evans Amadi", 10, 31, 21, 9, 13, 9, 13, 0, 0, 3, 7, 6, 10, 2, 3, 0, 0, 1, 5, 12, 28],
    ["Bright Adedeji", 11, "DNP"],
    ["Segun George", 12, 18, 4, 2, 6, 2, 4, 0, 2, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 12, 2],
    ["Ayomide Mashebinu", 13, "DNP"],
    ["Timilehin Ebenezer", 17, 18, 3, 1, 4, 1, 2, 0, 2, 1, 8, 0, 2, 1, 4, 1, 0, 3, 4, -7, -7],
    ["Chioke Anthony", null, "DNP"],
    ["Nwata Destiny", null, 34, 19, 9, 14, 9, 13, 0, 1, 1, 6, 4, 6, 3, 0, 1, 1, 2, 5, 20, 24],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 18: Cantonment Braves 41 - 37 Ultra Basketball - Sun 27 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 18 - Cantonment Braves vs Ultra Basketball - Sun 27 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-27T11:14:00.000Z",
  homeScore: 41, awayScore: 37,
  periods: [
    { period: 1, label: "Q1", homeScore: 11, awayScore: 14 },
    { period: 2, label: "Q2", homeScore: 15, awayScore: 7 },
    { period: 3, label: "Q3", homeScore: 10, awayScore: 8 },
    { period: 4, label: "Q4", homeScore: 5, awayScore: 8 },
  ],
  home: team("Cantonment Braves", "CTB", { points: 41, rebounds: 44, assists: 7, turnovers: 12, fouls: 22 }, [
    ["Otunyemi Seun", 4, 14, 7, 0, 3, 0, 2, 0, 1, 7, 10, 0, 2, 3, 3, 2, 0, 1, 5, 1, 5],
    ["Agindigbadi Wasiu", 5, 13, 0, 0, 3, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 2, 0, 2, 0, -3, -2],
    ["Ahmed Olusoji", 6, 13, 3, 1, 7, 1, 5, 0, 2, 1, 2, 0, 0, 0, 2, 2, 0, 1, 1, -3, -4],
    ["Salako Fisayo", 7, "DNP"],
    ["Otowo Emmanuel", 8, 23, 0, 0, 2, 0, 2, 0, 0, 0, 2, 2, 2, 1, 0, 0, 0, 3, 2, 2, 1],
    ["Emmanuel Idornigie", 9, 20, 4, 2, 5, 2, 4, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 3, 3],
    ["Kayode Olakunle", 10, 10, 2, 1, 3, 1, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, -6, 1],
    ["Eli Francis", 11, 23, 4, 2, 9, 2, 6, 0, 3, 0, 0, 0, 3, 0, 2, 2, 0, 2, 1, -2, 0],
    ["Oparaugo Ikay", 12, 26, 7, 3, 12, 2, 5, 1, 7, 0, 0, 1, 3, 0, 0, 0, 0, 1, 0, 7, 2],
    ["Clinton Koko", 13, 27, 6, 2, 7, 2, 7, 0, 0, 2, 8, 1, 4, 3, 2, 4, 0, 3, 5, 5, 5],
    ["Oluwanifemi Kuti", 14, "DNP"],
    ["Ajala A", 15, 25, 8, 4, 7, 4, 7, 0, 0, 0, 2, 4, 7, 0, 1, 0, 3, 5, 3, 16, 16],
  ]),
  away: team("Ultra Basketball", "UTA", { points: 37, rebounds: 48, assists: 5, turnovers: 21, fouls: 17 }, [
    ["Benjamin Chibuzor", 0, 25, 9, 3, 14, 2, 8, 1, 6, 2, 4, 0, 4, 0, 3, 0, 0, 3, 3, 1, -3],
    ["Musa Ibrahim", 1, 9, 4, 2, 3, 2, 3, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 2, 0, 1, 2],
    ["David Udanyi", 2, 4, 1, 0, 3, 0, 2, 0, 1, 1, 2, 0, 0, 0, 0, 1, 0, 0, 1, -2, -2],
    ["Adam Oladipor", 4, 30, 2, 1, 5, 1, 4, 0, 1, 0, 1, 4, 2, 2, 3, 1, 0, 2, 2, -5, 3],
    ["Amir Kabiru", null, 10, 4, 1, 1, 0, 0, 1, 1, 1, 4, 0, 1, 0, 3, 1, 0, 4, 4, 0, 4],
    ["Lanre Shittu", null, 4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 1, 0, 0, 0, -2, 1],
    ["Ebuka Elebuchi", 8, 24, 0, 0, 2, 0, 2, 0, 0, 0, 0, 1, 3, 1, 0, 0, 1, 2, 0, 2, 4],
    ["Tawo Bamidele", null, 6, 2, 0, 0, 0, 0, 0, 0, 2, 4, 0, 2, 0, 2, 0, 0, 0, 2, 5, 0],
    ["Elijah Nwodo", 10, 24, 4, 2, 5, 2, 5, 0, 0, 0, 0, 1, 5, 1, 0, 1, 0, 2, 1, 6, 9],
    ["Haleem Akinyemi", 9, 22, 0, 0, 4, 0, 2, 0, 2, 0, 2, 2, 2, 0, 3, 0, 2, 2, 2, -14, -3],
    ["Micheal Igbanesi", 23, 34, 11, 3, 10, 3, 8, 0, 2, 5, 8, 0, 6, 1, 3, 0, 0, 1, 6, -9, 5],
    ["Tobi Egunjobi", 32, 2, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, -7, -2],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 19: Square Team 33 - 74 Lagos Raptors - Sun 27 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 19 - Square Team vs Lagos Raptors Basketball Academy - Sun 27 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-27T11:16:00.000Z",
  homeScore: 33, awayScore: 74,
  periods: [
    { period: 1, label: "Q1", homeScore: 12, awayScore: 17 },
    { period: 2, label: "Q2", homeScore: 13, awayScore: 15 },
    { period: 3, label: "Q3", homeScore: 6, awayScore: 18 },
    { period: 4, label: "Q4", homeScore: 2, awayScore: 24 },
  ],
  home: team("Square Team", "STM", { points: 33, rebounds: 42, assists: 7, turnovers: 33, fouls: 7 }, [
    ["Bilal M", 2, 16, 2, 1, 3, 1, 2, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -23, -1],
    ["Gideon Emmanuel", 3, 24, 0, 0, 2, 0, 2, 0, 0, 0, 0, 2, 6, 0, 0, 0, 0, 1, 0, -19, -6],
    ["Bameyi Benjamin", 4, 8, 0, 0, 3, 0, 1, 0, 2, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, -12, -2],
    ["Biu David", 5, 35, 6, 3, 10, 3, 9, 0, 1, 0, 0, 0, 1, 3, 7, 1, 0, 1, 0, -29, -3],
    ["Peter Okeke", 7, 32, 9, 4, 9, 4, 9, 0, 0, 1, 4, 3, 7, 0, 7, 1, 1, 2, 3, -36, 6],
    ["Creon Okwuzu", 9, 24, 8, 4, 7, 4, 6, 0, 1, 1, 1, 0, 4, 2, 1, 0, 0, 0, 0, -19, 6],
    ["Felix David", 17, 22, 2, 1, 6, 1, 6, 0, 0, 0, 2, 3, 3, 1, 2, 0, 0, 0, 2, -26, 0],
    ["Onyedikachi Anekwe", 55, 36, 6, 2, 10, 2, 9, 0, 1, 2, 4, 4, 6, 1, 4, 0, 0, 2, 2, -41, 3],
  ]),
  away: team("Lagos Raptors", "LAR", { points: 74, rebounds: 41, assists: 14, turnovers: 9, fouls: 7 }, [
    ["Worship Adele", null, 23, 6, 3, 12, 3, 7, 0, 5, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 21, -4],
    ["Sopuchukwu Emmanuell", 2, 16, 13, 6, 13, 6, 11, 0, 2, 1, 2, 3, 0, 0, 1, 0, 0, 2, 2, 20, 7],
    ["Timi Samuel", 3, 23, 10, 5, 15, 5, 12, 0, 3, 0, 2, 0, 0, 2, 0, 5, 0, 0, 1, 21, 5],
    ["Neuman Ejirinade", 4, 16, 6, 3, 5, 3, 5, 0, 0, 0, 0, 1, 0, 1, 0, 3, 0, 0, 1, 20, 9],
    ["Farayibi Oluwatamilore", 5, 16, 8, 4, 7, 4, 6, 0, 1, 0, 0, 1, 3, 0, 6, 0, 0, 0, 0, 20, 15],
    ["Lucky Kisiso", 6, 15, 6, 3, 3, 3, 3, 0, 0, 0, 0, 5, 5, 3, 2, 1, 0, 1, 0, 9, 18],
    ["Ojajuni Oluwatobi", 7, 16, 6, 2, 4, 2, 4, 0, 0, 2, 4, 0, 1, 0, 1, 0, 0, 2, 0, 20, 4],
    ["Dannis Godwill", 8, 10, 4, 2, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 2, 0, 2, 0, 16, 8],
    ["Joseph O", 9, "DNP"],
    ["Damilare Sowere", 10, 23, 6, 3, 7, 3, 6, 0, 1, 0, 0, 0, 5, 2, 1, 1, 1, 0, 1, 21, 10],
    ["Dele Ajigboye", 11, 23, 7, 3, 7, 3, 7, 0, 1, 2, 4, 5, 9, 0, 1, 2, 3, 1, 1, 21, 15],
    ["Ayomide Adeeko", 12, 13, 2, 1, 2, 1, 2, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 16, 4],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 20: Campos Basketballers 48 - 40 Ogra Hoop Kings - Sun 27 Sep 2026
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 20 - Campos Basketball vs Ogra Hoop Kings - Sun 27 Sep 2026",
  venue: VENUE_IKEJA,
  scheduledAt: "2026-09-27T11:18:00.000Z",
  homeScore: 48, awayScore: 40,
  periods: [
    { period: 1, label: "Q1", homeScore: 17, awayScore: 8 },
    { period: 2, label: "Q2", homeScore: 8, awayScore: 15 },
    { period: 3, label: "Q3", homeScore: 11, awayScore: 4 },
    { period: 4, label: "Q4", homeScore: 12, awayScore: 13 },
  ],
  home: team("Campos Basketballers", "CBB", { points: 48, rebounds: 28, assists: 14, turnovers: 14, fouls: 13 }, [
    ["Jamelo U", null, "DNP"],
    ["Salawu Korede", 1, 40, 2, 0, 3, 0, 2, 0, 1, 2, 4, 0, 1, 3, 2, 2, 0, 1, 2, 8, 1],
    ["Obinna Akinebu", 2, 40, 8, 2, 7, 2, 5, 0, 2, 4, 5, 1, 2, 4, 1, 1, 0, 3, 3, 8, 9],
    ["Uzoma Donald", 3, 40, 15, 7, 11, 7, 11, 0, 0, 1, 2, 5, 3, 0, 3, 1, 0, 2, 3, 8, 16],
    ["Stephen Q", 6, 40, 19, 7, 13, 7, 13, 0, 0, 5, 12, 1, 5, 3, 5, 2, 2, 4, 8, 8, 14],
    ["Adesuyi Adekunle", 8, 40, 4, 1, 10, 0, 2, 1, 8, 1, 5, 0, 8, 4, 3, 4, 0, 2, 2, 8, 4],
    ["Okpe Matthias", 9, "DNP"],
    ["Muiz Salam", 11, "DNP"],
    ["Somto Pascal", 23, "DNP"],
    ["Joshua Anthony", 24, "DNP"],
    ["Nasir Abdulmalik", 30, "DNP"],
    ["Tawo Adedoyin", 45, "DNP"],
  ]),
  away: team("Ogra Hoop Kings", "OGK", { points: 40, rebounds: 37, assists: 4, turnovers: 21, fouls: 19 }, [
    ["Soluade Simi", 2, 17, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, -2, -2],
    ["Wunmi Adebisi", 4, 37, 7, 3, 7, 3, 7, 0, 0, 1, 4, 0, 6, 1, 2, 1, 0, 2, 5, -9, 6],
    ["Ubi Delight", 5, 16, 3, 1, 3, 1, 3, 0, 0, 1, 1, 2, 2, 1, 1, 1, 0, 5, 1, -9, 6],
    ["Yunusa Paul", 6, 16, 8, 4, 8, 4, 7, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 7, 3],
    ["Anthony Uche", 7, 4, 1, 0, 1, 0, 1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    ["Irozuru Nathaniel", 9, 4, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, -9, 0],
    ["Nnerive Peter", 10, 11, 4, 1, 1, 1, 1, 0, 0, 0, 0, 0, 2, 0, 3, 1, 0, 1, 2, -1, 4],
    ["David Nsitem", 11, 12, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, -8, -3],
    ["Kelvin Dangiwa", 21, 35, 2, 0, 8, 0, 7, 0, 1, 2, 2, 1, 2, 0, 4, 3, 0, 2, 1, -16, -4],
    ["Anas Usman", 40, 11, 5, 2, 5, 2, 3, 0, 2, 1, 1, 1, 1, 0, 3, 0, 0, 0, 0, 3, 1],
    ["Chukwu Obi", null, 11, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, -2, 0],
    ["Nana Anu", null, 19, 10, 5, 6, 5, 6, 0, 0, 0, 0, 3, 8, 0, 2, 1, 0, 4, 1, 4, 19],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 21: Ultra Basketball 38 - 60 Campos Basketballers - Thu 01 Oct 2026
// Sheet headers for Games 21-24 print no venue, so VENUE_TBC (same as Games 1-3, 11-12).
// Minutes are truncated to whole minutes (22:57 -> 22), matching Games 1-20. scheduledAt is the
// sheet's start time (Lagos, UTC+1) converted to UTC (12:02 -> 11:02Z), matching Game 20.
// Every name reconciled against the live staging roster (see session.md, 2026-10-02).
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 21 - Ultra Basketball vs Campos Basketballers - Thu 01 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-01T11:02:00.000Z",
  homeScore: 38, awayScore: 60,
  periods: [
    { period: 1, label: "Q1", homeScore: 12, awayScore: 8 },
    { period: 2, label: "Q2", homeScore: 7, awayScore: 15 },
    { period: 3, label: "Q3", homeScore: 10, awayScore: 19 },
    { period: 4, label: "Q4", homeScore: 9, awayScore: 18 },
  ],
  home: team("Ultra Basketball", "UTA", { points: 38, rebounds: 34, assists: 2, turnovers: 9, fouls: 25 }, [
    // Sheet spellings -> canonical: Chibuzor Benjamin, Damusa Ibrahim (#1 anchor + surname),
    // Adam Oladipupo, Amir Kabir, Halleem Akinyemi, Ebuka Elemchi, Taiwo Bamidele, Elijah Nwogo,
    // Munachi Okafor (shared surname + "Muna" prefix). All matched existing players; none new.
    ["Benjamin Chibuzor", 0, 22, 7, 3, 12, 3, 9, 0, 3, 1, 2, 1, 0, 2, 0, 1, 0, 2, 2, -13, 1],
    ["Musa Ibrahim", 1, 26, 5, 2, 10, 1, 7, 1, 3, 0, 0, 2, 6, 0, 2, 0, 1, 2, 1, -11, 4],
    ["David Udanyi", 2, 3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1],
    ["Adam Oladipor", 4, 13, 3, 1, 2, 1, 1, 0, 1, 1, 2, 0, 1, 0, 0, 0, 0, 2, 1, -11, 2],
    ["Amir Kabiru", 5, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, -8, -1],
    ["Haleem Akinyemi", 7, 18, 2, 1, 1, 1, 1, 0, 0, 0, 2, 0, 1, 0, 1, 1, 1, 5, 1, -4, 2],
    ["Ebuka Elebuchi", 8, 17, 5, 2, 3, 2, 3, 0, 0, 1, 2, 1, 1, 0, 0, 1, 0, 2, 1, -17, 6],
    ["Tawo Bamidele", 9, 12, 3, 1, 1, 1, 1, 0, 0, 1, 2, 2, 0, 0, 0, 0, 0, 2, 2, -10, 4],
    ["Elijah Nwodo", 10, 23, 2, 1, 3, 1, 3, 0, 0, 0, 2, 1, 5, 0, 2, 0, 1, 5, 2, -3, 3],
    ["Muna Okafor", 11, 13, 4, 2, 4, 2, 2, 0, 2, 0, 1, 0, 1, 0, 0, 1, 0, 3, 1, -9, 3],
    ["Micheal Igbanesi", 23, 29, 7, 2, 9, 1, 7, 1, 2, 2, 6, 1, 3, 0, 3, 0, 0, 1, 3, -14, -3],
    ["Tobi Egunjobi", 32, 5, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -7, -1],
  ]),
  away: team("Campos Basketballers", "CPS", { points: 60, rebounds: 41, assists: 2, turnovers: 6, fouls: 15 }, [
    // Sheet spellings -> canonical (same anchors as Game 20): Korede Salawu, Obinna Akunebu,
    // Oguh Donald (#3 -> Uzoma Donald), Stephen Munachukwu (#6 -> Stephen Q), Adekunle Adesuyi,
    // Muiz Salami, Joshua Antony, Adedoyin Taiwo (#45 -> Tawo Adedoyin). None new.
    ["Jamelo U", 0, "DNP"],
    ["Salawu Korede", 1, 33, 14, 1, 5, 1, 4, 0, 1, 12, 14, 0, 3, 0, 2, 0, 0, 0, 9, 20, 9],
    ["Obinna Akinebu", 2, 25, 5, 2, 4, 2, 4, 0, 0, 1, 2, 1, 1, 2, 1, 0, 0, 0, 3, 21, 5],
    ["Uzoma Donald", 3, 15, 1, 0, 2, 0, 2, 0, 0, 1, 2, 1, 0, 0, 2, 0, 0, 4, 1, -2, -3],
    ["Stephen Q", 6, 35, 7, 1, 7, 1, 5, 0, 2, 5, 11, 1, 5, 0, 0, 0, 1, 1, 6, 18, 2],
    ["Adesuyi Adekunle", 8, 20, 14, 5, 13, 3, 4, 2, 9, 2, 4, 1, 0, 0, 0, 1, 0, 0, 2, 12, 6],
    ["Okpe Matthias", 9, "DNP"],
    ["Muiz Salam", 11, 14, 1, 0, 2, 0, 2, 0, 0, 1, 2, 0, 2, 0, 0, 1, 0, 5, 1, 9, 1],
    ["Somto Pascal", 23, 30, 12, 6, 10, 6, 10, 0, 0, 0, 1, 7, 12, 0, 1, 1, 0, 4, 1, 19, 26],
    ["Joshua Anthony", 24, "DNP"],
    ["Nasir Abdulmalik", 30, 24, 6, 3, 5, 3, 4, 0, 1, 0, 1, 1, 1, 0, 0, 2, 0, 1, 1, 15, 7],
    ["Tawo Adedoyin", 45, "DNP"],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 22: Seaside Hoopers 81 - 41 Square Team - Thu 01 Oct 2026
// (The same sheet was supplied twice as two phone screenshots; identical content.)
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 22 - Seaside Hoopers vs Square Team - Thu 01 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-01T13:11:00.000Z",
  homeScore: 81, awayScore: 41,
  periods: [
    { period: 1, label: "Q1", homeScore: 28, awayScore: 12 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 10 },
    { period: 3, label: "Q3", homeScore: 15, awayScore: 9 },
    { period: 4, label: "Q4", homeScore: 22, awayScore: 10 },
  ],
  home: team("Seaside Hoopers", "SSH", { points: 81, rebounds: 48, assists: 8, turnovers: 16, fouls: 4 }, [
    // Sheet spellings -> canonical: Makanjuola Oluwasegun (#1), Chikwe Emannuel (#2 -> Chike
    // Emmanuel), Olusegun Junior (#7 -> Oluwasegun Junior), Ebenezer Timothy (#17 -> Timilehin
    // Ebenezer). Chioke Anthony and Nwata Destiny already exist (no jersey). None new.
    ["Makonjuola Oluwasegun", 1, 40, 7, 3, 12, 3, 9, 0, 3, 1, 3, 1, 4, 1, 3, 1, 0, 2, 1, 40, 0],
    ["Chike Emmanuel", 2, "DNP"],
    ["Opene Nathaniel", 5, 40, 21, 8, 11, 8, 11, 0, 0, 5, 9, 6, 3, 2, 2, 4, 0, 2, 7, 40, 27],
    ["Augustine Timothy", 6, 40, 17, 8, 16, 7, 10, 1, 6, 0, 1, 3, 7, 1, 2, 2, 0, 0, 2, 40, 19],
    ["Oluwasegun Junior", 7, 6, 4, 2, 3, 2, 3, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 9, 6],
    ["Evans Amadi", 10, "DNP"],
    ["Bright Adedeji", 11, "DNP"],
    ["Segun George", 12, 37, 20, 10, 19, 10, 17, 0, 2, 0, 1, 4, 2, 2, 5, 7, 0, 0, 1, 34, 20],
    ["Ayomide Mashebinu", 13, 33, 6, 3, 5, 3, 5, 0, 0, 0, 2, 1, 7, 2, 2, 3, 2, 0, 1, 31, 15],
    ["Timilehin Ebenezer", 17, "DNP"],
    ["Chioke Anthony", 29, "DNP"],
    ["Nwata Destiny", 99, 2, 6, 3, 5, 3, 5, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 6, 5],
  ]),
  away: team("Square Team", "STM", { points: 41, rebounds: 32, assists: 4, turnovers: 24, fouls: 13 }, [
    // Sheet spellings -> canonical: Bilal Mahmud (#2 -> Bilal M, the no-jersey player first seen
    // truncated in Game 11; also #2 in Game 19), Okeke Peter (-> Peter Okeke), Creion Okwuaza
    // (-> Creon Okwuzu), Wisdom Bassey (-> Bassey Wisdom), Ibrahim Kudus (#23 -> Qudus Ibrahim:
    // Kudus ~ Qudus, name order swapped; NOT Ibrahim Qadir, who was a separate player on the
    // same Game 10 sheet - flagged for review). None new.
    ["Bilal M", 2, 20, 0, 0, 5, 0, 4, 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 3, 0, -16, -3],
    ["Biu David", 5, 40, 16, 8, 11, 8, 11, 0, 0, 0, 0, 1, 6, 1, 9, 5, 1, 3, 2, -40, 18],
    ["Peter Okeke", 7, 40, 9, 4, 16, 4, 15, 0, 1, 1, 2, 5, 3, 1, 3, 1, 0, 4, 1, -40, 3],
    ["Creon Okwuzu", 9, 39, 6, 3, 15, 3, 12, 0, 3, 0, 0, 0, 2, 0, 3, 3, 0, 0, 1, -40, -4],
    ["Bassey Wisdom", 10, "DNP"],
    ["Qudus Ibrahim", 23, 19, 4, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 0, -24, 3],
    ["Onyedikachi Anekwe", 55, 40, 6, 3, 10, 3, 10, 0, 0, 0, 0, 3, 7, 0, 4, 2, 0, 2, 0, -40, 7],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 23: Lagos Raptors 50 - 51 LXB Surulere - Thu 01 Oct 2026
// Sheet labels the teams "LRBA" (Lagos Raptors Basketball Academy; same club as Game 19's
// "Lagos Raptors Basketball Academy") and "LXB" (LXB Surulere).
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 23 - Lagos Raptors vs LXB Surulere - Thu 01 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-01T15:25:00.000Z",
  homeScore: 50, awayScore: 51,
  periods: [
    { period: 1, label: "Q1", homeScore: 13, awayScore: 12 },
    { period: 2, label: "Q2", homeScore: 22, awayScore: 10 },
    { period: 3, label: "Q3", homeScore: 8, awayScore: 12 },
    { period: 4, label: "Q4", homeScore: 7, awayScore: 17 },
  ],
  home: team("Lagos Raptors", "LAR", { points: 50, rebounds: 26, assists: 1, turnovers: 10, fouls: 20 }, [
    // Sheet spellings -> canonical: Sopuruchukwu Emmanuelle, Neuman Ejioade (#4 = Game 19's #4),
    // Korede Damilare (#10 = Game 19's "Damilare Sowere" #10), Ajiboye Dede (#11 -> Dele
    // Ajigboye), Dennis Godwill, Tobi Ojajuni (-> Ojajuni Oluwatobi), Timmy Samuel (-> Timi
    // Samuel: flagged for review; "Timmy T" is a separate existing player).
    // Genuinely unresolved: "Ikeze Chidera" (#12, 4 min, no stats) shares "Ikeze" with Ikeze David
    // and "Chidera" with David Chidera, both existing players - ambiguous, so created as a new
    // player with no jersey (Ayomide Adeeko holds #12) rather than guessed; flagged for review.
    ["Sopuchukwu Emmanuell", 2, 15, 3, 1, 3, 1, 3, 0, 0, 1, 3, 0, 0, 0, 1, 0, 0, 5, 2, 6, -2],
    ["Farayibi Oluwatamilore", 3, 16, 6, 3, 7, 3, 7, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 2, 0, 3, 4],
    ["Neuman Ejirinade", 4, 8, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 7, 0],
    ["Worship Adele", 5, 37, 18, 8, 18, 7, 16, 1, 2, 1, 2, 2, 1, 0, 1, 0, 0, 1, 4, -4, 9],
    ["Kizito Egbejiogu", 6, 14, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, -2],
    ["Dannis Godwill", 8, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 2, 0, 0, 1],
    ["Damilare Sowere", 10, 27, 6, 3, 5, 3, 5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, -11, 5],
    ["Dele Ajigboye", 11, 32, 6, 3, 4, 3, 3, 0, 1, 0, 2, 2, 5, 1, 0, 0, 2, 4, 1, 1, 13],
    ["Ikeze Chidera", null, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 5, 0],
    ["Ayomide Adeeko", 13, 16, 2, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 0, 2, 1, 0, 2, 0, -5, 3],
    ["Ojajuni Oluwatobi", 14, "DNP"],
    ["Timi Samuel", 15, 20, 7, 3, 11, 3, 10, 0, 1, 1, 4, 2, 2, 0, 2, 0, 0, 1, 4, -5, -2],
  ]),
  away: team("LXB Surulere", "LBS", { points: 51, rebounds: 37, assists: 6, turnovers: 6, fouls: 12 }, [
    // Sheet spellings -> canonical: Joshua Sunday (-> Sunday Joshua), Sheriff Oladeji (-> Oladeji
    // Sheriff), Ifeanyi Ude (#12 -> Ifeanyi Udeli), Ahmed Momoh (-> Ahmad Momoh, no jersey since
    // Game 16), Promise T (#14 -> Promise Eze), Gaga I (#16 -> Rooseven Gaga), Segun I (#17 ->
    // Segun Victor), Toheeb Akanbi (#21 -> Adekoya Toheeb), Salisu Umaru (-> Salisu Umar), Ik K
    // (#25 -> Ik Igwe), Francis Anekwe (-> Anekwere Francis). Truncated-surname rows (Promise T,
    // Gaga I, Segun I, Toheeb Akanbi) matched on jersey + first name/surname anchor - flagged for
    // review. "Chucks A" (#15, DNP) is genuinely new; Oladeji Sheriff holds #15, so no jersey.
    ["Sunday Joshua", 2, 23, 1, 0, 1, 0, 1, 0, 0, 1, 2, 0, 2, 1, 0, 0, 0, 1, 2, -5, 2],
    ["Thomas Ayomide", 8, 16, 2, 1, 4, 1, 4, 0, 0, 0, 0, 0, 4, 2, 0, 2, 1, 1, 1, 6, 8],
    ["Oladeji Sheriff", 10, "DNP"],
    ["Ifeanyi Udeli", 12, 35, 20, 8, 14, 8, 13, 0, 1, 4, 9, 3, 4, 1, 1, 1, 0, 2, 7, 2, 17],
    ["Ahmad Momoh", 13, 35, 9, 4, 5, 4, 5, 0, 0, 1, 3, 5, 3, 1, 2, 4, 0, 1, 4, 2, 17],
    ["Promise Eze", 14, 11, 0, 0, 2, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 2, -1],
    ["Chucks A", null, "DNP"],
    ["Rooseven Gaga", 16, 15, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 2, 9, -7],
    ["Segun Victor", 17, 11, 0, 0, 1, 0, 1, 0, 0, 0, 2, 0, 3, 0, 1, 1, 0, 2, 1, -5, 0],
    ["Adekoya Toheeb", 21, 4, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -1, 1],
    ["Salisu Umar", 22, 6, 3, 0, 0, 0, 0, 0, 0, 3, 6, 0, 0, 0, 0, 0, 0, 1, 2, -6, 0],
    ["Ik Igwe", 25, "DNP"],
    ["Anekwere Francis", 29, 40, 14, 6, 11, 6, 9, 0, 2, 2, 2, 1, 3, 0, 0, 0, 0, 1, 1, 1, 13],
  ]),
}));

// ---------------------------------------------------------------------------
// Game 24: Cantonment Braves 62 - 54 White Fire - Thu 01 Oct 2026
// Sheet header spells the home team "CANTONENT BRAVES" (typo) - ingested under the existing
// "Cantonment Braves" club.
// ---------------------------------------------------------------------------
games.push(game({
  sourceLabel: "LBCL Game 24 - Cantonment Braves vs White Fire - Thu 01 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-01T17:43:00.000Z",
  homeScore: 62, awayScore: 54,
  periods: [
    { period: 1, label: "Q1", homeScore: 15, awayScore: 11 },
    { period: 2, label: "Q2", homeScore: 14, awayScore: 17 },
    { period: 3, label: "Q3", homeScore: 20, awayScore: 15 },
    { period: 4, label: "Q4", homeScore: 13, awayScore: 11 },
  ],
  home: team("Cantonment Braves", "CTB", { points: 62, rebounds: 37, assists: 8, turnovers: 10, fouls: 19 }, [
    // Sheet spellings -> canonical: Ogunyemi Seun (#4 -> Otunyemi Seun), Koko Clinton (-> Clinton
    // Koko; worn as #6 on this sheet vs #13 before - matched on the distinctive full name),
    // Adefisayo Salako (#7 -> Salako Fisayo), Otono Emmanuel (#8 -> Otowo Emmanuel), Idornjie
    // Emmanuel (#9 -> Emmanuel Idornigie, also #9 in Game 18), Gali Francis (#11 -> Eli Francis),
    // Oparaugo Iky, Kuti Babajide (#14 -> Oluwanifemi Kuti: surname + jersey only, first name
    // differs - flagged for review), Ajala David (#15 -> Ajala A).
    // "Issac Saint" (#13) is genuinely new; Clinton Koko holds #13 in the roster, so no jersey.
    ["Otunyemi Seun", 4, 24, 4, 2, 6, 2, 6, 0, 0, 0, 0, 1, 1, 2, 3, 2, 0, 2, 1, 6, 3],
    ["Agindigbadi Wasiu", 5, 18, 10, 3, 7, 2, 5, 1, 2, 3, 4, 0, 1, 1, 0, 0, 0, 1, 3, 8, 7],
    ["Clinton Koko", 6, 30, 20, 6, 12, 6, 11, 0, 1, 8, 11, 1, 4, 3, 2, 2, 0, 4, 7, 13, 19],
    ["Salako Fisayo", 7, 14, 4, 2, 4, 2, 3, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, -7, 1],
    ["Otowo Emmanuel", 8, 13, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, -1, -1],
    ["Emmanuel Idornigie", 9, 14, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 6, -1],
    ["Kayode Olakunle", 10, 5, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 1, 0, -4, 1],
    ["Eli Francis", 11, 8, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0, -1, 0],
    ["Oparaugo Ikay", 12, 19, 13, 6, 11, 6, 6, 0, 5, 1, 2, 1, 1, 0, 1, 0, 0, 1, 1, 5, 8],
    ["Issac Saint", null, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1, 2],
    ["Oluwanifemi Kuti", 14, 17, 4, 1, 4, 1, 4, 0, 0, 2, 2, 2, 5, 1, 0, 3, 0, 2, 1, 5, 12],
    ["Ajala A", 15, 28, 7, 2, 3, 2, 3, 0, 0, 3, 4, 1, 7, 0, 0, 0, 1, 3, 3, 10, 14],
  ]),
  away: team("White Fire", "WHF", { points: 54, rebounds: 28, assists: 1, turnovers: 10, fouls: 18 }, [
    // Sheet spellings -> canonical: Boluwaduro Jeboto, Debo Osinpitan (-> Debo Osipitan),
    // Madoual Fofana, Stanley Chisaemeka (#12 -> Stanley Olisaemeka), Vinni Obioma, Emmanuel
    // Ireteore (#17 -> Emmanuel Ireleore), Iyinoluwa Laditan, Ayomide Dauda (#23 -> Dauda
    // Ayomide), Negedo Joseph (existing, no jersey). None new.
    ["Boluwadoro Jeboto", 2, 21, 4, 1, 2, 1, 2, 0, 0, 2, 3, 0, 0, 0, 1, 0, 0, 0, 4, -2, 1],
    ["Debo Osipitan", 6, "DNP"],
    ["Madoud Fofana", 9, 6, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 1, 1, -5, -1],
    ["Stanley Olisaemeka", 12, 37, 6, 2, 9, 2, 8, 0, 1, 2, 3, 1, 8, 0, 1, 0, 0, 2, 4, -7, 6],
    ["Vihni Obioma", 15, 33, 6, 3, 10, 3, 9, 0, 1, 0, 0, 1, 4, 0, 2, 0, 0, 1, 0, -16, 2],
    ["Emmanuel Ireleore", 17, 15, 7, 2, 2, 0, 0, 2, 2, 1, 2, 0, 0, 0, 2, 0, 0, 3, 1, 2, 4],
    ["Iynoluwa Laditan", 19, 25, 6, 3, 6, 3, 6, 0, 0, 0, 0, 0, 3, 1, 0, 1, 0, 4, 2, -4, 8],
    ["Dauda Ayomide", 23, 33, 15, 4, 8, 4, 8, 0, 0, 7, 14, 0, 3, 0, 1, 2, 0, 3, 7, -1, 8],
    ["Negedo Joseph", 27, 26, 10, 4, 7, 2, 3, 2, 4, 0, 0, 0, 1, 0, 2, 3, 0, 4, 0, -7, 9],
  ]),
}));

// ---------------------------------------------------------------------------
// Games 25-33 (Fri 02 - Sun 04 Oct 2026). Games 26 and 28 were not supplied. Sheet start times are
// Lagos (UTC+1), converted to UTC; minutes truncated; venue unprinted -> VENUE_TBC (as before).
// All names reconciled against the live production roster (see session.md, 2026-10-07).
// ---------------------------------------------------------------------------

// Game 25 (sheet "LBCL" template): Leo Kareem Foundation 54 - 47 Ogra Hoop Kings - Fri 02 Oct, 14:34
games.push(game({
  sourceLabel: "LBCL Game 25 - Leo Kareem Foundation vs Ogra Hoop Kings - Fri 02 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-02T13:34:00.000Z",
  homeScore: 54, awayScore: 47,
  periods: [
    { period: 1, label: "Q1", homeScore: 15, awayScore: 14 },
    { period: 2, label: "Q2", homeScore: 14, awayScore: 4 },
    { period: 3, label: "Q3", homeScore: 8, awayScore: 12 },
    { period: 4, label: "Q4", homeScore: 17, awayScore: 17 },
  ],
  home: team("Leo Kareem Foundation", "LEO", { points: 54, rebounds: 50, assists: 6, turnovers: 16, fouls: 21 }, [
    // Sheet spellings -> canonical: Felix Jackson, Taiwo Ademola, Obasohan Sunday (-> Obasana Sunday,
    // moderate), Mathew Daniel, Karmal Ayanlere, Opeyemi Akinola (#11 -> Akinofa Ope, moderate),
    // Itsukwu John (-> John I, moderate), Morris Urenwoke, Divine Balogun.
    ["Jackson Felix", 4, 3, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -5, 1],
    ["Oche Nworie", 5, 31, 4, 2, 8, 2, 5, 0, 3, 0, 1, 1, 2, 3, 2, 1, 0, 2, 2, -5, 2],
    ["Tawo Ademola", 6, "DNP"],
    ["Obasana Sunday", 7, 28, 6, 2, 11, 1, 5, 1, 6, 1, 2, 2, 5, 1, 0, 4, 1, 1, 1, 8, 9],
    ["Matthew Daniel", 8, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, -7, 0],
    ["Musa Alfa", 9, 5, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, -1],
    ["Kamal Ayanlere", 10, 23, 5, 2, 8, 2, 4, 0, 4, 1, 2, 1, 5, 0, 1, 0, 0, 1, 1, 8, 3],
    ["Akinofa Ope", 11, 26, 5, 2, 7, 2, 7, 0, 0, 1, 5, 1, 5, 1, 2, 1, 1, 3, 4, 15, 3],
    ["John I", 12, 21, 16, 7, 11, 7, 11, 0, 0, 2, 5, 1, 2, 0, 2, 0, 0, 2, 5, 11, 10],
    ["Urenwoke Morrison", 13, 17, 6, 3, 6, 3, 4, 0, 2, 0, 0, 2, 1, 0, 0, 2, 0, 2, 0, 2, 8],
    ["Balogun Divine", 14, 23, 8, 3, 7, 2, 5, 1, 2, 1, 5, 2, 4, 1, 3, 0, 0, 3, 3, 12, 4],
    ["Moyin D", 15, 15, 2, 1, 3, 1, 2, 0, 1, 0, 0, 3, 1, 0, 2, 0, 0, 4, 1, -1, 2],
  ]),
  away: team("Ogra Hoop Kings", "OHK", { points: 47, rebounds: 44, assists: 3, turnovers: 15, fouls: 17 }, [
    // "Ogra Hoopers" on this sheet = Ogra Hoop Kings. Ibrahim Dal (#0, DNP) is new. "Chuka O" (#41)
    // -> Chukwu Obi (same #41 + initial as the Game 20 sheet), NOT Chuka Sampson - flagged.
    ["Ibrahim Dal", 0, "DNP"],
    ["Soluade Simi", 2, 29, 7, 3, 13, 3, 10, 0, 3, 1, 3, 0, 2, 0, 3, 1, 0, 2, 1, 3, -5],
    ["John Yashin", 3, 20, 4, 2, 3, 2, 3, 0, 0, 0, 2, 2, 1, 0, 0, 0, 0, 3, 2, 1, 4],
    ["Wunmi Adebisi", 4, 33, 7, 3, 11, 3, 9, 0, 2, 1, 4, 1, 5, 0, 0, 0, 2, 0, 2, -1, 4],
    ["Ubi Delight", 5, 22, 9, 3, 7, 3, 5, 0, 2, 3, 4, 3, 6, 1, 3, 1, 0, 4, 5, -5, 12],
    ["Anthony Uche", 7, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 5, 0],
    ["Yunusa Paul", 8, 13, 10, 3, 5, 2, 2, 1, 3, 3, 4, 1, 3, 0, 0, 0, 0, 1, 2, -4, 11],
    ["Irozuru Nathaniel", 9, 8, 2, 1, 3, 1, 3, 0, 0, 0, 2, 1, 0, 0, 0, 1, 0, 0, 3, -2, 0],
    ["Nnerive Peter", 12, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 2, 0, -8, 3],
    ["Dodeke Bibowei", 15, 4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 2, 0, 0, 1, -5, 0],
    ["Kelvin Dangiwa", 21, 30, 6, 2, 12, 2, 5, 0, 7, 2, 2, 0, 1, 2, 4, 1, 0, 3, 1, -11, -4],
    ["Chukwu Obi", 41, 16, 2, 1, 2, 1, 2, 0, 0, 0, 2, 1, 2, 0, 0, 1, 0, 2, 2, 0, 3],
  ]),
}));

// Game 25 (sheet prints the same number): Seaside Hoopers 83 - 80 LXB (OT) - Fri 02 Oct, 16:40
games.push(game({
  sourceLabel: "LBCL Game 25 - Seaside Hoopers vs LXB Surulere (OT) - Fri 02 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-02T15:40:00.000Z",
  homeScore: 83, awayScore: 80,
  periods: [
    { period: 1, label: "Q1", homeScore: 9, awayScore: 18 },
    { period: 2, label: "Q2", homeScore: 26, awayScore: 18 },
    { period: 3, label: "Q3", homeScore: 16, awayScore: 18 },
    { period: 4, label: "Q4", homeScore: 17, awayScore: 14 },
    { period: 5, label: "OT", homeScore: 15, awayScore: 12 },
  ],
  home: team("Seaside Hoopers", "SSH", { points: 83, rebounds: 24, assists: 2, turnovers: 14, fouls: 11 }, [
    // Only 5 played (45:00 each, 5 periods). "Nanukwmo Segun" (#12) -> Segun George (#12).
    ["Makonjuola Oluwasegun", 1, "DNP"],
    ["Chike Emmanuel", 2, "DNP"],
    ["Opene Nathaniel", 5, 45, 24, 8, 15, 8, 14, 0, 1, 8, 14, 2, 4, 1, 2, 1, 0, 2, 8, 3, 17],
    ["Augustine Timothy", 6, 45, 15, 7, 13, 7, 10, 0, 3, 1, 5, 0, 2, 0, 2, 2, 0, 3, 5, 3, 7],
    ["Oluwasegun Junior", 7, "DNP"],
    ["Evans Amadi", 10, "DNP"],
    ["Bright Adedeji", 11, "DNP"],
    ["Segun George", 12, 45, 20, 9, 14, 9, 13, 0, 1, 2, 4, 0, 1, 0, 6, 2, 0, 1, 6, 3, 10],
    ["Ayomide Mashebinu", 13, 45, 13, 4, 5, 4, 5, 0, 0, 5, 9, 1, 2, 0, 1, 0, 0, 4, 6, 3, 10],
    ["Timilehin Ebenezer", 17, 45, 11, 5, 7, 5, 6, 0, 1, 1, 4, 0, 6, 1, 2, 2, 0, 1, 2, 3, 13],
    ["Chioke Anthony", 29, "DNP"],
    ["Nwata Destiny", 99, "DNP"],
  ]),
  away: team("LXB Surulere", "LBS", { points: 80, rebounds: 43, assists: 6, turnovers: 22, fouls: 28 }, [
    // Ifeanyi Udeh -> Ifeanyi Udeli, Promise Ezeh -> Promise Eze, Folorunso Segun -> Florunsho Segun,
    // Igule Ikechukwu (#25) -> Ik Igwe, Chukwuka Rapheal (#28) -> Chibuere Rapheal (jersey + surname
    // only - flagged), Anekwe Francis -> Anekwere Francis.
    ["Sunday Joshua", 2, 26, 4, 2, 4, 2, 4, 0, 0, 0, 0, 1, 0, 1, 2, 4, 0, 1, 1, -4, 6],
    ["Thomas Ayomide", 8, 24, 6, 3, 3, 3, 3, 0, 0, 0, 2, 0, 2, 3, 3, 2, 1, 3, 2, 6, 9],
    ["Ifeanyi Udeli", 12, 32, 16, 6, 14, 6, 14, 0, 0, 4, 4, 6, 7, 1, 3, 2, 1, 2, 1, -4, 22],
    ["Ahmad Momoh", 13, 33, 6, 3, 6, 3, 6, 0, 0, 0, 0, 1, 4, 0, 4, 0, 1, 5, 2, 4, 5],
    ["Promise Eze", 14, 10, 4, 2, 4, 2, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, -8, 3],
    ["Oladeji Sheriff", 15, 9, 4, 2, 6, 2, 5, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, -7, 1],
    ["Rooseven Gaga", 16, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 3, -2],
    ["Florunsho Segun", 17, 12, 2, 1, 4, 1, 2, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 3, 1, 3, -2],
    ["Adekoya Toheeb", 21, 12, 10, 5, 6, 5, 6, 0, 0, 0, 0, 2, 2, 0, 3, 0, 0, 3, 0, -9, 10],
    ["Ik Igwe", 25, 11, 4, 2, 4, 2, 4, 0, 0, 0, 0, 1, 4, 1, 1, 0, 0, 2, 0, 3, 7],
    ["Chibuere Rapheal", 28, 9, 2, 1, 3, 1, 3, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 3, 1, -2, 0],
    ["Anekwere Francis", 29, 36, 22, 9, 17, 9, 16, 0, 1, 4, 5, 0, 1, 0, 4, 1, 0, 2, 3, 0, 11],
  ]),
}));

// Game 27: Campos Basketballers 75 - 40 White Fire - Fri 02 Oct, 19:09
games.push(game({
  sourceLabel: "LBCL Game 27 - Campos Basketballers vs White Fire - Fri 02 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-02T18:09:00.000Z",
  homeScore: 75, awayScore: 40,
  periods: [
    { period: 1, label: "Q1", homeScore: 19, awayScore: 11 },
    { period: 2, label: "Q2", homeScore: 18, awayScore: 9 },
    { period: 3, label: "Q3", homeScore: 18, awayScore: 3 },
    { period: 4, label: "Q4", homeScore: 20, awayScore: 17 },
  ],
  home: team("Campos Basketballers", "CPS", { points: 75, rebounds: 32, assists: 8, turnovers: 11, fouls: 17 }, [
    // Shedrack Whaton (#0) -> Whatson Shedrack; Oguh Donald -> Uzoma Donald (#3); Unachukwu Stephen
    // -> Stephen Q (#6); Muize Salami -> Muiz Salam. "Godswill Akunebe" (#12, played 22 min) is a new
    // player; Muiz Salam holds #12 in the roster, so no jersey.
    ["Whatson Shedrack", 0, 23, 10, 3, 9, 2, 4, 1, 5, 3, 6, 0, 1, 0, 1, 1, 0, 2, 5, 20, 2],
    ["Salawu Korede", 1, 25, 11, 4, 7, 2, 5, 2, 2, 1, 2, 0, 2, 3, 2, 1, 0, 1, 2, 15, 11],
    ["Uzoma Donald", 3, 22, 2, 1, 4, 1, 3, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 2, -1],
    ["Stephen Q", 6, 22, 14, 5, 8, 5, 7, 0, 1, 4, 5, 2, 2, 1, 0, 3, 0, 1, 4, 30, 18],
    ["Adesuyi Adekunle", 8, 21, 12, 5, 11, 3, 5, 2, 6, 0, 0, 2, 3, 1, 0, 2, 0, 3, 0, 18, 14],
    ["Muiz Salam", 11, "DNP"],
    ["Godswill Akunebe", null, 22, 10, 5, 13, 5, 9, 0, 4, 0, 1, 1, 1, 2, 1, 5, 0, 0, 3, 27, 9],
    ["Somto Pascal", 23, 26, 4, 2, 2, 2, 2, 0, 0, 0, 0, 2, 7, 0, 2, 2, 1, 1, 1, 27, 14],
    ["Joshua Anthony", 24, 19, 10, 4, 8, 4, 7, 0, 1, 2, 2, 3, 1, 0, 3, 1, 0, 2, 0, 31, 8],
    ["Nasir Abdulmalik", 30, 7, 2, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 5, 2, 4, 2],
    ["Okpe Matthias", 45, 7, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, -1],
  ]),
  away: team("White Fire", "WHF", { points: 40, rebounds: 33, assists: 4, turnovers: 24, fouls: 17 }, [
    // "WhiteFire" = White Fire. Bolu Jebutu -> Boluwadoro Jeboto; "Joseph Reynld" (#5) -> Joseph
    // Reginald (the Game 29 sheet's #5 "Reynald Kelechi" -> Reginald Kelechi; both probably one person
    // already split in the roster - flagged); David Clinton -> Clinton David; Madoua Fofana; Divine
    // Obioma -> Vihni Obioma; Iyin Ladita; Negede Joseph. "Okoye Faith" = exact existing spelling
    // (a separate "Okeye Faith" #13 also exists - flagged).
    ["Boluwadoro Jeboto", 2, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -10, 0],
    ["Joseph Reginald", 5, 30, 7, 3, 9, 3, 7, 0, 2, 1, 2, 0, 3, 0, 7, 1, 0, 1, 0, -30, -3],
    ["Clinton David", 8, 7, 1, 0, 0, 0, 0, 0, 0, 1, 2, 0, 2, 1, 6, 2, 0, 1, 2, -13, -1],
    ["Madoud Fofana", 9, 19, 4, 2, 3, 2, 3, 0, 0, 0, 0, 1, 2, 0, 1, 0, 0, 0, 0, -10, 5],
    ["Stanley Olisaemeka", 12, 28, 9, 4, 10, 4, 10, 0, 0, 1, 3, 2, 4, 1, 2, 2, 0, 5, 1, -20, 8],
    ["Okoye Faith", 13, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 1, 0, 0, 0, 2, 1, -19, 5],
    ["Vihni Obioma", 15, 30, 6, 3, 8, 3, 7, 0, 1, 0, 2, 3, 2, 1, 2, 0, 0, 2, 4, -22, 3],
    ["Iynoluwa Laditan", 19, 34, 7, 3, 6, 3, 5, 0, 1, 1, 3, 0, 2, 0, 1, 0, 0, 4, 4, -37, 3],
    ["Dauda Ayomide", 23, "DNP"],
    ["Negedo Joseph", 27, 22, 6, 3, 6, 3, 5, 0, 1, 0, 4, 0, 2, 0, 2, 1, 0, 1, 4, -14, 0],
  ]),
}));

// Game 29: White Fire 55 - 58 Ogra Hoop Kings - Sat 03 Oct, 11:50
games.push(game({
  sourceLabel: "LBCL Game 29 - White Fire vs Ogra Hoop Kings - Sat 03 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-03T10:50:00.000Z",
  homeScore: 55, awayScore: 58,
  periods: [
    { period: 1, label: "Q1", homeScore: 12, awayScore: 8 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 22 },
    { period: 3, label: "Q3", homeScore: 12, awayScore: 10 },
    { period: 4, label: "Q4", homeScore: 15, awayScore: 18 },
  ],
  home: team("White Fire", "WHF", { points: 55, rebounds: 54, assists: 7, turnovers: 15, fouls: 17 }, [
    // "Irekhore Emmanuel" (#17) -> Emmanuel Ireleore (the Game 24 sheet's #17). "Izundu Okwuosa"
    // (#16) is new.
    ["Boluwadoro Jeboto", 2, 23, 0, 0, 4, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -13, -4],
    ["Reginald Kelechi", 5, 27, 3, 1, 8, 1, 5, 0, 3, 1, 6, 0, 2, 3, 2, 0, 0, 5, 4, 3, -6],
    ["Debo Osipitan", 6, 16, 4, 2, 4, 2, 4, 0, 0, 0, 2, 1, 5, 1, 2, 1, 0, 2, 1, 10, 6],
    ["Stanley Olisaemeka", 12, 33, 12, 5, 18, 5, 15, 0, 3, 2, 7, 6, 8, 1, 6, 1, 2, 1, 10, -3, 6],
    ["Okoye Faith", 13, "DNP"],
    ["Vihni Obioma", 15, 30, 15, 6, 18, 5, 14, 1, 4, 2, 4, 7, 6, 0, 0, 0, 0, 2, 3, 8, 14],
    ["Izundu Okwuosa", 16, 11, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 2, 0, -4, 2],
    ["Emmanuel Ireleore", 17, 6, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, -1],
    ["Iynoluwa Laditan", 19, 25, 3, 1, 5, 1, 5, 0, 0, 1, 4, 1, 4, 2, 2, 1, 0, 2, 2, -1, 2],
    ["Dauda Ayomide", 23, 19, 16, 6, 11, 6, 10, 0, 1, 4, 4, 3, 0, 0, 1, 1, 1, 0, 2, -7, 15],
    ["Negedo Joseph", 27, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -2, 0],
  ]),
  away: team("Ogra Hoop Kings", "OHK", { points: 58, rebounds: 42, assists: 5, turnovers: 18, fouls: 23 }, [
    // "Nana Onu" (#44) -> Nana Anu (same #44 as the Game 20 sheet). "Ajana Onu" (#40, 26 min) shares
    // only the jersey with Anas Usman - created as a new player rather than merged (flagged).
    ["Ibrahim Dal", 0, 7, 5, 2, 4, 2, 4, 0, 0, 1, 2, 0, 2, 0, 0, 0, 1, 5, 1, 5, 5],
    ["Soluade Simi", 2, 9, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, -8, -2],
    ["John Yashin", 3, 16, 2, 1, 2, 1, 2, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 1, 1, 1],
    ["Wunmi Adebisi", 4, 19, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 4, 0, 6, 3],
    ["Ubi Delight", 5, 25, 4, 2, 7, 2, 6, 0, 1, 0, 1, 1, 8, 0, 3, 3, 1, 2, 2, -7, 8],
    ["Yunusa Paul", 6, 24, 10, 3, 8, 3, 6, 0, 2, 4, 6, 0, 5, 0, 0, 1, 0, 4, 4, 11, 9],
    ["Anthony Uche", 7, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    ["David Nsitem", 11, 20, 2, 0, 3, 0, 3, 0, 0, 2, 3, 0, 3, 1, 0, 2, 1, 4, 4, -7, 5],
    ["Nnerive Peter", 12, "DNP"],
    ["Dodeke Bibowei", 15, 4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0],
    ["Kelvin Dangiwa", 21, 32, 20, 8, 17, 8, 16, 0, 1, 4, 4, 2, 3, 2, 7, 0, 0, 1, 3, 9, 11],
    ["Ajana Onu", null, 26, 13, 6, 13, 5, 8, 1, 5, 0, 0, 1, 1, 1, 3, 1, 0, 1, 0, 6, 7],
    ["Nana Anu", 44, 6, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, -1, 0],
  ]),
}));

// Game 30: Square Team 37 - 103 Campos Basketballers - Sun 04 Oct, 12:10
games.push(game({
  sourceLabel: "LBCL Game 30 - Square Team vs Campos Basketballers - Sun 04 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-04T11:10:00.000Z",
  homeScore: 37, awayScore: 103,
  periods: [
    { period: 1, label: "Q1", homeScore: 9, awayScore: 26 },
    { period: 2, label: "Q2", homeScore: 13, awayScore: 23 },
    { period: 3, label: "Q3", homeScore: 6, awayScore: 30 },
    { period: 4, label: "Q4", homeScore: 9, awayScore: 24 },
  ],
  home: team("Square Team", "STM", { points: 37, rebounds: 33, assists: 10, turnovers: 43, fouls: 6 }, [
    // Okwuaze -> Creon Okwuzu; "Onyedikachi Chiemeka" (#55) -> Onyedikachi Anekwe (first name + #55,
    // surname differs - flagged).
    ["Bilal M", 2, 20, 2, 1, 5, 1, 3, 0, 2, 0, 0, 0, 2, 0, 1, 0, 0, 4, 0, -29, -1],
    ["Gideon Emmanuel", 3, 33, 1, 0, 9, 0, 5, 0, 4, 1, 2, 1, 4, 1, 8, 2, 0, 1, 4, -59, -9],
    ["Bameyi Benjamin", 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, -21, -5],
    ["Biu David", 5, 38, 8, 4, 12, 4, 11, 0, 1, 0, 0, 1, 5, 5, 15, 2, 1, 0, 0, -60, -1],
    ["Peter Okeke", 7, 37, 9, 4, 12, 4, 12, 0, 0, 1, 6, 1, 4, 0, 7, 0, 2, 0, 3, -68, -4],
    ["Creon Okwuzu", 9, 18, 4, 2, 3, 2, 2, 0, 1, 0, 2, 0, 0, 3, 2, 0, 0, 0, 1, -19, 2],
    ["Qudus Ibrahim", 23, 8, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, -13, -2],
    ["Onyedikachi Anekwe", 55, 38, 13, 5, 7, 5, 7, 0, 0, 3, 3, 0, 7, 1, 3, 2, 0, 1, 3, -61, 18],
  ]),
  away: team("Campos Basketballers", "CPS", { points: 103, rebounds: 51, assists: 29, turnovers: 15, fouls: 11 }, [
    // This sheet abbreviates names to first name + surname initial. Matched on jersey + first name:
    // "Jamelo W" (#0) -> Jamelo U (NOT Whatson Shedrack, who also wore #0 - flagged), "Donald O" ->
    // Uzoma Donald, "Stephen U" -> Stephen Q, "Adekunle A" -> Adesuyi Adekunle, "Anthony C" (#24) ->
    // Joshua Anthony (jersey only - flagged), "Nasir A" -> Nasir Abdulmalik.
    ["Jamelo U", 0, 38, 25, 11, 21, 8, 10, 3, 11, 0, 0, 2, 2, 7, 5, 4, 0, 0, 1, 60, 25],
    ["Salawu Korede", 1, 30, 5, 2, 7, 2, 5, 0, 2, 1, 2, 0, 4, 6, 3, 8, 0, 1, 1, 46, 14],
    ["Obinna Akinebu", 2, "DNP"],
    ["Uzoma Donald", 3, 28, 14, 7, 14, 7, 14, 0, 0, 0, 0, 4, 5, 4, 1, 3, 0, 1, 3, 59, 22],
    ["Stephen Q", 6, 28, 18, 8, 16, 8, 15, 0, 1, 2, 4, 3, 5, 6, 1, 7, 1, 3, 1, 43, 29],
    ["Adesuyi Adekunle", 8, 21, 17, 7, 14, 4, 6, 3, 8, 0, 0, 2, 5, 2, 2, 7, 0, 2, 0, 44, 24],
    ["Muiz Salam", 11, "DNP"],
    ["Tawo Adedoyin", 15, "DNP"],
    ["Somto Pascal", 23, "DNP"],
    ["Joshua Anthony", 24, 22, 16, 8, 15, 8, 14, 0, 1, 0, 0, 3, 4, 0, 0, 1, 1, 4, 0, 30, 18],
    ["Nasir Abdulmalik", 30, 29, 8, 4, 5, 4, 4, 0, 1, 0, 0, 3, 0, 4, 2, 2, 0, 0, 0, 48, 14],
    ["Okpe Matthias", 45, "DNP"],
  ]),
}));

// Game 31: Seaside Hoopers 52 - 75 Lagos Raptors Basketball Academy - Sun 04 Oct, 12:48
games.push(game({
  sourceLabel: "LBCL Game 31 - Seaside Hoopers vs Lagos Raptors Basketball Academy - Sun 04 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-04T11:48:00.000Z",
  homeScore: 52, awayScore: 75,
  periods: [
    { period: 1, label: "Q1", homeScore: 17, awayScore: 21 },
    { period: 2, label: "Q2", homeScore: 16, awayScore: 18 },
    { period: 3, label: "Q3", homeScore: 8, awayScore: 26 },
    { period: 4, label: "Q4", homeScore: 11, awayScore: 10 },
  ],
  home: team("Seaside Hoopers", "SSH", { points: 52, rebounds: 46, assists: 9, turnovers: 11, fouls: 5 }, [
    // "Nanakumo Segun" (#12) -> Segun George; "Obakoye Oluwadeun" (#7, DNP) -> Oluwasegun Junior.
    ["Opene Nathaniel", 5, 38, 6, 3, 9, 3, 8, 0, 1, 0, 2, 0, 2, 0, 1, 1, 0, 0, 5, -23, 0],
    ["Augustine Timothy", 6, 37, 9, 4, 15, 4, 9, 0, 6, 1, 2, 2, 3, 2, 1, 0, 0, 2, 0, -27, 3],
    ["Oluwasegun Junior", 7, "DNP"],
    ["Evans Amadi", 10, 35, 10, 4, 15, 4, 13, 0, 2, 2, 4, 8, 5, 0, 1, 0, 3, 0, 2, -14, 12],
    ["Segun George", 12, 28, 11, 5, 11, 4, 7, 1, 4, 0, 0, 1, 4, 6, 3, 4, 1, 1, 1, -25, 18],
    ["Ayomide Mashebinu", 13, 34, 9, 4, 20, 4, 19, 0, 1, 1, 3, 7, 7, 0, 0, 0, 1, 1, 4, -16, 6],
    ["Timilehin Ebenezer", 17, 25, 7, 3, 10, 3, 7, 0, 3, 1, 3, 0, 1, 1, 3, 0, 0, 1, 2, -10, -3],
  ]),
  away: team("Lagos Raptors", "LAR", { points: 75, rebounds: 60, assists: 15, turnovers: 13, fouls: 14 }, [
    // "Timmy R" (#3, 28 min, 21 pts) -> Timmy T (one letter off; flagged). Damilare Korede -> Damilare
    // Sowere (as in Game 23), Dennis Goodwill -> Dannis Godwill, "Kucky Kosiso" -> Lucky Kisiso.
    ["Sopuchukwu Emmanuell", 2, 17, 8, 3, 8, 3, 7, 0, 1, 2, 3, 0, 3, 1, 1, 0, 0, 1, 2, 4, 5],
    ["Timmy T", 3, 28, 21, 10, 16, 10, 15, 0, 1, 1, 2, 0, 4, 3, 2, 1, 0, 2, 1, 31, 20],
    ["Neuman Ejirinade", 4, 10, 4, 2, 5, 2, 5, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 1, -10, 3],
    ["Damilare Sowere", 5, 29, 13, 6, 11, 5, 10, 1, 1, 0, 0, 2, 5, 5, 1, 1, 0, 1, 1, 21, 20],
    ["Kizito Egbejiogu", 6, 10, 11, 5, 6, 4, 4, 1, 2, 0, 0, 0, 5, 0, 0, 1, 0, 1, 0, 15, 16],
    ["Dannis Godwill", 8, 2, 0, 0, 3, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, -1, 0],
    ["Ayomide Adeeko", 10, 23, 6, 3, 8, 3, 8, 0, 0, 0, 0, 4, 8, 0, 0, 2, 0, 4, 0, 15, 15],
    ["Dele Ajigboye", 11, 40, 4, 2, 10, 2, 10, 0, 0, 0, 0, 6, 6, 0, 1, 1, 3, 0, 0, 23, 11],
    ["Ojajuni Oluwatobi", 12, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    ["Farayibi Oluwatamilore", 13, 21, 2, 1, 6, 1, 4, 0, 2, 0, 0, 2, 5, 4, 5, 2, 1, 3, 0, 8, 6],
    ["David Chidera", 14, "DNP"],
    ["Lucky Kisiso", 15, 14, 6, 3, 4, 3, 4, 0, 0, 0, 0, 0, 3, 1, 0, 0, 0, 1, 0, 8, 9],
  ]),
}));

// Game 32: Leo Kareem Foundation 51 - 39 Ultra Basketball - Sun 04 Oct, 12:59
games.push(game({
  sourceLabel: "LBCL Game 32 - Leo Kareem Foundation vs Ultra Basketball - Sun 04 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-04T11:59:00.000Z",
  homeScore: 51, awayScore: 39,
  periods: [
    { period: 1, label: "Q1", homeScore: 11, awayScore: 13 },
    { period: 2, label: "Q2", homeScore: 17, awayScore: 9 },
    { period: 3, label: "Q3", homeScore: 13, awayScore: 7 },
    { period: 4, label: "Q4", homeScore: 10, awayScore: 10 },
  ],
  home: team("Leo Kareem Foundation", "LEO", { points: 51, rebounds: 55, assists: 11, turnovers: 15, fouls: 16 }, [
    ["Jackson Felix", 4, 12, 2, 1, 5, 1, 5, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 9, 2],
    ["Oche Nworie", 5, 30, 0, 0, 8, 0, 4, 0, 4, 0, 0, 0, 8, 3, 3, 1, 0, 3, 0, 4, 1],
    ["Tawo Ademola", 6, 3, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
    ["Obasana Sunday", 7, 28, 12, 4, 11, 3, 6, 1, 5, 3, 5, 1, 3, 1, 2, 2, 1, 3, 4, 3, 9],
    ["Matthew Daniel", 8, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    ["Musa Alfa", 9, 2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, -1],
    ["Kamal Ayanlere", 10, 29, 8, 3, 9, 1, 2, 2, 7, 0, 0, 2, 1, 0, 1, 0, 0, 1, 0, 7, 4],
    ["Akinofa Ope", 11, 23, 5, 1, 8, 1, 8, 0, 0, 3, 8, 1, 3, 2, 4, 1, 0, 3, 6, 3, -4],
    ["John I", 12, 24, 8, 2, 4, 2, 4, 0, 0, 4, 8, 1, 3, 1, 3, 0, 0, 0, 4, 5, 4],
    ["Urenwoke Morrison", 13, "DNP"],
    ["Balogun Divine", 14, 26, 8, 3, 6, 2, 5, 1, 1, 1, 5, 6, 5, 2, 1, 2, 0, 1, 3, 20, 15],
    ["Moyin D", 15, 11, 8, 3, 5, 3, 5, 0, 0, 2, 4, 1, 1, 1, 0, 0, 0, 4, 2, 7, 7],
  ]),
  away: team("Ultra Basketball", "UTA", { points: 39, rebounds: 40, assists: 8, turnovers: 15, fouls: 20 }, [
    // Sheet spellings as in Game 21 (Damusa Ibrahim -> Musa Ibrahim, Amir Kabir, Halim Akinyemi,
    // Munachi Okafor, Elijah Nwogo, Ebuka Elemchi, Michael Igbanesi, Tobi Ogunjobi).
    ["Benjamin Chibuzor", 0, 20, 4, 2, 10, 2, 7, 0, 3, 0, 0, 0, 1, 2, 2, 2, 0, 5, 1, 1, -1],
    ["Musa Ibrahim", 1, 34, 4, 1, 10, 0, 7, 1, 3, 1, 2, 0, 0, 2, 3, 1, 0, 2, 1, -14, -6],
    ["David Udanyi", 2, 11, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0, -7, -3],
    ["Amir Kabiru", 5, 12, 2, 1, 2, 1, 1, 0, 1, 0, 0, 0, 1, 1, 2, 0, 0, 0, 2, -11, 1],
    ["Haleem Akinyemi", 7, 23, 6, 3, 8, 3, 6, 0, 2, 0, 4, 4, 7, 0, 2, 0, 6, 3, 5, -13, 12],
    ["Muna Okafor", 8, 11, 0, 0, 3, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 3, -2],
    ["Tawo Bamidele", 9, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, -6, 2],
    ["Elijah Nwodo", 10, 24, 6, 3, 4, 3, 4, 0, 0, 0, 0, 1, 4, 0, 0, 1, 0, 3, 0, 0, 11],
    ["Ebuka Elebuchi", 11, 24, 2, 1, 2, 1, 2, 0, 0, 0, 0, 0, 4, 1, 1, 0, 0, 3, 0, -5, 5],
    ["Micheal Igbanesi", 23, 33, 13, 4, 14, 2, 6, 2, 8, 3, 5, 0, 6, 2, 2, 4, 1, 3, 3, -6, 12],
    ["Tobi Egunjobi", 32, 1, 2, 0, 1, 0, 1, 0, 0, 2, 4, 0, 0, 0, 0, 0, 0, 0, 2, 1, -1],
  ]),
}));

// Game 33: LXB Surulere 54 - 58 Cantonment Braves - Sun 04 Oct, 18:42
games.push(game({
  sourceLabel: "LBCL Game 33 - LXB Surulere vs Cantonment Braves - Sun 04 Oct 2026",
  venue: VENUE_TBC,
  scheduledAt: "2026-10-04T17:42:00.000Z",
  homeScore: 54, awayScore: 58,
  periods: [
    { period: 1, label: "Q1", homeScore: 14, awayScore: 14 },
    { period: 2, label: "Q2", homeScore: 15, awayScore: 6 },
    { period: 3, label: "Q3", homeScore: 12, awayScore: 18 },
    { period: 4, label: "Q4", homeScore: 13, awayScore: 20 },
  ],
  home: team("LXB Surulere", "LBS", { points: 54, rebounds: 57, assists: 10, turnovers: 20, fouls: 14 }, [
    // "Ik Njere" (#6) -> Njere Ikechukwu; Promise Ezennaya -> Promise Eze; Segun Folorunso ->
    // Florunsho Segun.
    ["Sunday Joshua", 2, 23, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 3, 3, 4, 2, 0, 2, 1, -6, 0],
    ["Njere Ikechukwu", 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, -3, -2],
    ["Ifeanyi Udeli", 12, 36, 12, 6, 16, 6, 13, 0, 3, 0, 1, 6, 8, 2, 2, 1, 0, 4, 1, -14, 16],
    ["Ahmad Momoh", 13, 37, 7, 3, 7, 3, 7, 0, 0, 1, 4, 3, 11, 0, 1, 0, 3, 0, 5, 0, 16],
    ["Promise Eze", 14, 27, 7, 3, 8, 3, 8, 0, 0, 1, 2, 2, 0, 0, 3, 0, 0, 2, 1, -5, 0],
    ["Oladeji Sheriff", 15, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 4, 1],
    ["Rooseven Gaga", 16, 3, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, -1],
    ["Florunsho Segun", 17, 23, 7, 2, 15, 2, 11, 0, 4, 3, 4, 3, 1, 1, 3, 1, 0, 4, 5, 0, -4],
    ["Adekoya Toheeb", 21, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, -2, 1],
    ["Salisu Umar", 22, 3, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 10, 0],
    ["Ik Igwe", 25, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0],
    ["Anekwere Francis", 29, 35, 21, 8, 23, 8, 22, 0, 1, 5, 11, 3, 4, 3, 3, 0, 0, 0, 6, -6, 7],
  ]),
  away: team("Cantonment Braves", "CTB", { points: 58, rebounds: 43, assists: 8, turnovers: 17, fouls: 20 }, [
    // Ogunyem Seun -> Otunyemi Seun, Idornije Emmanuel -> Emmanuel Idornigie, Gali Francis -> Eli
    // Francis, Uti Babajide -> Oluwanifemi Kuti (as in Game 24, flagged), "Isaac Saint" -> Issac
    // Saint (the spelling created from Game 24).
    ["Otunyemi Seun", 4, 32, 22, 9, 18, 9, 16, 0, 2, 4, 6, 0, 1, 2, 4, 3, 0, 3, 4, 9, 13],
    ["Agindigbadi Wasiu", 5, 13, 0, 0, 4, 0, 3, 0, 1, 0, 0, 0, 0, 0, 2, 2, 1, 0, 0, 8, -3],
    ["Clinton Koko", 6, "DNP"],
    ["Salako Fisayo", 7, "DNP"],
    ["Otowo Emmanuel", 8, 19, 2, 1, 2, 1, 2, 0, 0, 0, 0, 2, 3, 0, 2, 0, 0, 2, 0, -5, 4],
    ["Emmanuel Idornigie", 9, 18, 8, 4, 4, 4, 4, 0, 0, 0, 4, 0, 4, 0, 1, 3, 0, 1, 2, 6, 10],
    ["Kayode Olakunle", 10, 6, 4, 2, 5, 2, 5, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 3, 1, 3, 0],
    ["Eli Francis", 11, 16, 6, 3, 7, 3, 4, 0, 3, 0, 0, 0, 1, 2, 1, 3, 0, 2, 2, -4, 7],
    ["Oparaugo Ikay", 12, 7, 2, 1, 5, 1, 1, 0, 4, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 2, -2],
    ["Issac Saint", 13, 18, 0, 0, 7, 0, 5, 0, 2, 0, 0, 1, 1, 3, 1, 2, 0, 0, 0, 2, -1],
    ["Oluwanifemi Kuti", 14, 32, 4, 2, 6, 2, 5, 0, 1, 0, 0, 1, 15, 1, 1, 1, 0, 5, 0, -5, 17],
    ["Ajala A", 15, 34, 10, 4, 4, 4, 4, 0, 0, 2, 7, 3, 4, 0, 2, 0, 5, 4, 4, 4, 15],
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
