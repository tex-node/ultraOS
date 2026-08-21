// Spatial Player Metrics (G.22, Part XXXIV-XXXVII, LV). Pure - derives distance/speed/average
// position ONLY from already-filtered trajectory samples (trajectory-filtering.ts). Every result
// carries a quality label; nothing here is shown as unqualified fact (Part LV: "do not show
// false precision").
import type { RawSample } from "./trajectory-filtering";

export type MetricQuality = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";

export type DistanceResult = { distanceUnits: number; quality: MetricQuality; sampleCount: number };

// Quality is a function of sample density, not just count - a handful of samples spread across
// several minutes says much less than the same count packed into 30 seconds. minSamplesPerMinute
// thresholds are documented starting points (Part XXXIV asks only that thresholds be documented,
// not empirically perfect - no real filtered trajectory has ever been produced in this
// environment to calibrate them against).
function densityQuality(sampleCount: number, durationMs: number): MetricQuality {
  if (sampleCount < 2 || durationMs <= 0) return "INSUFFICIENT_DATA";
  const samplesPerMinute = sampleCount / (durationMs / 60_000);
  if (samplesPerMinute >= 60) return "HIGH";
  if (samplesPerMinute >= 20) return "MEDIUM";
  return "LOW";
}

export function computeDistanceCovered(filteredSamples: RawSample[]): DistanceResult {
  const sorted = [...filteredSamples].sort((a, b) => a.videoTimeMs - b.videoTimeMs);
  if (sorted.length < 2) return { distanceUnits: 0, quality: "INSUFFICIENT_DATA", sampleCount: sorted.length };
  let distance = 0;
  for (let i = 1; i < sorted.length; i++) {
    distance += Math.hypot(sorted[i].courtX - sorted[i - 1].courtX, sorted[i].courtY - sorted[i - 1].courtY);
  }
  const durationMs = sorted[sorted.length - 1].videoTimeMs - sorted[0].videoTimeMs;
  return { distanceUnits: distance, quality: densityQuality(sorted.length, durationMs), sampleCount: sorted.length };
}

export type SpeedResult = { instantaneousUnitsPerSecond: number; quality: MetricQuality };

// Instantaneous speed between two consecutive FILTERED samples. Sanity-checked against the same
// plausibility ceiling trajectory-filtering.ts already enforces on raw data - if a filtered pair
// still implies an impossible speed (shouldn't happen if filtering ran first, but this function
// makes no assumption about its caller), it's reported as LOW quality rather than displayed as
// fact (Part XXXV: "flag rather than display").
export function computeInstantaneousSpeed(a: RawSample, b: RawSample, maxPlausibleSpeed: number): SpeedResult {
  const dtSeconds = (b.videoTimeMs - a.videoTimeMs) / 1000;
  if (dtSeconds <= 0) return { instantaneousUnitsPerSecond: 0, quality: "INSUFFICIENT_DATA" };
  const speed = Math.hypot(b.courtX - a.courtX, b.courtY - a.courtY) / dtSeconds;
  return { instantaneousUnitsPerSecond: speed, quality: speed > maxPlausibleSpeed ? "LOW" : "HIGH" };
}

export type AveragePositionResult = { averageCourtX: number; averageCourtY: number; quality: MetricQuality; sampleCount: number };

export function computeAveragePosition(filteredSamples: RawSample[]): AveragePositionResult {
  if (filteredSamples.length === 0) return { averageCourtX: 0, averageCourtY: 0, quality: "INSUFFICIENT_DATA", sampleCount: 0 };
  const sorted = [...filteredSamples].sort((a, b) => a.videoTimeMs - b.videoTimeMs);
  const durationMs = sorted[sorted.length - 1].videoTimeMs - sorted[0].videoTimeMs;
  const averageCourtX = filteredSamples.reduce((sum, s) => sum + s.courtX, 0) / filteredSamples.length;
  const averageCourtY = filteredSamples.reduce((sum, s) => sum + s.courtY, 0) / filteredSamples.length;
  return { averageCourtX, averageCourtY, quality: densityQuality(filteredSamples.length, durationMs), sampleCount: filteredSamples.length };
}

// Zone occupancy (Part XXXVI) - reuses classifyCourtZone() from court-zones.ts, which honestly
// returns UNAVAILABLE for every zone today (no real court geometry exists - see
// COURT_CALIBRATION.md). This function is the real, callable aggregator a future track can use
// the moment classifyCourtZone() actually classifies something; it is not itself blocked, its
// one dependency is.
export type ZoneOccupancyResult = { occupancyMs: Record<string, number>; unavailableMs: number };

export function computeZoneOccupancy(
  filteredSamples: RawSample[],
  classify: (courtX: number, courtY: number) => { zone: string | null },
): ZoneOccupancyResult {
  const sorted = [...filteredSamples].sort((a, b) => a.videoTimeMs - b.videoTimeMs);
  const occupancyMs: Record<string, number> = {};
  let unavailableMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dtMs = sorted[i].videoTimeMs - sorted[i - 1].videoTimeMs;
    const { zone } = classify(sorted[i - 1].courtX, sorted[i - 1].courtY);
    if (zone === null) unavailableMs += dtMs;
    else occupancyMs[zone] = (occupancyMs[zone] ?? 0) + dtMs;
  }
  return { occupancyMs, unavailableMs };
}
