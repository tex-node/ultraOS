"""Start (or retry) analysis from the video list (Prompt 5c-viii).

Uploading a video POSTs the worker once, best-effort. If that POST fails - worker restarting, a timeout, a container being redeployed -
the video sits at READY_FOR_ANALYSIS with no way to try again: the page lists status and nothing else. That is exactly what an operator
saw after uploading a two-minute clip.

This adds a server action that asks the worker to analyse a registered video, plus a button beside each one. It reuses the same worker
contract the upload path uses (`POST {VISION_WORKER_URL}/analyze` with `{game_video_id, organization_id, requested_by_id}`), so there is
one trigger shape, not two.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ACTIONS = ROOT / "web/src/app/(workspace)/vision/videos/actions.ts"
PAGE = ROOT / "web/src/app/(workspace)/vision/videos/page.tsx"

actions = ACTIONS.read_text(encoding="utf-8")
if "startVisionAnalysisAction" in actions:
    print("analysis action already present")
    raise SystemExit(0)

actions += '''

// Start or retry analysis for a registered video.
//
// The upload path fires the same request once and then forgets it. Anything that goes wrong there - worker restarting, a timeout, a
// redeploy mid-upload - leaves the video at READY_FOR_ANALYSIS forever, because nothing retries and nothing in the UI can ask. This is
// that ask. Failures are returned to the caller, not swallowed: an operator who clicks "Analyse" and sees nothing happen will conclude
// the feature is broken, which is what happened.
export async function startVisionAnalysisAction(gameVideoId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");

  const worker = (process.env.VISION_WORKER_URL ?? "http://127.0.0.1:8010").replace(/\\/$/, "");
  const token = process.env.VISION_WORKER_TOKEN ?? "";

  try {
    const response = await fetch(`${worker}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        game_video_id: gameVideoId,
        organization_id: organizationId,
        requested_by_id: session.user.id,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      return { ok: false as const, error: `worker refused the request (${response.status}): ${detail}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { ok: false as const, error: `cannot reach the vision worker: ${message}` };
  }

  revalidatePath("/vision/videos");
  return { ok: true as const };
}
'''

ACTIONS.write_text(actions, encoding="utf-8", newline="\n")

page = PAGE.read_text(encoding="utf-8")
page = page.replace(
    'import { createDraftCourtSpecAction, updateDraftCourtSpecAction, markCourtSpecOfficialAction, setAttackingDirectionAction } from "./actions";',
    'import {\n  createDraftCourtSpecAction,\n  updateDraftCourtSpecAction,\n  markCourtSpecOfficialAction,\n  setAttackingDirectionAction,\n  startVisionAnalysisAction,\n} from "./actions";\nimport { StartAnalysisButton } from "./start-analysis-button";',
)

old_row = """                  <p className="mt-1 text-xs text-text-3">
                    Ingest: <span className="font-bold text-warn">{v.ingestStatus}</span>
                    {v.codec ? ` · ${v.codec}` : ""}{v.durationSeconds ? ` · ${Math.round(v.durationSeconds / 60)}min` : ""}
                  </p>"""
new_row = """                  <p className="mt-1 text-xs text-text-3">
                    Ingest: <span className="font-bold text-warn">{v.ingestStatus}</span>
                    {v.codec ? ` · ${v.codec}` : ""}{v.durationSeconds ? ` · ${Math.round(v.durationSeconds / 60)}min` : ""}
                  </p>
                  <StartAnalysisButton gameVideoId={v.id} ingestStatus={v.ingestStatus} onStart={startVisionAnalysisAction} />"""
if old_row not in page:
    raise SystemExit("video row markup changed - not patched")
page = page.replace(old_row, new_row, 1)
PAGE.write_text(page, encoding="utf-8", newline="\n")
print("start-analysis action and button wired")
