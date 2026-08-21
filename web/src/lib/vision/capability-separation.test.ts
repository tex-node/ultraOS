// G.21 Part LVI capability separation, enforced as a real regression test (not just a one-time
// audit note): nothing under src/lib/vision may reference canonical GameDataCapability/
// dataCapability, or write Fixture/PlayerStat/TeamStat/Standing fields. If a future change adds
// one of these references, this test fails loudly rather than letting AI-vision code quietly
// grow a path into canonical basketball truth.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VISION_DIR = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_PATTERNS = [
  /\bdataCapability\b/,
  /\bGameDataCapability\b/,
  /\bBOX_SCORE_ONLY\b/,
  /\bFULL_ULTRA\b/,
  /homeScore\s*:/,
  /awayScore\s*:/,
  /playerStat\.(update|upsert|create)/i,
  /teamStat\.(update|upsert|create)/i,
  /standing\.(update|upsert|create)/i,
];

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) return [full];
    return [];
  });
}

test("no file under src/lib/vision references canonical GameDataCapability or writes competitive-truth tables", () => {
  const files = sourceFiles(VISION_DIR);
  assert.ok(files.length > 0, "expected to find vision source files to scan");
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) violations.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, []);
});

// G.22 Part LXIV: "No biometrics regression" - a real, running grep guard, not a one-time claim
// in a doc. Scans the entire vision domain: library code, the vision app routes, and the video
// registration route under /games/[fixtureId]/video.
const BIOMETRIC_PATTERNS = [
  /face[-_ ]?recognition/i,
  /face[-_ ]?embedding/i,
  /facial/i,
  /biometric/i,
  /\bfaceapi\b/i,
  /\bfacenet\b/i,
];

function projectRoot(): string {
  // src/lib/vision -> src/lib -> src -> web
  return join(VISION_DIR, "..", "..", "..");
}

test("no biometric/facial-recognition dependency exists anywhere in the vision domain (library, app routes, video registration)", () => {
  const root = projectRoot();
  const scanDirs = [
    join(root, "src", "lib", "vision"),
    join(root, "src", "app", "vision"),
    join(root, "src", "app", "games"), // includes /games/[fixtureId]/video
  ];
  const violations: string[] = [];
  for (const dir of scanDirs) {
    let files: string[];
    try {
      files = sourceFiles(dir);
    } catch {
      continue; // directory doesn't exist in this checkout - nothing to scan, not a violation
    }
    for (const file of files) {
      // Video registration touches other games/ concerns too (scoring, stats) - only flag files
      // that are actually part of the vision surface, to avoid false positives from unrelated
      // code elsewhere under src/app/games.
      if (dir.endsWith(join("app", "games")) && !file.includes(join("video", ""))) continue;
      const content = readFileSync(file, "utf8");
      for (const pattern of BIOMETRIC_PATTERNS) {
        if (pattern.test(content)) violations.push(`${file}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
