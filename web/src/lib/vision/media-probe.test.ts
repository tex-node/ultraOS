import assert from "node:assert/strict";
import test from "node:test";
import { probeVideoFile } from "./media-probe";

// Not mocked - this genuinely exercises the real fallback path, since ffprobe is confirmed not
// installed in this development environment (and, per the G.22 pre-work audit, not on the
// production server either). If ffprobe is ever installed somewhere this test runs, the
// available:true branch would need its own fixture video to test meaningfully - not attempted
// here since none exists (see VISION_EMPIRICAL_BENCHMARK.md).
test("probeVideoFile honestly reports unavailability rather than fabricating metadata when ffprobe is not installed", async () => {
  const result = await probeVideoFile("/nonexistent/path/to/video.mp4");
  assert.equal(result.available, false);
  if (!result.available) {
    assert.ok(result.reason.length > 0);
  }
});
