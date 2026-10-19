#!/usr/bin/env node
// DB-integration test runner (streak v7, Prompt 3).
//
// `npm run test:db` used to pass glob patterns ("src/**/*.test.ts") to `node --test`. That only works on Node
// 21+, where the test runner expands globs itself; on the Node 20 the VPS runs, the pattern is treated as a
// literal path and the run dies with "Could not find '.../src/test-support/**/*.test.ts'" - exit 1, no tests
// executed. The workaround was to enumerate the files by hand, which made the documented command a lie.
//
// This script enumerates the same three trees and spawns the test runner with real paths, so the documented
// command works on both versions. --test-concurrency=1 is not optional: these suites share one database and
// were measurably flaky when their files ran in parallel (independent failures in scoring, sync and coaching
// suites, all passing when serialized).
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/test-support", "src/server", "src/app"];

/** @param {string} directory @returns {string[]} */
function collect(directory) {
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
      .sort();
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

const files = ROOTS.flatMap((root) => collect(root));
if (files.length === 0) {
  console.error("test:db found no *.test.ts files under " + ROOTS.join(", "));
  process.exit(1);
}

const passthrough = process.argv.slice(2);
const args = ["--conditions=react-server", "--import", "tsx", "--test", "--test-concurrency=1"];
// Extra flags (e.g. --test-name-pattern) are forwarded, but --test-concurrency is ours to own.
const forwarded = passthrough.filter((arg) => !arg.startsWith("--test-concurrency"));
args.push(...forwarded, ...files);

console.log(`test:db: ${files.length} files, serialized (${files.slice(0, 3).map((file) => relative(process.cwd(), file)).join(", ")}${files.length > 3 ? ", …" : ""})`);

const child = spawn(process.execPath, args, { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(`test:db could not start the test runner: ${error.message}`);
  process.exit(1);
});
