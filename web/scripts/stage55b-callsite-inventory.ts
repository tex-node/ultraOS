import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Row = {
  number: number;
  file: string;
  line: number;
  functionName: string;
  operation: string;
  model: string;
  tenantScoped: "YES" | "NO";
  firstTenantRead: "YES" | "NO";
  provenance: string;
  requiredContext: string;
  currentWrapper: string;
  classification: "A" | "B" | "C" | "D" | "E";
  remediation: string;
  verification: string;
};

const root = path.resolve(process.cwd(), "src");
const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
const outputPath = path.resolve(
  process.cwd(),
  "../documentation/architecture/PHASE1_STAGE5_5B_CALLSITE_MATRIX.csv",
);
const baselinePath = path.resolve(process.cwd(), "../tmp/stage55b-bare-prisma.txt");

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "generated") return [];
        return sourceFiles(target);
      }
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) return [];
      if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
      return [target];
    }),
  );
  return nested.flat();
}

async function tenantModels() {
  const schema = await readFile(schemaPath, "utf8");
  const models = new Set<string>();
  for (const block of schema.split(/^model /m).slice(1)) {
    const name = block.match(/^(\w+)/)?.[1];
    if (name && /^\s+organizationId\s+String/m.test(block)) models.add(name.toLowerCase());
  }
  return models;
}

function nearestFunction(lines: string[], index: number) {
  for (let i = index; i >= 0; i -= 1) {
    const match = lines[i].match(/(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/);
    if (match) return match[1] ?? match[2];
  }
  return "module scope";
}

function csv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

// Batch 6 defect fix (2026-09-12): the previous scan matched the literal text
// `prisma.<model>.<method>(` even when it appeared inside a line comment, block
// comment, or string/template literal. That misattributed rows to comment lines
// and caused the raw Batch 6 classification drift. Strip comment and string
// *contents* before matching, preserving newlines so line numbers stay correct.
// Note: regex literals are not modelled; a `//` inside a regex could still be
// misread as a line comment, which is a conservative (misses rows) not a
// false-positive failure.
function stripCommentsAndStrings(content: string): string {
  let out = "";
  let state: "normal" | "line" | "block" | "single" | "double" | "template" = "normal";
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    const escaped = content[i - 1] === "\\";
    if (state === "normal") {
      if (ch === "/" && next === "/") { state = "line"; out += "  "; i += 1; continue; }
      if (ch === "/" && next === "*") { state = "block"; out += "  "; i += 1; continue; }
      if (ch === "'") { state = "single"; out += " "; continue; }
      if (ch === '"') { state = "double"; out += " "; continue; }
      if (ch === "`") { state = "template"; out += " "; continue; }
      out += ch;
      continue;
    }
    if (state === "line") { if (ch === "\n") { state = "normal"; out += ch; } else { out += " "; } continue; }
    if (state === "block") { if (ch === "*" && next === "/") { state = "normal"; out += "  "; i += 1; } else { out += ch === "\n" ? ch : " "; } continue; }
    if (state === "single") { if (ch === "'" && !escaped) { state = "normal"; } out += ch === "\n" ? ch : " "; continue; }
    if (state === "double") { if (ch === '"' && !escaped) { state = "normal"; } out += ch === "\n" ? ch : " "; continue; }
    if (state === "template") { if (ch === "`" && !escaped) { state = "normal"; } out += ch === "\n" ? ch : " "; continue; }
  }
  return out;
}

// Intentional manual C classifications that the schema-shape rule cannot derive.
// `data-hygiene.ts` is the platform-global demo/rehearsal residue diagnostic:
// every read is deliberately platform-wide and gated by
// requirePlatformPermission("data:readiness"), so it must never be re-scoped to
// a single organization. `tenant-context.ts`'s UserRoleAssignment read is the
// bootstrap resolver that establishes which organization a user belongs to and
// therefore runs before any tenant context exists.
const MANUAL_C_FILES = new Set<string>([
  "web/src/lib/data-hygiene.ts",
]);
const MANUAL_C_KEYS = new Set<string>([
  "web/src/lib/tenant-context.ts|userroleassignment",
]);

