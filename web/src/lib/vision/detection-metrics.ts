// Person Detection Evaluation (G.22, Part XXI-XXII). Pure - IoU-based matching between
// human-annotated ground-truth boxes and detector predictions. Ground truth must come from
// manual annotation, never from the model's own predictions (Part XXI's explicit instruction) -
// this module only consumes two independent box lists, it has no way to enforce that at the type
// level, but the caller-facing naming (`groundTruthBoxes`, never `labels`) makes the intent clear.
export type Box = { x: number; y: number; width: number; height: number };

export function intersectionOverUnion(a: Box, b: Box): number {
  const ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx2 = b.x + b.width, by2 = b.y + b.height;
  const interX1 = Math.max(a.x, b.x), interY1 = Math.max(a.y, b.y);
  const interX2 = Math.min(ax2, bx2), interY2 = Math.min(ay2, by2);
  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const interArea = interWidth * interHeight;
  const unionArea = a.width * a.height + b.width * b.height - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

export type DetectionEvalResult = {
  iouThreshold: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

// Part XXII: IoU threshold is an explicit parameter, always documented in the result, never a
// hidden constant. Greedy one-to-one matching (each ground-truth box can match at most one
// prediction and vice versa), highest-IoU-first - the standard approach for this kind of
// evaluation, and simple enough to verify by hand.
export function evaluateDetections(groundTruthBoxes: Box[], predictedBoxes: Box[], iouThreshold = 0.5): DetectionEvalResult {
  const pairs: { gtIndex: number; predIndex: number; iou: number }[] = [];
  for (let g = 0; g < groundTruthBoxes.length; g++) {
    for (let p = 0; p < predictedBoxes.length; p++) {
      const iou = intersectionOverUnion(groundTruthBoxes[g], predictedBoxes[p]);
      if (iou >= iouThreshold) pairs.push({ gtIndex: g, predIndex: p, iou });
    }
  }
  pairs.sort((a, b) => b.iou - a.iou);

  const matchedGt = new Set<number>();
  const matchedPred = new Set<number>();
  for (const pair of pairs) {
    if (matchedGt.has(pair.gtIndex) || matchedPred.has(pair.predIndex)) continue;
    matchedGt.add(pair.gtIndex);
    matchedPred.add(pair.predIndex);
  }

  const truePositives = matchedGt.size;
  const falseNegatives = groundTruthBoxes.length - truePositives;
  const falsePositives = predictedBoxes.length - matchedPred.size;

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : null;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;

  return { iouThreshold, truePositives, falsePositives, falseNegatives, precision, recall, f1 };
}
