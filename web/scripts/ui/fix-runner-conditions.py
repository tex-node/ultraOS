"""Run the preparation scripts the way the deployed runner does.

`npx tsx script.ts` loads the module graph without the `react-server` condition, so the first import of a `server-only` module
throws "This module cannot be imported from a Client Component module". The server-side scripts (createGame, tenant helpers)
are all server-only, so both the preparation scripts and the organization lookup have to be started as:

    node --conditions=react-server --import tsx <script>
"""
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[1] / "scripts/e2e-local.mjs"
source = RUNNER.read_text(encoding="utf-8")

source = source.replace(
    '''  const output = execFileSync("npx", ["tsx", script, ...scriptArgs], {''',
    '''  const output = execFileSync("node", ["--conditions=react-server", "--import", "tsx", script, ...scriptArgs], {''',
)

source = source.replace(
    '''  const orgId = execFileSync(
    "npx",
    ["tsx", "--eval", `''',
    '''  const orgId = execFileSync(
    "node",
    ["--conditions=react-server", "--import", "tsx", "--eval", `''',
)

RUNNER.write_text(source, encoding="utf-8", newline="\n")
print("runner: preparation uses the react-server condition")