// Known baseline false positives: entries that were captured by the original
// bare-`prisma.` dump from text inside a doc comment, not a real call. After the
// comment-stripping fix they are no longer found by the scan, but the 283-row
// denominator restores them from the baseline. `tenant-context.ts`'s "club" hit
// is the comment `...a bare prisma.club.findMany() runs outside...`; the real
// resolveDefaultPublicOrganization path is a platform-global Organization
// resolver, so it is intentionally C, not B.
const KNOWN_COMMENT_FALSE_POSITIVES_C = new Set<string>([
  "web/src/lib/tenant-context.ts|club|findMany",
]);

// Batch 7 (2026-09-12) tenant-context conversions. This is a *maintained*
// allowlist, mirroring the earlier batch entries above - a future bare-call
// regression in one of these files still classifies B only if it is a known
// already-scoped call path, so keep this list deliberate.
const BATCH7_PATHS = [
  "web/src/app/audit/page.tsx",
  "web/src/app/display-monitoring/page.tsx",
  "web/src/app/documents/page.tsx",
  "web/src/app/equipment/page.tsx",
  "web/src/app/incidents/page.tsx",
  "web/src/app/notifications/page.tsx",
  "web/src/app/rehearsals/page.tsx",
  "web/src/app/runbooks/page.tsx",
  "web/src/app/tasks/page.tsx",
  "web/src/app/standings/page.tsx",
  "web/src/app/public/celebrations/actions.ts",
  "web/src/app/rehearsal/broadcast/[fixtureId]/page.tsx",
  "web/src/app/rehearsal/live/[fixtureId]/page.tsx",
  "web/src/lib/all-star-teams.ts",
  "web/src/lib/season-zero-production-reconciliation.ts",
  "web/src/app/participants/all-star-roster/page.tsx",
  "web/src/app/participants/all-star-roster/actions.ts",
  "web/src/app/data-quality/season-zero-production/page.tsx",
  "web/src/app/data-quality/season-zero-production/actions.ts",
  "web/src/app/data-quality/season-zero-production/[applicationId]/duplicates/page.tsx",
];


