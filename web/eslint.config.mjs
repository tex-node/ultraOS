import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// P13/A3a canonical-write guard. The canonical scoring tables may only be written through the
// service layer (src/server/scoring/**). This turns "consolidated" into "stays consolidated":
// without it, the 21st inline write site appears within a month. See docs/canonical-write-audit.md.
const CANONICAL_WRITE_RULE = [
  "error",
  {
    selector: "MemberExpression[property.name=/^(create|createMany|upsert|update|delete)$/][object.property.name=/^(gameEvent|playerStat|teamStat)$/]",
    message:
      "Canonical scoring writes must go through src/server/scoring/** (createGameEvent / recompute stats). See docs/canonical-write-audit.md.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/server/scoring/**"],
    rules: {
      "no-restricted-syntax": CANONICAL_WRITE_RULE,
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
