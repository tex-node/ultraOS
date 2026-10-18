import { NextResponse } from "next/server";
import { drainAllOrganizations } from "@/lib/data-feed/dispatcher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/cron/drain-feeds (streak v6, Prompt 1)
//
// The drain used to run only after a scoring write to an organization. That is enough for a live game but
// wrong for the cases that matter most to a partner: a subscriber that was down for a while, a retry whose
// backoff has expired, or a process that was restarted with rows still PENDING. This endpoint makes
// delivery independent of new scoring; a systemd timer calls it every 30 seconds.
//
// Auth is a shared secret in a header, not a session: cron has no cookie. Fails CLOSED - if CRON_SECRET is
// unset the route refuses everything, so a deployment that forgets the variable cannot expose an endpoint
// that anyone can use to make the server POST to partner URLs.
const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: { code: "CRON_DISABLED", message: "CRON_SECRET is not configured." } }, { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret") ?? "";
  // Constant-time-ish: compare lengths first, then every character, so a timing oracle cannot recover the
  // secret one byte at a time. Cheap to do right.
  if (provided.length !== CRON_SECRET.length || !timingSafeEqual(provided, CRON_SECRET)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bad cron secret." } }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const results = await drainAllOrganizations();
    const totals = Object.values(results).reduce(
      (sum, result) => ({
        attempted: sum.attempted + result.attempted,
        delivered: sum.delivered + result.delivered,
        retried: sum.retried + result.retried,
        gaveUp: sum.gaveUp + result.gaveUp,
      }),
      { attempted: 0, delivered: 0, retried: 0, gaveUp: 0 },
    );
    return NextResponse.json({ ok: true, organizations: Object.keys(results).length, ...totals, durationMs: Date.now() - startedAt });
  } catch (error) {
    // 500 so the timer's own logs show a failure; the outbox rows are untouched and the next tick retries.
    return NextResponse.json(
      { error: { code: "DRAIN_FAILED", message: error instanceof Error ? error.message : String(error) }, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}