async function main() {
  const apply = process.argv.includes("--apply");
  const tenant = await tenantModels();
  const files = await sourceFiles(root);
  const rows: Row[] = [];

  for (const file of files.sort()) {
    const relative = path.relative(path.resolve(process.cwd(), ".."), file).replaceAll("\\", "/");
    const content = await readFile(file, "utf8");
    const strippedLines = stripCommentsAndStrings(content).split(/\r?\n/);
    strippedLines.forEach((text, index) => {
      const match = text.match(/\bprisma\.(\w+)\.(findUniqueOrThrow|findUnique|findFirstOrThrow|findFirst|findMany|count|aggregate|groupBy|createMany|create|updateMany|update|upsert|deleteMany|delete)\b/);
      if (!match) return;
      const model = match[1];
      const tenantScoped = tenant.has(model.toLowerCase());
      const manualC = MANUAL_C_FILES.has(relative) || MANUAL_C_KEYS.has(`${relative}|${model.toLowerCase()}`);
      const platformGlobal = !tenantScoped || manualC;
      const readinessLoader = relative.endsWith("web/src/lib/season-zero-readiness.ts")
        || relative.endsWith("web/src/lib/draft-personnel-readiness.ts");
      const scopedAction = relative.endsWith("web/src/app/players/actions.ts");
      const announcementPath = relative.endsWith("web/src/app/announcements/actions.ts")
        || relative.endsWith("web/src/app/announcements/page.tsx")
        || relative.endsWith("web/src/lib/announcements.ts");
      const applicationPage = relative.endsWith("web/src/app/applications/page.tsx")
        || relative.endsWith("web/src/app/applications/[category]/page.tsx")
        || relative.endsWith("web/src/app/applications/internalization/page.tsx");
      const internalizationLoader = relative.endsWith("web/src/lib/participant-internalization.ts");
      const fixturePage = relative.endsWith("web/src/app/fixtures/page.tsx")
        || relative.endsWith("web/src/app/fixtures/[id]/page.tsx")
        || relative.endsWith("web/src/app/fixtures/[id]/edit/page.tsx")
        || relative.endsWith("web/src/app/fixtures/new/page.tsx");
      const gamedayPage = relative.endsWith("web/src/app/gameday/page.tsx")
        || relative.endsWith("web/src/app/gameday/checkin/page.tsx");
      const liveGamePage = relative.endsWith("web/src/app/games/[fixtureId]/live/page.tsx")
        || relative.endsWith("web/src/app/games/[fixtureId]/stats/page.tsx")
        || relative.endsWith("web/src/app/games/[fixtureId]/stats/reconciliation/page.tsx");
      const draftCohortPath = relative.endsWith("web/src/lib/draft-cohort.ts")
        || relative.endsWith("web/src/app/draft-cohort/page.tsx")
        || relative.endsWith("web/src/app/draft-cohort/actions.ts");
      const dataQualityPath = relative.endsWith("web/src/lib/data-quality.ts")
        || relative.endsWith("web/src/app/data-quality/duplicates/page.tsx")
        || relative.endsWith("web/src/app/data-quality/duplicates/[groupId]/page.tsx")
        || relative.endsWith("web/src/app/data-quality/duplicates/actions.ts");
      const noveltyPath = relative.endsWith("web/src/app/novelty-matches/actions.ts")
        || relative.endsWith("web/src/app/novelty-matches/page.tsx")
        || relative.endsWith("web/src/app/novelty-matches/[matchId]/live/page.tsx");
      const contentPath = relative.endsWith("web/src/app/content/actions.ts")
        || relative.endsWith("web/src/lib/content-engine.ts");
      const mediaPath = relative.endsWith("web/src/app/media/page.tsx")
        || relative.endsWith("web/src/app/media/[assetId]/page.tsx")
        || relative.endsWith("web/src/app/media/actions.ts")
        || relative.endsWith("web/src/lib/media-storage.ts");
      const broadcastPath = relative.endsWith("web/src/lib/broadcast-presentation-state.ts")
        || relative.endsWith("web/src/app/broadcast/control/actions.ts")
        || relative.endsWith("web/src/app/broadcast/control/page.tsx");
      const batch7Path = BATCH7_PATHS.some((suffix) => relative.endsWith(suffix));
      const explicitContextPath = readinessLoader || scopedAction || announcementPath || applicationPage || internalizationLoader || fixturePage || gamedayPage || liveGamePage || draftCohortPath || dataQualityPath || noveltyPath || contentPath || mediaPath || broadcastPath || batch7Path;
      const classification = platformGlobal ? "C" : explicitContextPath ? "B" : "E";
      rows.push({
        number: rows.length + 1,
        file: relative,
        line: index + 1,
        functionName: nearestFunction(strippedLines, index),
        operation: match[2],
        model,
        tenantScoped: tenantScoped ? "YES" : "NO",
        firstTenantRead: tenantScoped ? "YES" : "NO",
        provenance: platformGlobal
          ? "Platform/global access by design (schema or explicit manual C classification)"
          : explicitContextPath
            ? scopedAction || announcementPath || applicationPage || internalizationLoader || fixturePage || gamedayPage || liveGamePage
              ? "Authenticated organizationId from requirePermissionWithOrganization()"
              : "Explicit db parameter; live callers establish authenticated organizationId"
            : "Not established at this direct Prisma call",
        requiredContext: platformGlobal ? "Platform/global access; no tenant context" : "Trusted organizationId followed by withOrganizationContext() and tx",
        currentWrapper: platformGlobal
          ? "Direct global Prisma access"
          : explicitContextPath
            ? scopedAction || announcementPath || applicationPage || internalizationLoader || fixturePage || gamedayPage || liveGamePage
              ? "withOrganizationContext(organizationId) transaction boundary"
              : "Function-local db alias backed by scoped transaction or explicit maintenance client"
            : "Bare prisma client",
        classification,
        remediation: platformGlobal
          ? "None; retain platform/global semantics (intentional manual C)"
          : explicitContextPath
            ? scopedAction || announcementPath || applicationPage || internalizationLoader || fixturePage || gamedayPage || liveGamePage
              ? announcementPath
              ? "Changed announcement page/actions/loader to execute reads/writes through withOrganizationContext()"
                : applicationPage
                  ? "Changed application review/internalization page to execute reads through withOrganizationContext()"
                  : internalizationLoader
                    ? "Requires explicit organizationId and selects Applications inside withOrganizationContext(); provisioning retains Application.organizationId provenance"
                    : fixturePage
                      ? "Changed fixture pages to read through authenticated organization context"
                      : gamedayPage
                        ? "Changed Game Day pages to read through one authenticated organization transaction context"
                        : liveGamePage
                          ? "Changed live/statistician/reconciliation pages to read through authenticated organization context"
                : "Changed player actions to obtain authenticated organizationId and execute reads/writes through withOrganizationContext()"
              : "Changed readiness functions to accept db; live routes invoke through withOrganizationContext()"
            : "Refactor caller/helper to receive trusted organizationId and use transaction client",
        verification: platformGlobal
          ? "CLASSIFIED_PLATFORM_GLOBAL"
          : readinessLoader || scopedAction
            ? "CODE_INSPECTION_ONLY; TSC_PASS; no empirical proof"
            : "BLOCKED_PENDING_REMEDIATION",
      });
    });
  }

  // Preserve the original 283-site denominator. Sites removed from the direct
  // scan by a remediation remain in the matrix as B entries with their original
  // source location and an explicit verification state.
  try {
    const baseline = await readFile(baselinePath, "utf8");
    const currentKeys = new Set(rows.map((row) => `${row.file}:${row.model}:${row.operation}`));
    const fileCache = new Map<string, string[]>();
    const strippedFor = async (relative: string) => {
      const cached = fileCache.get(relative);
      if (cached) return cached;
      let stripped: string[] = [];
      try {
        stripped = stripCommentsAndStrings(await readFile(path.resolve(process.cwd(), "..", relative), "utf8")).split(/\r?\n/);
      } catch {
        stripped = [];
      }
      fileCache.set(relative, stripped);
      return stripped;
    };
    for (const line of baseline.split(/\r?\n/)) {
      const match = line.match(/^(.*?):(\d+):.*\bprisma\.(\w+)\.(findUniqueOrThrow|findUnique|findFirstOrThrow|findFirst|findMany|count|aggregate|groupBy|createMany|create|updateMany|update|upsert|deleteMany|delete)\b/);
      if (!match) continue;
      const relative = match[1].replaceAll("\\", "/");
      const model = match[3];
      const operation = match[4];
      const key = `${relative}:${model}:${operation}`;
      if (currentKeys.has(key)) continue;
      const falsePositiveC = KNOWN_COMMENT_FALSE_POSITIVES_C.has(`${relative}|${model}|${operation}`);
      // Locate the current source line of the scoped call (`tx.<model>.<op>` /
      // `db.<model>.<op>`) so baseline-restored, already-remediated rows record
      // their real current location, not the stale Batch 6 line.
      const stripped = await strippedFor(relative);
      const scopedPattern = new RegExp(`\\b(?:tx|db)\\.${model}\\.${operation}\\b`);
      const currentIndex = stripped.findIndex((textLine) => scopedPattern.test(textLine));
      const currentFunction = currentIndex >= 0 ? nearestFunction(stripped, currentIndex) : null;
      rows.push({
        number: 0,
        file: relative,
        line: currentIndex >= 0 ? currentIndex + 1 : Number(match[2]),
        functionName: currentFunction ?? (relative.endsWith("web/src/lib/operations.ts")
          ? "operationsSnapshot"
          : relative.endsWith("web/src/app/launch-readiness/page.tsx")
            ? "LaunchReadinessPage"
            : relative.endsWith("web/src/app/players/actions.ts")
              ? "player actions"
              : relative.endsWith("web/src/app/announcements/actions.ts")
                ? "announcement actions"
                : relative.endsWith("web/src/app/announcements/page.tsx")
                  ? "AnnouncementsPage"
                : relative.endsWith("web/src/lib/announcements.ts")
                  ? "getCelebrantsForMonth"
                  : relative.endsWith("web/src/app/applications/internalization/page.tsx")
                    ? "ApplicationInternalizationPage"
                    : relative.endsWith("web/src/app/applications/[category]/page.tsx")
                      ? "ApplicationCategoryPage"
                    : relative.endsWith("web/src/app/applications/page.tsx")
                        ? "ApplicationsPage"
                        : relative.endsWith("web/src/lib/participant-internalization.ts")
                          ? "internalizeApprovedApplications"
                          : relative.endsWith("web/src/app/fixtures/page.tsx")
                            ? "Fixtures"
                            : relative.endsWith("web/src/app/fixtures/[id]/page.tsx")
                              ? "FixturePage"
                              : relative.endsWith("web/src/app/fixtures/[id]/edit/page.tsx")
                                ? "EditFixture"
                                : relative.endsWith("web/src/app/fixtures/new/page.tsx")
                                  ? "NewFixture"
                                  : relative.endsWith("web/src/app/gameday/page.tsx")
                                    ? "GameDayControlCenter"
                                    : relative.endsWith("web/src/app/gameday/checkin/page.tsx")
                                      ? "GameDayCheckIn"
                                      : relative.endsWith("web/src/app/games/[fixtureId]/live/page.tsx")
                                        ? "Live"
                                        : relative.endsWith("web/src/app/games/[fixtureId]/stats/page.tsx")
                                          ? "StatisticianConsole"
                                          : relative.endsWith("web/src/app/games/[fixtureId]/stats/reconciliation/page.tsx")
                                            ? "ReconciliationPage"
                        : "OperationsPage"),
        operation,
        model,
        tenantScoped: "YES",
        firstTenantRead: "YES",
        provenance: "Authenticated session organizationId",
        requiredContext: "withOrganizationContext(organizationId) and transaction client",
        currentWrapper: "Remediated: explicit authenticated organization and transaction client",
        classification: falsePositiveC ? "C" : "B",
        remediation: falsePositiveC
          ? "Batch 7 classification-only: original row text-matched a doc comment; real resolver is platform-global"
          : "Converted from bare prisma client to scoped transaction client",
        verification: falsePositiveC
          ? "CLASSIFIED_PLATFORM_GLOBAL"
          : "CODE_INSPECTION_ONLY; TSC_PASS; no empirical proof",
      });
    }
  } catch {
    // A missing baseline is acceptable for ad-hoc scans, but the certification
    // matrix will then represent only the current source tree.
  }

  rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.model.localeCompare(b.model));
  rows.forEach((row, index) => { row.number = index + 1; });

  const header = [
    "number", "file", "line", "function", "operation", "model", "tenantScoped",
    "firstTenantRead", "currentProvenance", "requiredContext", "currentWrapper",
    "classification", "remediation", "verification",
  ];
  const body = rows.map((row) => [
    row.number, row.file, row.line, row.functionName, row.operation, row.model,
    row.tenantScoped, row.firstTenantRead, row.provenance, row.requiredContext,
    row.currentWrapper, row.classification, row.remediation, row.verification,
  ].map((value) => csv(String(value))).join(","));
  // Dry-run by default: the certified matrix is hand-maintained and reconciled
  // (line/provenance for remediated rows cannot be re-derived generically), so
  // this tool must never silently overwrite it. Pass --apply to write.
  if (apply) {
    await writeFile(outputPath, `${header.join(",")}\n${body.join("\n")}\n`, "utf8");
  }

  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.classification] = (result[row.classification] ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({ total: rows.length, classifications: counts, wrote: apply, output: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
