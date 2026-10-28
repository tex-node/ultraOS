import assert from "node:assert/strict";
import test from "node:test";
import { FfmpegLimitError, ffmpegLimits, runFfmpeg } from "@/lib/media/ffmpeg";

// Streak v25, Prompt 1b: an ffmpeg call must be bounded in BOTH directions. The 16 Oct OOM killed an ffmpeg at 3.5 GB on
// the web host, which is a whole-platform outage from one request. These tests use /bin/sh as the "binary" so they run
// without media and without a real ffmpeg.
test("the defaults are a 1.5 GB cap and a two minute watchdog", () => {
  const limits = ffmpegLimits({});
  assert.equal(limits.memoryMb, 1536);
  assert.equal(limits.timeoutMs, 120_000);
});

test("the limits are configurable, and nonsense is ignored rather than accepted", () => {
  assert.deepEqual(ffmpegLimits({ FFMPEG_MEMORY_LIMIT_MB: "512", FFMPEG_TIMEOUT_MS: "5000" }), {
    memoryMb: 512,
    timeoutMs: 5000,
  });
  assert.deepEqual(ffmpegLimits({ FFMPEG_MEMORY_LIMIT_MB: "0", FFMPEG_TIMEOUT_MS: "-1" }), {
    memoryMb: 1536,
    timeoutMs: 120_000,
  });
  assert.deepEqual(ffmpegLimits({ FFMPEG_MEMORY_LIMIT_MB: "not-a-number" }), { memoryMb: 1536, timeoutMs: 120_000 });
});

test("a hung child is killed by the watchdog and reported as a timeout", async () => {
  // A Node one-liner as the "binary", so this runs on any platform that can run the suite.
  const sleeper = ["-e", "setTimeout(() => {}, 10000)"];
  await assert.rejects(
    () => runFfmpeg(sleeper, { binary: process.execPath, limits: { memoryMb: 512, timeoutMs: 300 } }),
    (error: unknown) => {
      assert.ok(error instanceof FfmpegLimitError, "the error must name the bound that was hit");
      assert.equal(error.kind, "timeout");
      return true;
    },
  );
});

test("an allocation failure is reported as a memory limit, not a generic failure", async () => {
  await assert.rejects(
    () => runFfmpeg(["-e", "console.error('Cannot allocate memory'); process.exit(1)"], { binary: process.execPath }),
    (error: unknown) => {
      assert.ok(error instanceof FfmpegLimitError);
      assert.equal(error.kind, "memory");
      assert.match(error.message, /memory limit/i);
      return true;
    },
  );
});

test("an ordinary ffmpeg failure keeps ffmpeg's own words", async () => {
  await assert.rejects(
    () => runFfmpeg(["-e", "console.error('Invalid data found when processing input'); process.exit(1)"], { binary: process.execPath }),
    (error: unknown) => {
      assert.ok(!(error instanceof FfmpegLimitError), "a normal failure must not be blamed on the limits");
      assert.match((error as Error).message, /Invalid data found/);
      return true;
    },
  );
});

test("a successful run returns its stdout", async () => {
  const result = await runFfmpeg(["-e", "console.log('hi')"], { binary: process.execPath });
  assert.equal(result.stdout.trim(), "hi");
});
