#!/usr/bin/env node
/**
 * Local E2E harness: one command, no deployment.
 *
 * Why this exists: the browser suite tests a *deployed* build (E2E_BASE_URL), and a staging deploy on this host costs about
 * twenty-five minutes. That made "run the suite after every change" impossible, which is how a streak ends up with one e2e run
 * at the end. This brings the whole loop - database, migrations, seed, preparation, build, browser - down to minutes.
 *
 * The steps, in order:
 *   1. Postgres 16 in Docker on 127.0.0.1:55432 (docker-compose.test.yml).
 *   2. Migrations applied to it (prisma migrate deploy).
 *   3. A minimal seed (prisma/seed-test.ts): organizations, sports, venue - nothing the specs are meant to create.
 *   4. The two preparation scripts the deployed runner already uses, so the specs get the same fixture ids and tenants.
 *   5. A production build (reused when nothing in src/ has changed - see --build) and `next start`, then Playwright.
 *
 * Flags:
 *   --fresh   wipe the database volume first (needed after a schema change)
 *   --build   force a production build even if .next looks current
 *   --no-seed skip the seed (the database already has what it needs)
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const repo = join(web, "..");
const compose = join(repo, "docker-compose.test.yml");
const PORT = 4173;

const args = new Set(process.argv.slice(2));
const fresh = args.has("--fresh");
const forceBuild = args.has("--build");
const skipSeed = args.has("--no-seed");

const timings = [];

function loadEnv() {
  const path = join(web, ".env.test");
  if (!existsSync(path)) throw new Error("web/.env.test is missing");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const value = match[2].replace(/^"|"$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

/** Run a step, print its duration, and fail loudly if it fails. */
function step(label, fn) {
  const started = Date.now();
  process.stdout.write(`\n  ${label}\n`);
  const result = fn();
  const seconds = (Date.now() - started) / 1000;
  timings.push([label, seconds]);
  process.stdout.write(`    ${seconds.toFixed(1)}s\n`);
  return result;
}

function run(command, commandArgs, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: web,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} exited ${result.status}`);
}

/** True when .next is missing or older than the newest file the build depends on. */
function buildIsStale() {
  const buildId = join(web, ".next", "BUILD_ID");
  if (!existsSync(buildId)) return true;
  const builtAt = statSync(buildId).mtimeMs;
  const watched = ["src", "prisma/schema.prisma", "next.config.ts", "package.json", "tailwind.config.ts"];
  const newest = (path) => {
    const full = join(web, path);
    if (!existsSync(full)) return 0;
    if (!statSync(full).isDirectory()) return statSync(full).mtimeMs;
    let newestAt = 0;
    const stack = [full];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const next = join(current, entry.name);
        if (entry.isDirectory()) stack.push(next);
        else newestAt = Math.max(newestAt, statSync(next).mtimeMs);
      }
    }
    return newestAt;
  };
  return watched.some((path) => newest(path) > builtAt);
}

function prepare(script, scriptArgs = []) {
  const output = execFileSync("node", ["--conditions=react-server", "--import", "tsx", script, ...scriptArgs], {
    cwd: web,
    env: process.env,
    encoding: "utf8",
  });
  let exported = 0;
  for (const line of output.split("\n")) {
    const match = /^(E2E_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) {
      process.env[match[1]] = match[2];
      exported += 1;
    }
  }
  process.stdout.write(`    ${script}: ${exported} variables\n`);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server did not answer ${url} within ${timeoutMs}ms`);
}

async function main() {
  const started = Date.now();
  loadEnv();

  step("1/5 postgres", () => {
    if (fresh) run("docker", ["compose", "-f", compose, "down", "-v"]);
    run("docker", ["compose", "-f", compose, "up", "-d", "--wait"]);
  });

  step("2/5 migrations", () => run("npx", ["prisma", "migrate", "deploy"]));

  if (!skipSeed) step("3/5 seed", () => run("npx", ["tsx", "prisma/seed-test.ts"]));

  const orgId = step("4/5 preparation", () => {
    const id = execFileSync(
      "node",
      ["--conditions=react-server", "--import", "tsx", "scripts/e2e-org-id.ts"],
      { cwd: web, env: process.env, encoding: "utf8" },
    ).trim().split("\n").pop();
    prepare("scripts/e2e-prepare.ts", ["--organization", id]);
    prepare("scripts/e2e-tenant-prepare.ts");
    if (!process.env.E2E_FIXTURE_ID) throw new Error("preparation produced no E2E_FIXTURE_ID");
    return id;
  });

  // 5a. build, unless .next is newer than every source file
  const stale = forceBuild || buildIsStale();
  if (stale) {
    step("5/5 build", () => run("npm", ["run", "build"]));
  } else {
    process.stdout.write("\n  5/5 build: reusing .next (pass --build to force)\n");
    timings.push(["5/5 build (reused)", 0]);
  }

  // 5b. serve and test
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: web,
    stdio: "ignore",
    shell: process.platform === "win32",
    env: process.env,
  });

  let status = 1;
  try {
    await step("serve", () => waitForServer(`http://127.0.0.1:${PORT}/api/v1/live`));
    status = step("playwright", () => {
      const result = spawnSync(
        "npx",
        ["playwright", "test", "e2e/registration.spec.ts", "e2e/scoring.spec.ts", "e2e/wizard.spec.ts", "e2e/multi-tenant-auth.spec.ts", "--project=chromium", "--reporter=list"],
        {
          cwd: web,
          stdio: "inherit",
          env: { ...process.env, E2E_BASE_URL: `http://127.0.0.1:${PORT}` },
          shell: process.platform === "win32",
        },
      );
      return result.status ?? 1;
    });
  } finally {
    server.kill();
  }

  const total = (Date.now() - started) / 60000;
  process.stdout.write("\n  timings\n");
  for (const [label, seconds] of timings) process.stdout.write(`    ${label.padEnd(24)} ${seconds.toFixed(1)}s\n`);
  process.stdout.write(`\n  ${status === 0 ? "PASS" : "FAIL"} · ${total.toFixed(1)} min\n`);
  process.exit(status);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
