"""Page-side wrappers for the picker and the analyze bridge (Prompt 5c-v)."""
import pathlib

p = pathlib.Path("web/src/lib/offline/local-agent.ts")
s = p.read_text(encoding="utf-8")

if "pickVideo" in s:
    print("picker wrappers already present")
    raise SystemExit(0)

s = s.replace(
    '  | "STOP_VISION_SIDECAR";',
    '  | "STOP_VISION_SIDECAR"\n  | "PICK_VIDEO"\n  | "ANALYZE_VIDEO";',
)

s += '''

/** Ask the agent to open the native file dialog. The file never passes through this page - only its path comes back. */
export async function pickVideo(): Promise<
  { cancelled: true } | { cancelled: false; videoPath: string; fileName: string; fileSizeBytes: number; extension: string }
> {
  const response = await callLocalAgent<
    { cancelled: true } | { cancelled: false; videoPath: string; fileName: string; fileSizeBytes: number; extension: string }
  >("PICK_VIDEO");
  if (!response.ok) return { cancelled: true };
  return response.data;
}

/** Run the sidecar over a local file. Blocking on the agent side for as long as inference takes. */
export async function analyzeVideo(input: {
  videoPath: string;
  gameVideoId: string;
  analysisRunId: string;
}): Promise<{ observations: Record<string, unknown>[]; error: string | null } | null> {
  const response = await callLocalAgent<{ observations: Record<string, unknown>[]; error: string | null }>(
    "ANALYZE_VIDEO",
    input,
  );
  return response.ok ? (response.data ?? null) : { observations: [], error: response.error };
}
'''

p.write_text(s, encoding="utf-8", newline="\n")
print("picker and analyze wrappers added")
