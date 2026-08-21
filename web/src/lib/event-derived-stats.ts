// Canonical event-derived statistics engine (G.16, Parts V-VIII). Pure, deterministic reducer
// that converts an ordered list of ACTIVE statistician GameEvent rows into PlayerStat/TeamStat-
// shaped totals. This is the "DERIVE EVERYTHING ELSE" half of the track's central principle -
// CAPTURE ONCE. VERIFY ONCE. DERIVE EVERYTHING ELSE - so no basketball math is reinvented here:
// every number comes directly from what a real event already recorded (points, basePointValue,
// isUltraTime), never re-derived from a different assumption.
//
// Authority model (Part V): the Fixture score (scorer) remains OFFICIAL SCORE authority. This
// engine derives OFFICIAL STATISTICAL truth from the statistician's own ledger - a distinct,
// comparable value, never silently merged with the scorer's score (see reconciliation.ts).
// PlayerStat/TeamStat become DERIVED CANONICAL SNAPSHOTS only once verified (see
// game-stat-materialization.ts), not a second independently-maintained truth.
//
// FGM/FGA definition (Part VI, explicit per the track's own recommendation): a 4PT shot is a
// field goal like any other make/miss that isn't a free throw. FGM = 2PM + 3PM + 4PM, FGA =
// 2PA + 3PA + 4PA. This matches how PlayerStat.fieldGoalsMade/Attempted is already used
// elsewhere in this codebase (Season Zero FIBA imports never separately report a 4PT category,
// so their FGM/FGA already implicitly follow this same "every non-free-throw make counts"
// convention).
//
// PTS is summed directly from each event's persisted `points` field (already the effective,
// Ultra-Time-multiplied value at write time - see ultra-scoring-engine.ts's scoreShot()) -
// never recomputed as `1*FTM + 2*2PM + 3*3PM + 4*4PM`, which would silently drop the Ultra Time
// multiplier. A 4PT make during Ultra Time contributes 4PM+=1, 4PA+=1, FGM+=1, FGA+=1, but
// PTS+=8 - the whole point of keeping `points` and `basePointValue` as separate fields.

export type DerivableEventType =
  | "SHOT_MADE"
  | "SHOT_MISSED"
  | "FREE_THROW_MADE"
  | "FREE_THROW_MISSED"
  | "OFFENSIVE_REBOUND"
  | "DEFENSIVE_REBOUND"
  | "ASSIST"
  | "STEAL"
  | "BLOCK"
  | "TURNOVER"
  | "FOUL";

export type DerivableEvent = {
  eventType: string;
  status: "ACTIVE" | "VOIDED" | "CORRECTED" | "SUPERSEDED";
  seasonClubId: string | null;
  playerId: string | null;
  points: number | null;
  basePointValue: number | null;
  isUltraTime: boolean;
};

export type DerivedPlayerStats = {
  playerId: string;
  seasonClubId: string;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  twoPointsMade: number;
  twoPointsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  fourPointsMade: number;
  fourPointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  ultraTimePoints: number;
  ultraTimeFieldGoalsMade: number;
  ultraTimeFieldGoalsAttempted: number;
};

// Exported so a materialization rebuild can produce an explicit all-zero row for a player whose
// every statistician event has since been voided/corrected away - a real "0," not a missing row
// left stale from a previous rebuild (see game-stat-materialization in stats-actions.ts).
export function emptyPlayerStats(playerId: string, seasonClubId: string): DerivedPlayerStats {
  return {
    playerId, seasonClubId,
    points: 0,
    fieldGoalsMade: 0, fieldGoalsAttempted: 0,
    twoPointsMade: 0, twoPointsAttempted: 0,
    threePointsMade: 0, threePointsAttempted: 0,
    fourPointsMade: 0, fourPointsAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0,
    offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0,
    assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
    ultraTimePoints: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0,
  };
}

