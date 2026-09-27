// P13/A3a ratchet guard. The canonical-write suppression baseline may SHRINK as sites are
// migrated to src/server/scoring/**, but it may never GROW — otherwise someone adds a 37th inline
// write, baselines it "just for now," and the guard becomes decorative. See
// docs/canonical-write-audit.md.
//
// Usage: node scripts/check-canonical-write-baseline.mjs
// Compares the total suppression count against a committed ceiling. Bump the ceiling only in a PR
// that removes suppressions (never to add one).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const suppressions = JSON.parse(
  readFileSync(join(root, "eslint-suppressions.json"), "utf8"),
);
const ceiling = JSON.parse(
  readFileSync(join(root, "scripts", "canonical-write-baseline.json"), "utf8"),
);

let total = 0;
for (const file of Object.values(suppressions)) {
  for (const rule of Object.values(file)) {
    total += rule.count ?? 0;
  }
}

if (total > ceiling.maxEntries) {
  console.error(
    `canonical-write baseline grew from ${ceiling.maxEntries} to ${total} — fix the new violation or justify in the PR.`,
  );
  process.exit(1);
}

console.log(
  `canonical-write baseline: ${total} suppressions (ceiling ${ceiling.maxEntries}).`,
);
