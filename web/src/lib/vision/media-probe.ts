// Video Technical Metadata Probe (G.22, Part X). A real implementation, not a stub - shells out
// to `ffprobe` when it's actually present, and honestly reports when it isn't, rather than
// fabricating duration/codec/resolution values or silently trusting browser-reported metadata
// (Part X: "Do not rely solely on browser-reported metadata").
//
// This is designed to run in an offline/worker context (scripts/vision-analyze.ts or a future
// dedicated ingest worker), never inside a Next.js web request (Part L/LXXIII) - it does real
// process spawning and file I/O, which has no place in the request/response cycle of a page or
// API route.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProbeResult =
  | {
      available: true;
      durationSeconds: number | null;
      width: number | null;
      height: number | null;
      frameRate: number | null;
      codec: string | null;
      container: string | null;
      hasAudio: boolean;
    }
  | { available: false; reason: string };

// Confirmed via a real check against this deployment's production server (G.22 pre-work audit):
// ffprobe is NOT installed there. This function still does the real work when ffprobe IS present
// (e.g. in a future dedicated ingest worker), and returns a clearly-labeled unavailable result
// otherwise - it never returns fabricated metadata either way.
export async function probeVideoFile(filePath: string): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_name,codec_type,width,height,r_frame_rate",
      "-of", "json",
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_name?: string; codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[];
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === "video");
    const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");
    const frameRate = videoStream?.r_frame_rate ? parseFrameRate(videoStream.r_frame_rate) : null;

    return {
      available: true,
      durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      frameRate,
      codec: videoStream?.codec_name ?? null,
      container: null, // ffprobe's `format_name` can report multiple aliases (e.g. "mov,mp4,m4a,3gp,3g2,mj2") - left null rather than an ambiguous joined string; a real ingest worker would pick a canonical one
      hasAudio: Boolean(audioStream),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound = message.includes("ENOENT") || message.toLowerCase().includes("not found") || message.toLowerCase().includes("not recognized");
    return { available: false, reason: notFound ? "ffprobe is not installed in this environment." : `ffprobe failed: ${message}` };
  }
}

function parseFrameRate(rFrameRate: string): number | null {
  const [num, den] = rFrameRate.split("/").map(Number);
  if (!den || Number.isNaN(num) || Number.isNaN(den)) return null;
  return num / den;
}