// Only ACTIVE events count - VOIDED/CORRECTED/SUPERSEDED are excluded by construction, the same
// replay invariant replayScore() already relies on for the score ledger (see
// ultra-scoring-engine.ts). Order doesn't affect the result (a pure sum), but callers should
// still pass events in sequenceNumber order for a stable, auditable derivation trace.
export function derivePlayerStats(events: DerivableEvent[]): Map<string, DerivedPlayerStats> {
  const byPlayer = new Map<string, DerivedPlayerStats>();

  for (const event of events) {
    if (event.status !== "ACTIVE") continue;
    if (!event.playerId || !event.seasonClubId) continue;
    const row = byPlayer.get(event.playerId) ?? emptyPlayerStats(event.playerId, event.seasonClubId);

    switch (event.eventType as DerivableEventType) {
      case "SHOT_MADE":
      case "SHOT_MISSED":
      case "FREE_THROW_MADE":
      case "FREE_THROW_MISSED": {
        const made = event.eventType === "SHOT_MADE" || event.eventType === "FREE_THROW_MADE";
        const shotValue = event.basePointValue;
        if (shotValue === null) break;
        const isFieldGoal = shotValue >= 2;
        if (isFieldGoal) {
          row.fieldGoalsAttempted += 1;
          if (made) row.fieldGoalsMade += 1;
        }
        if (shotValue === 1) {
          row.freeThrowsAttempted += 1;
          if (made) row.freeThrowsMade += 1;
        } else if (shotValue === 2) {
          row.twoPointsAttempted += 1;
          if (made) row.twoPointsMade += 1;
        } else if (shotValue === 3) {
          row.threePointsAttempted += 1;
          if (made) row.threePointsMade += 1;
        } else if (shotValue === 4) {
          row.fourPointsAttempted += 1;
          if (made) row.fourPointsMade += 1;
        }
        if (made) {
          row.points += event.points ?? 0;
          if (event.isUltraTime) {
            row.ultraTimePoints += event.points ?? 0;
            if (isFieldGoal) row.ultraTimeFieldGoalsMade += 1;
          }
        }
        if (event.isUltraTime && isFieldGoal) row.ultraTimeFieldGoalsAttempted += 1;
        break;
      }
      case "OFFENSIVE_REBOUND":
        row.offensiveRebounds += 1;
        row.rebounds += 1;
        break;
      case "DEFENSIVE_REBOUND":
        row.defensiveRebounds += 1;
        row.rebounds += 1;
        break;
      case "ASSIST":
        row.assists += 1;
        break;
      case "STEAL":
        row.steals += 1;
        break;
      case "BLOCK":
        row.blocks += 1;
        break;
      case "TURNOVER":
        row.turnovers += 1;
        break;
      case "FOUL":
        row.fouls += 1;
        break;
      default:
        break; // SUBSTITUTION and any non-statistical event type contribute nothing here.
    }

    byPlayer.set(event.playerId, row);
  }

  return byPlayer;
}

export type DerivedTeamStats = {
  seasonClubId: string;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  twoPointsMade: number;
  twoPointsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  fourPointsMade: number;
  fourPointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fouls: number;
  ultraTimePointsFor: number;
};

export function emptyTeamStats(seasonClubId: string): DerivedTeamStats {
  return {
    seasonClubId,
    points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
    twoPointsMade: 0, twoPointsAttempted: 0,
    threePointsMade: 0, threePointsAttempted: 0,
    fourPointsMade: 0, fourPointsAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0,
    offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0,
    assists: 0, turnovers: 0, fouls: 0, ultraTimePointsFor: 0,
  };
}

// Team totals = sum(player totals), grouped by seasonClubId - never independently recomputed
// from the raw event list (Part VII: "Do not independently compute the same statistic two
// different ways"). Takes the already-derived player map so both engines can never drift.
export function deriveTeamStats(playerStats: Map<string, DerivedPlayerStats>): Map<string, DerivedTeamStats> {
  const byTeam = new Map<string, DerivedTeamStats>();

  for (const player of playerStats.values()) {
    const team = byTeam.get(player.seasonClubId) ?? emptyTeamStats(player.seasonClubId);
    team.points += player.points;
    team.fieldGoalsMade += player.fieldGoalsMade;
    team.fieldGoalsAttempted += player.fieldGoalsAttempted;
    team.twoPointsMade += player.twoPointsMade;
    team.twoPointsAttempted += player.twoPointsAttempted;
    team.threePointsMade += player.threePointsMade;
    team.threePointsAttempted += player.threePointsAttempted;
    team.fourPointsMade += player.fourPointsMade;
    team.fourPointsAttempted += player.fourPointsAttempted;
    team.freeThrowsMade += player.freeThrowsMade;
    team.freeThrowsAttempted += player.freeThrowsAttempted;
    team.offensiveRebounds += player.offensiveRebounds;
    team.defensiveRebounds += player.defensiveRebounds;
    team.rebounds += player.rebounds;
    team.assists += player.assists;
    team.turnovers += player.turnovers;
    team.fouls += player.fouls;
    team.ultraTimePointsFor += player.ultraTimePoints;
    byTeam.set(player.seasonClubId, team);
  }

  return byTeam;
}

// Sum of derived team points, keyed by seasonClubId - the "statistical score" side of
// reconciliation.ts, expressed in the same terms as the rest of this engine (so reconciliation
// and materialization can never derive the score two different ways either).
export function deriveTeamScore(teamStats: Map<string, DerivedTeamStats>, seasonClubId: string): number {
  return teamStats.get(seasonClubId)?.points ?? 0;
}
