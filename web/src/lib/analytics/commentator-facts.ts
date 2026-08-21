import type { SeasonPlayerTotals } from "./league-analytics";
import type { SeasonTeamTotals } from "./season-team-totals";
import { computePlayerRanks, computeTeamRanks } from "./rank-context";
import type { RecordEntry } from "./records";
import type { PlayerMilestone, TeamMilestone } from "./milestones";

// Deterministic, traceable factual statements for broadcast/commentator use. Every fact is built
// directly from an existing canonical calculation (rank context, the record book, or the
// milestone engine) — nothing here computes a new number. Language is deliberately restrained:
// "led", "recorded", "averaged", "finished with" — never "best", "most talented", "unstoppable",
// or "future star" (see SAFE_LANGUAGE_BANNED_TERMS, enforced by a test).

export type CommentatorFactType = "PLAYER_LEADER" | "TEAM_LEADER" | "RECORD" | "MILESTONE";

export type CommentatorFact = {
  type: CommentatorFactType;
  text: string;
  subject: string;
  sourceRoute: string;
  calculation: string;
  provenance: string;
};

export const SAFE_LANGUAGE_BANNED_TERMS = ["best player", "most talented", "future star", "unstoppable", "elite", "will win", "expected to", "probability"];

export function buildPlayerLeaderFacts(allTotals: SeasonPlayerTotals[]): CommentatorFact[] {
  const facts: CommentatorFact[] = [];
  for (const player of allTotals) {
    const ranks = computePlayerRanks(player.playerId, allTotals);
    for (const r of ranks) {
      if (r.rank !== 1) continue;
      facts.push({
        type: "PLAYER_LEADER",
        text: `${player.name} led Season Zero in ${r.label.toLowerCase()}, averaging ${r.value}.`,
        subject: player.name,
        sourceRoute: `/public/players/${player.athleteId}`,
        calculation: `computePlayerRanks() — ${r.metricId}`,
        provenance: `Qualified population: ${r.totalQualified} players`,
      });
    }
  }
  return facts;
}

// clubIdBySeasonClubId maps SeasonTeamTotals.seasonClubId -> Club.id, since /public/clubs/[id]
// is keyed by the Club record, not the SeasonClub join row — this mapping only exists at the
// page/loader layer (it's a Prisma lookup), so it's passed in rather than queried here.
export function buildTeamLeaderFacts(allTotals: SeasonTeamTotals[], clubIdBySeasonClubId: Map<string, string>): CommentatorFact[] {
  const facts: CommentatorFact[] = [];
  for (const team of allTotals) {
    const ranks = computeTeamRanks(team.seasonClubId, allTotals);
    const clubId = clubIdBySeasonClubId.get(team.seasonClubId);
    for (const r of ranks) {
      if (r.rank !== 1) continue;
      facts.push({
        type: "TEAM_LEADER",
        text: `${team.name} finished Season Zero with the highest ${r.label.toLowerCase()} at ${r.value}.`,
        subject: team.name,
        sourceRoute: clubId ? `/public/clubs/${clubId}` : "/public/clubs",
        calculation: `computeTeamRanks() — ${r.metricId}`,
        provenance: `Qualified population: ${r.totalQualified} teams`,
      });
    }
  }
  return facts;
}

export function buildRecordFacts(records: RecordEntry[]): CommentatorFact[] {
  return records.map((r) => ({
    type: "RECORD",
    text: `${r.holderName} recorded the Season Zero ${r.title.toLowerCase()}: ${r.value}.`,
    subject: r.holderName,
    sourceRoute: "/public/stats/records",
    calculation: `records.ts — ${r.key}`,
    provenance: r.category,
  }));
}

export function buildPlayerMilestoneFacts(milestones: PlayerMilestone[]): CommentatorFact[] {
  return milestones.map((m) => ({
    type: "MILESTONE",
    text: `${m.playerName} achieved a ${m.label.toLowerCase()} (${m.value}) against ${m.opponentShortName}.`,
    subject: m.playerName,
    sourceRoute: `/public/fixtures/${m.fixtureId}`,
    calculation: `milestones.ts — ${m.key}`,
    provenance: "Single-game achievement",
  }));
}

export function buildTeamMilestoneFacts(milestones: TeamMilestone[]): CommentatorFact[] {
  return milestones.map((m) => ({
    type: "MILESTONE",
    text: `${m.teamName} recorded a ${m.label.toLowerCase()} (${m.value}) against ${m.opponentShortName}.`,
    subject: m.teamName,
    sourceRoute: `/public/fixtures/${m.fixtureId}`,
    calculation: `milestones.ts — ${m.key}`,
    provenance: "Single-game achievement",
  }));
}
