import type { GameAnalyticsCapability } from "@/lib/game-data-capability";
import type { LeaderboardEntry } from "../league-analytics";
import type { RecordEntry } from "../records";
import type { PlayerMilestone, TeamMilestone } from "../milestones";
import type { CardBase } from "./types";

export type CategoryLeaderCard = CardBase & { type: "CATEGORY_LEADER"; categoryLabel: string };

export function buildCategoryLeaderCard(categoryLabel: string, leader: LeaderboardEntry, photoUrl: string | null, capability: GameAnalyticsCapability): CategoryLeaderCard {
  return {
    type: "CATEGORY_LEADER",
    title: "Season Zero Leader",
    eyebrow: categoryLabel,
    subject: leader.name,
    subjectImage: photoUrl,
    club: leader.seasonClubShortName,
    categoryLabel,
    primaryMetric: { label: categoryLabel, value: leader.value },
    supportingMetrics: [],
    rankContext: "#1 Season Zero",
    provenance: { source: "buildPlayerLeaderboard()", qualification: "QUALIFIED entries only" },
    capability,
  };
}

export type RecordCard = CardBase & { type: "RECORD" };

export function buildRecordCard(record: RecordEntry, capability: GameAnalyticsCapability): RecordCard {
  return {
    type: "RECORD",
    title: "Season Zero Record",
    eyebrow: record.title,
    subject: record.holderName,
    subjectImage: null,
    club: record.holderClubShortName || null,
    primaryMetric: { label: record.title, value: record.value },
    supportingMetrics: [{ label: "Context", value: record.context }],
    rankContext: null,
    provenance: { source: "records.ts (Season Zero Record Book)", qualification: record.category },
    capability,
  };
}

export type MilestoneCard = CardBase & { type: "MILESTONE" };

export function buildPlayerMilestoneCard(m: PlayerMilestone, capability: GameAnalyticsCapability): MilestoneCard {
  return {
    type: "MILESTONE",
    title: "Milestone",
    eyebrow: m.label,
    subject: m.playerName,
    subjectImage: null,
    club: m.seasonClubShortName,
    primaryMetric: { label: m.label, value: m.value },
    supportingMetrics: [{ label: "Opponent", value: m.opponentShortName }],
    rankContext: null,
    provenance: { source: "milestones.ts", qualification: "single-game achievement" },
    capability,
  };
}

export function buildTeamMilestoneCard(m: TeamMilestone, capability: GameAnalyticsCapability): MilestoneCard {
  return {
    type: "MILESTONE",
    title: "Milestone",
    eyebrow: m.label,
    subject: m.teamName,
    subjectImage: null,
    club: m.teamShortName,
    primaryMetric: { label: m.label, value: m.value },
    supportingMetrics: [{ label: "Opponent", value: m.opponentShortName }],
    rankContext: null,
    provenance: { source: "milestones.ts", qualification: "single-game achievement" },
    capability,
  };
}
