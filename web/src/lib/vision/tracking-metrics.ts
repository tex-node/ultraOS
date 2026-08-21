// Multi-Object Tracking Evaluation (G.22, Part XXIII-XXIV). Pure. Deliberately does NOT
// implement IDF1/MOTA/HOTA - Part XXIV's own instruction: "Do not implement complex metrics
// incorrectly just to have them." What's here is simpler, verifiably correct, and still real:
// track continuity, ID switches (via a ground-truth-to-track correspondence the caller supplies),
// fragmentation, and average track duration.
export type TrackSpan = { trackId: string; startVideoTimeMs: number; endVideoTimeMs: number };

// A "ground-truth identity" timeline - which real person a reviewer determined was visible over
// which video-time ranges, independent of which machine track ID(s) covered them. Comparing this
// against the machine tracks is what reveals ID switches/fragmentation; this module does not
// itself decide identity (see player-identity-constraints.ts for that).
export type GroundTruthIdentitySpan = { personLabel: string; startVideoTimeMs: number; endVideoTimeMs: number };

export type TrackingEvalResult = {
  trackCount: number;
  averageTrackDurationMs: number;
  // How many times a single ground-truth person was covered by more than one machine track in
  // sequence (a "switch") - counted per person, summed.
  idSwitches: number;
  // How many separate machine tracks existed for people who, per ground truth, were visible
  // continuously (i.e. the track dropped and picked back up under a fresh ID rather than
  // persisting) - a fragmentation is a switch where the gap between the two track spans is
  // itself covered by the same ground-truth person (no genuine occlusion/exit to explain a
  // legitimate new track).
  fragmentations: number;
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function evaluateTracking(tracks: TrackSpan[], groundTruth: GroundTruthIdentitySpan[]): TrackingEvalResult {
  const trackCount = tracks.length;
  const averageTrackDurationMs = trackCount > 0
    ? tracks.reduce((sum, t) => sum + (t.endVideoTimeMs - t.startVideoTimeMs), 0) / trackCount
    : 0;

  let idSwitches = 0;
  let fragmentations = 0;

  const byPerson = new Map<string, GroundTruthIdentitySpan[]>();
  for (const span of groundTruth) {
    const list = byPerson.get(span.personLabel) ?? [];
    list.push(span);
    byPerson.set(span.personLabel, list);
  }

  for (const [, spans] of byPerson) {
    // Every machine track whose time range overlaps ANY of this person's ground-truth spans,
    // ordered by start time - the sequence of track IDs "assigned" to this person over time.
    const coveringTracks = tracks
      .filter((t) => spans.some((s) => overlaps(t.startVideoTimeMs, t.endVideoTimeMs, s.startVideoTimeMs, s.endVideoTimeMs)))
      .sort((a, b) => a.startVideoTimeMs - b.startVideoTimeMs);

    const distinctIds = [...new Set(coveringTracks.map((t) => t.trackId))];
    if (distinctIds.length <= 1) continue;
    idSwitches += distinctIds.length - 1;

    // A switch counts as fragmentation specifically when the person's own ground-truth presence
    // was continuous across the gap between the two tracks (no real absence to explain a new ID).
    for (let i = 0; i < coveringTracks.length - 1; i++) {
      const current = coveringTracks[i];
      const next = coveringTracks[i + 1];
      if (current.trackId === next.trackId) continue;
      const gapStart = current.endVideoTimeMs;
      const gapEnd = next.startVideoTimeMs;
      const personPresentThroughoutGap = spans.some((s) => s.startVideoTimeMs <= gapStart && s.endVideoTimeMs >= gapEnd);
      if (personPresentThroughoutGap) fragmentations += 1;
    }
  }

  return { trackCount, averageTrackDurationMs, idSwitches, fragmentations };
}
