import type { ContentType } from "@/generated/prisma/enums";
import { formatNaira } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { GraphicData } from "@/lib/content-template";

export { escapeHtml, renderTemplate } from "@/lib/content-template";
export type { GraphicData } from "@/lib/content-template";

type GraphicDataInput = {
  title: string;
  kicker?: string;
  headline: string;
  subheadline?: string;
  stats?: Array<{ label: string; value: string }>;
  footer?: string;
  [key: string]: unknown;
};

export type ContentPayload = {
  competitionId: string | null;
  sourceType: string;
  variables: Record<string, string>;
  graphicData: GraphicData;
};

function ordinal(value: number) {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}TH`;
  return `${value}${value % 10 === 1 ? "ST" : value % 10 === 2 ? "ND" : value % 10 === 3 ? "RD" : "TH"}`;
}

function athleteName(athlete: { firstName: string; lastName: string }) {
  return `${athlete.firstName} ${athlete.lastName}`;
}

function clubVariables(prefix: string, club: {
  crowdChant: string | null;
  identityKeywords: string[];
  logoUrl: string | null;
  name: string;
  officialSlogan: string | null;
  shortName: string;
}) {
  return {
    [`${prefix}.name`]: club.name,
    [`${prefix}.shortName`]: club.shortName,
    [`${prefix}.logo`]: club.logoUrl ?? "",
    [`${prefix}.officialSlogan`]: club.officialSlogan ?? "",
    [`${prefix}.crowdChant`]: club.crowdChant ?? "",
    [`${prefix}.identityKeywords`]: club.identityKeywords.join(" / "),
  };
}

export async function generateClubBrandPayload(sourceId: string) {
  const club = await prisma.club.findUniqueOrThrow({
    where: { id: sourceId },
    include: { seasonClubs: { include: { division: true, season: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const division = club.seasonClubs[0]?.division.name ?? "";
  return {
    sourceType: "Club",
    variables: {
      ...clubVariables("club", club),
      division,
    },
    graphicData: {
      type: "CLUB_PROFILE",
      sourceId,
      title: club.shortName,
      headline: club.officialSlogan ?? club.name,
      subheadline: club.crowdChant ?? undefined,
      club: {
        name: club.name,
        shortName: club.shortName,
        logo: club.logoUrl,
        officialSlogan: club.officialSlogan,
        crowdChant: club.crowdChant,
        identityKeywords: club.identityKeywords,
        division,
      },
    },
  };
}

export async function generateCoachPresentationPayload(draftCoachPoolEntryId: string) {
  const entry = await prisma.draftCoachPoolEntry.findUniqueOrThrow({
    where: { id: draftCoachPoolEntryId },
    include: { staff: true, division: true },
  });
  const photo = entry.photoUrl ?? entry.staff.photoUrl ?? null;
  return {
    sourceType: "DraftCoachPoolEntry",
    variables: {
      "coach.name": entry.staff.name,
      "coach.ultraStaffId": entry.staff.ultraStaffId ?? "",
      "coach.division": entry.division.name,
    },
    graphicData: {
      type: "COACH_PROFILE",
      sourceId: draftCoachPoolEntryId,
      title: entry.staff.name,
      headline: entry.staff.name,
      subheadline: entry.division.name,
      coach: {
        name: entry.staff.name,
        ultraStaffId: entry.staff.ultraStaffId,
        photo,
        division: entry.division.name,
      },
    },
  };
}

function common(
  type: ContentType,
  sourceId: string,
  sourceType: string,
  competitionId: string | null,
  variables: Record<string, string>,
  graphicData: GraphicDataInput,
): ContentPayload {
  return {
    competitionId,
    sourceType,
    variables,
    graphicData: { type, sourceId, ...graphicData },
  };
}

export async function generateContentPayload(
  type: ContentType,
  sourceId: string,
): Promise<ContentPayload> {
  switch (type) {
    case "DRAFT_ANNOUNCEMENT": {
      const pick = await prisma.draftPick.findUniqueOrThrow({
        where: { id: sourceId },
        include: {
          draft: { include: { season: true } },
          player: { include: { athlete: true } },
          seasonClub: { include: { club: true } },
        },
      });
      const player = athleteName(pick.player.athlete);
      const club = pick.seasonClub.club.name;
      const pickOrdinal = ordinal(pick.pickNumber);
      const variables = {
        title: "Draft Pick",
        player,
        club,
        ...clubVariables("club", pick.seasonClub.club),
        pick: String(pick.pickNumber),
        pickOrdinal,
        season: pick.draft.season.name,
        draft: pick.draft.name,
      };
      return common(type, sourceId, "DraftPick", pick.draft.season.competitionId, variables, {
        title: "Draft Pick",
        kicker: `${pick.draft.season.name} Draft`,
        headline: `${club} selects ${player}`,
        subheadline: `${pickOrdinal} overall pick | Round ${pick.round}`,
        stats: [
          { label: "Pick", value: `#${pick.pickNumber}` },
          { label: "Round", value: String(pick.round) },
          { label: "Position", value: pick.player.position },
        ],
        club,
        clubBrand: clubVariables("club", pick.seasonClub.club),
        player,
        pick: pick.pickNumber,
        season: pick.draft.season.name,
      });
    }
    case "FIXTURE_ANNOUNCEMENT": {
      const fixture = await prisma.fixture.findUniqueOrThrow({
        where: { id: sourceId },
        include: {
          season: true,
          division: true,
          venue: true,
          homeSeasonClub: { include: { club: true } },
          awaySeasonClub: { include: { club: true } },
        },
      });
      const home = fixture.homeSeasonClub.club.name;
      const away = fixture.awaySeasonClub.club.name;
      const date = fixture.scheduledAt.toLocaleDateString("en-NG", {
        dateStyle: "full",
      });
      const time = fixture.scheduledAt.toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const variables = {
        title: "Fixture Release",
        home,
        away,
        ...clubVariables("homeClub", fixture.homeSeasonClub.club),
        ...clubVariables("awayClub", fixture.awaySeasonClub.club),
        date,
        time,
        venue: fixture.venue.name,
        season: fixture.season.name,
        division: fixture.division.name,
      };
      return common(type, sourceId, "Fixture", fixture.season.competitionId, variables, {
        title: "Fixture Release",
        kicker: `${fixture.season.name} | ${fixture.division.name}`,
        headline: `${home} vs ${away}`,
        subheadline: `${date} | ${time}`,
        footer: fixture.venue.name,
        home,
        away,
        homeClub: clubVariables("homeClub", fixture.homeSeasonClub.club),
        awayClub: clubVariables("awayClub", fixture.awaySeasonClub.club),
        date,
        time,
        venue: fixture.venue.name,
      });
    }
    case "RESULT_ANNOUNCEMENT":
    case "MVP_ANNOUNCEMENT": {
      const fixture = await prisma.fixture.findUniqueOrThrow({
        where: { id: sourceId },
        include: {
          season: true,
          homeSeasonClub: { include: { club: true } },
          awaySeasonClub: { include: { club: true } },
          game: {
            include: {
              playerStats: {
                orderBy: [
                  { points: "desc" },
                  { rebounds: "desc" },
                  { assists: "desc" },
                ],
                include: {
                  player: { include: { athlete: true } },
                  seasonClub: { include: { club: true } },
                },
              },
            },
          },
        },
      });
      if (fixture.status !== "FINAL") throw new Error("FIXTURE_NOT_FINAL");
      const home = fixture.homeSeasonClub.club.name;
      const away = fixture.awaySeasonClub.club.name;
      const homeWon = fixture.homeScore > fixture.awayScore;
      const winner = homeWon ? home : away;
      const loser = homeWon ? away : home;
      const winnerScore = homeWon ? fixture.homeScore : fixture.awayScore;
      const loserScore = homeWon ? fixture.awayScore : fixture.homeScore;
      const mvp = fixture.game?.playerStats[0];
      const mvpName = mvp ? athleteName(mvp.player.athlete) : "Not recorded";
      const mvpLine = mvp
        ? `${mvp.points} PTS | ${mvp.rebounds} REB | ${mvp.assists} AST`
        : "Statistics unavailable";
      const variables = {
        title: type === "RESULT_ANNOUNCEMENT" ? "Final Score" : "MVP",
        home,
        away,
        homeScore: String(fixture.homeScore),
        awayScore: String(fixture.awayScore),
        winner,
        loser,
        winnerScore: String(winnerScore),
        loserScore: String(loserScore),
        mvp: mvpName,
        mvpLine,
        season: fixture.season.name,
      };
      if (type === "MVP_ANNOUNCEMENT") {
        return common(type, sourceId, "Fixture", fixture.season.competitionId, variables, {
          title: "Player of the Game",
          kicker: `${winner} ${winnerScore}-${loserScore} ${loser}`,
          headline: mvpName,
          subheadline: mvpLine,
          stats: mvp
            ? [
                { label: "Points", value: String(mvp.points) },
                { label: "Rebounds", value: String(mvp.rebounds) },
                { label: "Assists", value: String(mvp.assists) },
              ]
            : [],
          winner,
          loser,
          winnerScore,
          loserScore,
          mvp: mvpName,
        });
      }
      return common(type, sourceId, "Fixture", fixture.season.competitionId, variables, {
        title: "Final Score",
        kicker: fixture.season.name,
        headline: `${winner} ${winnerScore}-${loserScore} ${loser}`,
        subheadline: `Player of the Game: ${mvpName}`,
        footer: mvpLine,
        winner,
        loser,
        winnerScore,
        loserScore,
        mvp: mvpName,
      });
    }
    case "STANDINGS_UPDATE": {
      const season = await prisma.season.findUniqueOrThrow({
        where: { id: sourceId },
        include: {
          standings: {
            include: {
              seasonClub: { include: { club: true, division: true } },
            },
          },
        },
      });
      const rows = [...season.standings].sort(
        (a, b) =>
          b.leaguePoints - a.leaguePoints ||
          b.won - a.won ||
          b.pointDifference - a.pointDifference ||
          b.pointsFor - a.pointsFor ||
          a.seasonClub.club.name.localeCompare(b.seasonClub.club.name),
      );
      const leader = rows[0];
      if (!leader) throw new Error("STANDINGS_EMPTY");
      const leaderName = leader.seasonClub.club.name;
      const record = `${leader.won}-${leader.lost}`;
      const table = rows
        .map(
          (row, index) =>
            `${index + 1}. ${row.seasonClub.club.name} ${row.won}-${row.lost} (${row.leaguePoints} pts)`,
        )
        .join("\n");
      const variables = {
        title: "Standings Update",
        season: season.name,
        leader: leaderName,
        record,
        table,
      };
      return common(type, sourceId, "Season", season.competitionId, variables, {
        title: "Standings Update",
        kicker: season.name,
        headline: `${leaderName} leads the table`,
        subheadline: `${record} record | ${leader.leaguePoints} league points`,
        stats: rows.slice(0, 4).map((row, index) => ({
          label: `${index + 1}. ${row.seasonClub.club.shortName}`,
          value: `${row.won}-${row.lost} | ${row.leaguePoints} pts`,
        })),
        leader: leaderName,
        record,
        standings: rows.map((row, index) => ({
          position: index + 1,
          club: row.seasonClub.club.name,
          played: row.played,
          won: row.won,
          lost: row.lost,
          pointDifference: row.pointDifference,
          leaguePoints: row.leaguePoints,
        })),
      });
    }
    case "SPONSOR_REPORT": {
      const campaign = await prisma.sponsorCampaign.findUniqueOrThrow({
        where: { id: sourceId },
        include: { event: true, product: true, promoCodes: true },
      });
      const variables = {
        title: "Sponsor Performance Report",
        sponsor: campaign.sponsorName,
        campaign: campaign.name,
        event: campaign.event?.name ?? "All events",
        product: campaign.product?.name ?? "Campaign",
        impressions: String(campaign.impressions),
        redemptions: String(campaign.redemptions),
        unitsSold: String(campaign.unitsSold),
        revenue: formatNaira(campaign.revenueKobo),
      };
      return common(type, sourceId, "SponsorCampaign", null, variables, {
        title: "Sponsor Performance",
        kicker: campaign.event?.name ?? "Ultra Sports",
        headline: campaign.sponsorName,
        subheadline: campaign.name,
        stats: [
          { label: "Impressions", value: String(campaign.impressions) },
          { label: "Redemptions", value: String(campaign.redemptions) },
          { label: "Units sold", value: String(campaign.unitsSold) },
          { label: "Revenue", value: formatNaira(campaign.revenueKobo) },
        ],
        sponsor: campaign.sponsorName,
        campaign: campaign.name,
        impressions: campaign.impressions,
        redemptions: campaign.redemptions,
        unitsSold: campaign.unitsSold,
        revenueKobo: campaign.revenueKobo,
      });
    }
    case "FAN_CLUB_REPORT": {
      const fanClub = await prisma.fanClub.findUniqueOrThrow({
        where: { id: sourceId },
        include: {
          club: { include: { sport: true } },
          memberships: true,
          reservations: {
            where: { status: "CONFIRMED" },
          },
          orders: {
            where: { paymentStatus: "PAID" },
          },
        },
      });
      const admissions = fanClub.reservations.reduce(
        (sum, reservation) => sum + reservation.quantity,
        0,
      );
      const revenueKobo = fanClub.orders.reduce(
        (sum, order) => sum + order.totalKobo,
        0,
      );
      const variables = {
        title: "Fan Club Report",
        fanClub: fanClub.name,
        club: fanClub.club.name,
        members: String(fanClub.memberships.length),
        reservations: String(fanClub.reservations.length),
        admissions: String(admissions),
        orders: String(fanClub.orders.length),
        revenue: formatNaira(revenueKobo),
      };
      return common(type, sourceId, "FanClub", null, variables, {
        title: "Fan Club Report",
        kicker: fanClub.club.name,
        headline: fanClub.name,
        subheadline: `${fanClub.memberships.length} registered members`,
        stats: [
          { label: "Reservations", value: String(fanClub.reservations.length) },
          { label: "Admissions", value: String(admissions) },
          { label: "Paid orders", value: String(fanClub.orders.length) },
          { label: "Order value", value: formatNaira(revenueKobo) },
        ],
        fanClub: fanClub.name,
        club: fanClub.club.name,
        members: fanClub.memberships.length,
        reservations: fanClub.reservations.length,
        admissions,
        orders: fanClub.orders.length,
        revenueKobo,
      });
    }
  }
}
