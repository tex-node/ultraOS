"""Mount the local-agent banner at the top of each capture console's <main> (Prompt 5a).

Both pages open with `<ExitConsole />` then a `<main …>`; the banner goes immediately inside that main, so it is the first thing the
scorer sees on the page when the agent is unreachable.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMPORT = 'import { LocalAgentStatus } from "@/app/components/local-agent-status";'
RENDER = "      <LocalAgentStatus />"

for path in [
    ROOT / "src/app/(capture)/games/[fixtureId]/live/page.tsx",
    ROOT / "src/app/(capture)/games/[fixtureId]/stats/page.tsx",
]:
    source = path.read_text(encoding="utf-8")
    if "LocalAgentStatus" in source:
        print(f"{path.name}: already mounted")
        continue

    lines = source.split("\n")
    last_import = max(index for index, line in enumerate(lines) if line.startswith("import "))
    lines.insert(last_import + 1, IMPORT)
    source = "\n".join(lines)

    marker = "<main className="
    index = source.index(marker)
    tag_end = source.index(">", index) + 1
    source = source[:tag_end] + "\n" + RENDER + source[tag_end:]

    path.write_text(source, encoding="utf-8", newline="\n")
    print(f"{path.name}: banner mounted inside <main>")
