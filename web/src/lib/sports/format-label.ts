// Human-readable description of HOW a particular match is played (streak v8, Prompt 1).
//
// `describeSport(definition).formatSummary` describes the SPORT's default, which is what the tournament page
// wants. A live console needs the MATCH's rules: the same sport can run a best-of-5 league and a best-of-3
// cup, and the scoring engine already honours the season RuleSet (streak v7). This module turns the resolved
// rule values into the one line an operator reads at the top of the console, so the label and the engine can
// no longer disagree.

import type { SportDefinition } from "./types";
import { applyRuleValues, type RuleValue } from "./rule-values";
import { tennisConfig } from "./tennis-scoring";
import { setScoringConfig } from "./set-scoring";

export function matchFormatLabel(definition: SportDefinition, values: Record<string, RuleValue>): string {
  const effective = applyRuleValues(definition, values);
  const structure = effective.structure;

  // Tennis: sets to win, games per set, and whether a tiebreak decides 6-6.
  const tennis = tennisConfig(effective);
  if (tennis) {
    const tiebreak = tennis.tiebreakEnabled ? " · tiebreak at 6-6" : "";
    return `${tennis.setsToWin} sets to win · ${tennis.gamesPerSet} games per set${tiebreak}`;
  }

  // Volleyball / table tennis: rally points to win a set, sets to win the match.
  const sets = setScoringConfig(effective);
  if (sets) {
    return `${sets.periodsToWin} sets to win · ${sets.pointsToWinPeriod} points per set`;
  }

  if (definition.scoring.unit === "goal") return "No clock · goals decide";
  if (definition.scoring.unit === "run") return `${structure.periodCount} innings`;

  if (structure.periodDurationSeconds > 0) {
    const minutes = Math.round(structure.periodDurationSeconds / 60);
    return `${structure.periodCount} × ${minutes} min`;
  }
  return `${structure.periodCount} periods`;
}
