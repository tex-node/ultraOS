import { NextResponse } from "next/server";
import { withOrganizationContext } from "@/lib/tenant-context";
import { verifyAgentToken } from "@/lib/desktop/agent-proof";

export const dynamic = "force-dynamic";

// Server-side vision sync for the desktop app (Prompt 5c-i).
//
// AUTH, AND WHY IT IS THE TOKEN AND NOT THE BODY. The desktop agent signs its own bearer token with AGENT_SECRET; this route
// verifies that signature and reads `orgId` and `userId` out of it. Any `organizationId` in the request body is IGNORED - and if
// one is present and disagrees with the token, the request is REJECTED rather than quietly scoped, because silently accepting a
// foreign org would hide a tenancy bug instead of surfacing it.
//
// Why the token can be trusted here: the agent only issues it after verifying a proof that this server signed for a specific
// session. So the org in the token is the org the user was signed into when the desktop paired.
//
// REFERENCES MUST BE IN SCOPE. `gameVideoId` and `analysisRunId` are looked up inside withOrganizationContext, so RLS makes a
// foreign-org id invisible and the insert fails the same way a missing id would. That is deliberate: a 404 for "not yours" leaks
// less than a 403 that confirms existence.

const MAX_BATCH = 500;

type ObservationInput = {
  id: string;
  videoTimeMs: number;
  videoTimeEndMs?: number | null;
  observationType: string;
  boundingBox?: unknown;
  courtX?: number | null;
  courtY?: number | null;
  teamCandidateSeasonClubId?: string | null;
  playerCandidatePlayerId?: string | null;
  // Required by the schema: a detection without a confidence is not a measurement. The sidecar contract mandates it.
  confidence: number;
  trackId?: string | null;
};

export async function POST(request: Request) {
  // 1. Verify the agent token. No session cookie is involved: the agent is not a browser.
  const token = request.headers.get("x-ultraos-token");
  if (!token) return NextResponse.json({ error: "missing agent token" }, { status: 401 });

  const claims = verifyAgentToken(token);
  if (!claims) return NextResponse.json({ error: "invalid agent token" }, { status: 401 });
  if (!claims.orgId) return NextResponse.json({ error: "agent token has no organization" }, { status: 401 });

  // 2. Parse the body, and refuse a body that names a different org.
  let body: { observations?: ObservationInput[]; gameVideoId?: string; analysisRunId?: string; organizationId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.organizationId && body.organizationId !== claims.orgId) {
    console.warn(
      `vision sync: token org ${claims.orgId} != body org ${body.organizationId} (user ${claims.userId}) - rejected`,
    );
    return NextResponse.json({ error: "organizationId does not match the agent token" }, { status: 400 });
  }
  if (!body.gameVideoId || !body.analysisRunId) {
    return NextResponse.json({ error: "gameVideoId and analysisRunId are required" }, { status: 400 });
  }
  const observations = Array.isArray(body.observations) ? body.observations.slice(0, MAX_BATCH) : [];
  if (observations.length === 0) {
    return NextResponse.json({ accepted: 0, rejected: 0, rejectedReasons: [] });
  }

  const orgId = claims.orgId;
  const gameVideoId = body.gameVideoId;
  const analysisRunId = body.analysisRunId;

  try {
    return await withOrganizationContext(orgId, async (tx) => {
      // Scoped lookups: a foreign-org id is invisible here, so this is the tenancy check, not an extra one.
      const video = await tx.gameVideo.findUnique({ where: { id: gameVideoId }, select: { id: true } });
      const run = await tx.visionAnalysisRun.findUnique({ where: { id: analysisRunId }, select: { id: true } });
      if (!video || !run) {
        return NextResponse.json({ error: "gameVideoId or analysisRunId not found in this organization" }, { status: 404 });
      }

      const rejectedReasons: string[] = [];
      const rows = observations.map((observation) => ({
        id: observation.id,
        organizationId: orgId,
        analysisRunId,
        gameVideoId,
        videoTimeMs: observation.videoTimeMs,
        videoTimeEndMs: observation.videoTimeEndMs ?? null,
        observationType: observation.observationType as never,
        boundingBox: (observation.boundingBox ?? null) as never,
        courtX: observation.courtX ?? null,
        courtY: observation.courtY ?? null,
        teamCandidateSeasonClubId: observation.teamCandidateSeasonClubId ?? null,
        playerCandidatePlayerId: observation.playerCandidatePlayerId ?? null,
        confidence: observation.confidence,
        trackId: observation.trackId ?? null,
      }));

      // skipDuplicates is `ON CONFLICT DO NOTHING`: replaying the same batch is safe and reports zero accepted.
      const inserted = await tx.visionObservation.createMany({ data: rows, skipDuplicates: true });
      const accepted = inserted.count;

      // A duplicate is neither accepted nor rejected - it is already there, which is the point of an idempotent endpoint. Counting
      // it as "rejected" would make a healthy replay look like a failure, so it gets its own field: the caller can tell "your batch
      // was already applied" from "part of your batch was refused".
      const duplicates = rows.length - accepted;
      if (duplicates > 0) rejectedReasons.push("DUPLICATE_ID");

      return NextResponse.json({
        accepted,
        rejected: 0,
        duplicates,
        rejectedReasons,
      });
    });
  } catch (error) {
    // A foreign-org reference can also surface here if RLS raises instead of returning null; both mean "not yours".
    const message = error instanceof Error ? error.message : "unknown error";
    if (/not found|does not exist|no rows/i.test(message)) {
      return NextResponse.json({ error: "gameVideoId or analysisRunId not found in this organization" }, { status: 404 });
    }
    console.error("vision sync failed:", message);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
