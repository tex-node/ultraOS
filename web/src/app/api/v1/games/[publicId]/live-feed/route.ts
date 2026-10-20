import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { loadPublicGame } from "@/lib/api-v1/game-loader";
import { getSportDefinition } from "@/lib/sports/registry";
import { winProbabilityForGame } from "@/lib/analytics/win-probability-context";
import type { LiveGameSnapshotEventV2 } from "@/lib/live-game-snapshot-v2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/games/[publicId]/live-feed (streak v5, Prompt 2)
//
// Built for an odds provider, not for a human: short keys, no player names, no club objects, no
// capabilities prose - the whole point is a small body that can be polled at a high rate. It is deliberately
// a DIFFERENT shape from /snapshot: that one is a display contract, this one is a wire contract, and merging
// them would force one audience to pay for the other's fields.
//
// Honesty rules inherited from the rest of api/v1:
//   - a BOX_SCORE_ONLY game reports `e: null` (no event history was ever captured) rather than an empty
//     array, which would claim "nothing happened";
//   - the clock is the honest one (null/`frozen` semantics come from the model, never a fake ticking value).
//
// Poll cost: one query for the game, one for the last events (only when the game has event-level data).
type LiveFeedEvent = { q: number; p: number; c: number; t: string; pts: number; side: "h" | "a" | null };

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const loaded = await loadPublicGame(publicId);
    if (!loaded) return apiError("GAME_NOT_FOUND", "No game found for this id.");
    const { fixture, model } = loaded;
    const generatedAt = new Date().toISOString();

    // Win probability (streak v12, Prompt 2): the same pure model the feed emits, computed from the same state, so a
    // partner cannot get a different number by polling instead of subscribing. `wpm` names the model.
    const definition = getSportDefinition(fixture.division.competition.sport.slug);
    const probability = definition
      ? winProbabilityForGame({
          definition,
          status: model.status,
          homeScore: model.score.home,
          awayScore: model.score.away,
          period: model.period,
          clockSecondsRemaining: model.clock?.remainingSeconds ?? null,
        })
      : null;

    const events: LiveGameSnapshotEventV2[] | null =
      model.dataCapability === "BOX_SCORE_ONLY"
        ? null
        : model.latestEvents
            .filter((event) => event.status === "ACTIVE")
            .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
            .slice(-5);

    const compact: {
      v: 1;
      gid: string;
      fid: string;
      st: string;
      s: [number, number];
      p: number;
      pl: string | null;
      c: number | null;
      cap: string;
      t: string;
      e: LiveFeedEvent[] | null;
      wp: [number, number] | null;
      wpm: string | null;
    } = {
      v: 1,
      gid: fixture.game!.id,
      fid: fixture.id,
      st: model.status,
      s: [model.score.home, model.score.away],
      p: model.period,
      pl: model.periodLabel ?? null,
      c: model.clock?.remainingSeconds ?? null,
      cap: model.dataCapability,
      t: generatedAt,
      wp: probability ? [probability.home, probability.away] : null,
      wpm: probability ? probability.method : null,
      e:
        events === null
          ? null
          : events.map((event) => ({
              q: event.sequenceNumber ?? 0,
              p: event.period,
              c: event.clockSeconds,
              t: event.eventType,
              pts: event.points ?? 0,
              side: event.seasonClubId === model.teams.home.seasonClubId ? "h" : event.seasonClubId === model.teams.away.seasonClubId ? "a" : null,
            })),
    };

    // `t` is the server time the body was produced; a partner should treat it as the staleness clock, not as
    // the event time (`e[].c`/`e[].p` are the game clock of each event).
    return NextResponse.json(compact, { headers: { "Cache-Control": "no-store" } });
  });
}
