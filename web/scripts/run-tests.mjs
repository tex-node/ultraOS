#!/usr/bin/env node
// Unit / component test runner (streak v20, Prompt 1).
//
// `npm test` used to be `tsx --test "src/lib/*.test.ts" "src/lib/**/*.test.ts"`. On Node 21+ the test runner expands
// those globs itself; on the Node 20 the VPS runs, the quoted pattern is a literal path and the run dies with
// "Could not find '/opt/.../src/lib/*.test.ts'" - exit 1, no tests collected. That made the documented command false on
// the machine that matters, and it was invisible locally because this workstation runs Node 22.
//
// This script enumerates the same trees and spawns the runner with real paths, exactly like scripts/run-db-tests.mjs
// does for the database suites. `--suite component` selects the *.test.tsx tree instead.
//
// The two suites are kept separate (rather than one runner doing both) because they need different flags:
// component tests render React and need --test-force-exit, so a leaked timer cannot hang a deploy.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const SUITES = {
  unit: { roots: ["src/lib"], ext: ".test.ts", flags: [] },
  component: { roots: ["src/app"], ext: ".test.tsx", flags: ["--test-force-exit"] },
};

const suiteArg = process.argv.find((arg) => arg.startsWith("--suite="));
const suiteName = suiteArg ? suiteArg.split("=")[1] : "unit";
const suite = SUITES[suiteName];
if (!suite) {
  console.error(`Unknown suite "${suiteName}". Use --suite=unit or --suite=component.`);
  process.exit(1);
}

/** @param {string} directory @returns {string[]} */
function collect(directory) {
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(suite.ext))
      // A component test is a .tsx file; a unit test is a .ts file. Without this split, node --test would pick up
      // both and the component suite would try to render in a process that has no React test harness configured.
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
      .sort();
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

const files = suite.roots.flatMap((root) => collect(root));
if (files.length === 0) {
  console.error(`test:${suiteName} found no *${suite.ext} files under ${suite.roots.join(", ")}`);
  process.exit(1);
}

// The runner treats a positional argument as a GLOB. A Next.js dynamic-segment directory contains square brackets
// ("src/app/games/[fixtureId]/..."), which the matcher reads as a character class and silently matches nothing - the
// live-score-capture suite contributed ZERO tests that way while the run still reported success. "[[]" is the standard
// way to write a literal "[" in a glob, and it is what makes those three tests run again.
const globEscape = (file) => file.replace(/\[/g, "[[]");

// No --conditions=react-server here, deliberately: the database suites need it (they import server modules under the
// server condition), but these suites exercise client-adjacent code and React components, and adding it made six unit
// tests and every component test fail. The two runners differ for a reason.
const passthrough = process.argv.slice(2).filter((arg) => !arg.startsWith("--suite="));
const args = ["--import", "tsx", "--test", ...suite.flags, ...passthrough, ...files.map(globEscape)];

console.log(
  `test:${suiteName}: ${files.length} files (${files.slice(0, 3).map((file) => relative(process.cwd(), file)).join(", ")}${files.length > 3 ? ", …" : ""})`,
);

const child = spawn(process.execPath, args, { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(`test:${suiteName} could not start the test runner: ${error.message}`);
  process.exit(1);
});
