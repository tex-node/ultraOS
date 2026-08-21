// G.20 Part XXXI-XXXIII: concurrent-read load test against real, safe, read-only production
// endpoints. Deliberately conservative (10/25/50 concurrent readers, per the track's own
// example) - never an uncontrolled denial-of-service-style test (Part XXXI's explicit
// prohibition). Targets a real FINAL game (safe: read-only, no live state to disturb) mixed with
// the season-wide public endpoints every real consumer would actually call.
const HOST = process.env.LOAD_TEST_HOST ?? "http://127.0.0.1:4110";
const REAL_GAME_ID = "cmsx5y8c60000fnkkppyrwamu"; // Ember vs Nova, FINAL, FULL_ULTRA - the one real native-event game
const REAL_FIXTURE_ID = "cmsp9a74r000g4pkk5ta3tc49";

const TARGETS = [
  `${HOST}/api/v1/live`,
  `${HOST}/api/v1/games/${REAL_FIXTURE_ID}/snapshot`,
  `${HOST}/api/v1/seasons/active/standings`,
  `${HOST}/broadcast/game/${REAL_GAME_ID}/scorebug`,
  `${HOST}/api/broadcast/program`,
];

type RequestResult = { url: string; ok: boolean; status: number; ms: number };

async function fireOne(url: string): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await fetch(url);
    return { url, ok: res.ok, status: res.status, ms: Date.now() - start };
  } catch {
    return { url, ok: false, status: 0, ms: Date.now() - start };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function runWave(concurrency: number) {
  const requests: Promise<RequestResult>[] = [];
  for (let i = 0; i < concurrency; i++) {
    requests.push(fireOne(TARGETS[i % TARGETS.length]));
  }
  const results = await Promise.all(requests);
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const errors = results.filter((r) => !r.ok);
  console.log(`\n=== Concurrency ${concurrency} ===`);
  console.log(`  requests: ${results.length}, errors: ${errors.length}`);
  console.log(`  p50: ${percentile(latencies, 50)}ms, p95: ${percentile(latencies, 95)}ms, max: ${latencies[latencies.length - 1]}ms`);
  if (errors.length > 0) {
    console.log(`  FAILED:`, errors.map((e) => `${e.url} -> ${e.status}`));
  }
  return { concurrency, requestCount: results.length, errorCount: errors.length, p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: latencies[latencies.length - 1] };
}

async function main() {
  console.log(`=== G.20 Load Test against ${HOST} ===`);
  console.log("Targets:", TARGETS);
  const summary = [];
  for (const concurrency of [10, 25, 50]) {
    summary.push(await runWave(concurrency));
    await new Promise((resolve) => setTimeout(resolve, 500)); // brief settle between waves
  }
  console.log("\n=== Summary ===");
  console.table(summary);
  const anyErrors = summary.some((s) => s.errorCount > 0);
  const anyBudgetMiss = summary.some((s) => s.p95 > 2000); // 2s p95 budget - generous, see PERFORMANCE_BUDGET note in final report
  if (anyErrors || anyBudgetMiss) {
    console.log("\n[WARNING] Load test surfaced errors or a p95 budget miss - see summary above.");
    process.exitCode = 1;
  } else {
    console.log("\n[PASS] No errors, all waves within budget.");
  }
}

main();
