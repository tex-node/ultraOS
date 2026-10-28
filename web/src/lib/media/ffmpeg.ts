import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A bounded ffmpeg runner (streak v25, Prompt 1b).
//
// WHY. The session log records an OOM kill on 16 Oct that took out an ffmpeg process at 3.5 GB - on the WEB server, not
// the vision worker. `execFile("ffmpeg", ...)` inherits no memory limit, so one unlucky input (a long GOP, a codec that
// forces a decode-and-re-encode, a huge resolution) can push the whole Node process's host into the kernel's OOM killer,
// which is how a routine "confirm this observation" becomes an outage for every tenant on the box.
//
// WHAT THIS DOES. Two bounds, both explicit:
//   1. a hard address-space cap via `ulimit -v` in the shell that execs ffmpeg, so the child dies with "Cannot allocate
//      memory" instead of starving the host;
//   2. a wall-clock watchdog, so a hung ffmpeg cannot hold a request or a pooled connection forever.
// Both are configurable, and the error names which bound was hit rather than surfacing a bare "Command failed".
const execFileAsync = promisify(execFile);

export type FfmpegLimits = { memoryMb: number; timeoutMs: number };

export function ffmpegLimits(env: Record<string, string | undefined> = process.env): FfmpegLimits {
  const memoryMb = Number.parseInt(env.FFMPEG_MEMORY_LIMIT_MB ?? "", 10);
  const timeoutMs = Number.parseInt(env.FFMPEG_TIMEOUT_MS ?? "", 10);
  return {
    // 1.5 GB is generous for `-c copy` (a stream copy uses megabytes) and still leaves the host headroom.
    memoryMb: Number.isFinite(memoryMb) && memoryMb > 0 ? memoryMb : 1536,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000,
  };
}

export class FfmpegLimitError extends Error {
  constructor(readonly kind: "memory" | "timeout", readonly detail: string) {
    super(
      kind === "memory"
        ? `ffmpeg exceeded its memory limit (${detail}). The clip was not produced; retry a shorter window or raise FFMPEG_MEMORY_LIMIT_MB deliberately.`
        : `ffmpeg exceeded its time limit (${detail}) and was killed. The clip was not produced.`,
    );
    this.name = "FfmpegLimitError";
  }
}

/** Run ffmpeg with a memory cap and a watchdog. Returns stdout as a string. */
export async function runFfmpeg(
  args: string[],
  options: { binary?: string; limits?: FfmpegLimits; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  const limits = options.limits ?? ffmpegLimits();
  const binary = options.binary ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  // `ulimit -v` takes KB. The shell sets the cap then `exec`s, so the shell itself is replaced and no extra process
  // lingers; "$@" keeps the binary and its arguments out of the shell's parsing entirely. A POSIX-only mechanism: on a
  // non-POSIX dev machine the watchdog still applies and the cap is simply absent (the deployment target is Linux).
  const posix = process.platform !== "win32";
  const wrapper = `ulimit -v $(( ${limits.memoryMb} * 1024 )) 2>/dev/null || true; exec "$@"`;
  const [file, fileArgs] = posix
    ? ["/bin/sh", ["-c", wrapper, "ffmpeg-run", binary, ...args]]
    : [binary, args];

  try {
    const { stdout, stderr } = await execFileAsync(file, fileArgs, {
      timeout: limits.timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024,
      env: options.env ?? process.env,
    });
    return { stdout, stderr };
  } catch (error) {
    const err = error as { killed?: boolean; signal?: string; stderr?: string; message?: string };
    const stderr = (err.stderr ?? "").trim();
    // The kernel's answer to `ulimit -v` is ffmpeg failing to allocate, and Node's answer to the watchdog is a SIGKILL.
    if (/Cannot allocate memory|Out of memory|unable to allocate|Killed|SIGKILL/i.test(stderr) || err.signal === "SIGKILL") {
      const kind = err.signal === "SIGKILL" && !/allocate/i.test(stderr) ? "timeout" : "memory";
      throw new FfmpegLimitError(kind, kind === "timeout" ? `${limits.timeoutMs} ms` : `${limits.memoryMb} MB`);
    }
    throw new Error(`ffmpeg failed: ${stderr.split("\n").slice(-3).join(" ").trim() || err.message}`);
  }
}
