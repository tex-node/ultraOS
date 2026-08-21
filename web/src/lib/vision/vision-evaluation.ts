// Ground-Truth Evaluation (G.21, Part XXIX-XXXIII). Pure functions - canonical GameEvents are
// ground truth, VisionObservations are predictions/candidates. Task-specific: this module never
// produces one universal "VISION ACCURACY = 92%" figure (Part XXIX's own explicit prohibition) -
// each task gets its own precision/recall/F1, computed only when that task was actually
// evaluated (Part XXX: "only calculate metrics for tasks actually implemented").
export type MatchOutcome = {
  // A ground-truth event this evaluation considered.
  groundTruthId: string;
  // The vision observation matched to it, if any survived review as a true positive.
  matchedObservationId: string | null;
};

export type UnmatchedObservation = { observationId: string };

export type EvaluationInput = {
  task: string;
  // Every canonical event in scope for this task, each with the observation matched to it (or
  // null if nothing matched - a false negative).
  outcomes: MatchOutcome[];
  // Every vision observation of this task type that did NOT get matched to any canonical event -
  // a false positive.
  unmatchedObservations: UnmatchedObservation[];
};

export type EvaluationReport = {
  task: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

// Part XXXI: true positive = a canonical event with a reviewed, confirmed matching observation.
// False negative = a canonical event with no matching observation at all. False positive = a
// vision observation of this task's type with no canonical event it corresponds to. This
// function does not decide WHAT counts as a match (that's vision-match-confidence.ts + human
// review) - it only aggregates decisions already made.
export function evaluateTask(input: EvaluationInput): EvaluationReport {
  const truePositives = input.outcomes.filter((o) => o.matchedObservationId !== null).length;
  const falseNegatives = input.outcomes.filter((o) => o.matchedObservationId === null).length;
  const falsePositives = input.unmatchedObservations.length;

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : null;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;

  return { task: input.task, truePositives, falsePositives, falseNegatives, precision, recall, f1 };
}

export type TemporalErrorStats = { meanMs: number; medianMs: number; maxMs: number; sampleCount: number };

// Temporal error (Part XXIX/XXXI) - only over genuine true positives (an unmatched event has no
// temporal error to report; forcing one to 0 or excluding it silently would both be dishonest).
export function computeTemporalErrorStats(temporalErrorsMs: number[]): TemporalErrorStats | null {
  if (temporalErrorsMs.length === 0) return null;
  const abs = temporalErrorsMs.map(Math.abs).sort((a, b) => a - b);
  const mean = abs.reduce((sum, v) => sum + v, 0) / abs.length;
  const median = abs[Math.floor(abs.length / 2)];
  return { meanMs: mean, medianMs: median, maxMs: abs[abs.length - 1], sampleCount: abs.length };
}

export type AttributionAccuracy = { correct: number; incorrect: number; accuracy: number | null };

// Player/team attribution accuracy (Part XXIX) - only meaningful over true positives (there is
// no "player attribution" to score for an event with no matched observation at all).
export function computeAttributionAccuracy(matches: { correct: boolean }[]): AttributionAccuracy {
  const correct = matches.filter((m) => m.correct).length;
  const incorrect = matches.length - correct;
  return { correct, incorrect, accuracy: matches.length > 0 ? correct / matches.length : null };
}
