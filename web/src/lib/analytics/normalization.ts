// Small, shared math helpers used across the analytics domain layer. No React, no Prisma.

export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function percent(made: number | null, attempted: number | null): number | null {
  if (made == null || attempted == null || attempted === 0) return null;
  return (made / attempted) * 100;
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// A separation score used to rank "why they won" factors on a common scale. Percentage-point
// gaps and raw counting-stat gaps aren't directly comparable, so each factor is expressed as
// a fraction of a reasonable ceiling for that stat before ranking — not just the largest raw
// number, per the spec's explicit "normalized statistical separation" requirement.
export function normalizedSeparation(winnerValue: number, loserValue: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.abs(winnerValue - loserValue) / ceiling;
}

export function percentile(value: number, sample: number[]): number {
  if (sample.length === 0) return 50;
  const below = sample.filter((v) => v < value).length;
  return Math.round((below / sample.length) * 100);
}
