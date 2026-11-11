"""Insert the capture exit control into the scorer and statistician consoles.

Both pages now render inside (capture)/layout.tsx, which supplies a black, chrome-free frame. The only way out is the exit
control; it is deliberately the same component on both screens.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = [
    ROOT / "src/app/(capture)/games/[fixtureId]/live/page.tsx",
    ROOT / "src/app/(capture)/games/[fixtureId]/stats/page.tsx",
]
IMPORT = 'import { ExitConsole } from "@/app/components/capture/exit-console";'


def add(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    if "ExitConsole" in source:
        return "already present"

    lines = source.split("\n")
    last_import = max(i for i, line in enumerate(lines) if line.startswith("import "))
    lines.insert(last_import + 1, IMPORT)
    source = "\n".join(lines)

    if "      <>\n        <main" in source:
        source = source.replace("      <>\n        <main", "      <>\n        <ExitConsole />\n        <main", 1)
    elif "    <>\n      <main" in source:
        source = source.replace("    <>\n      <main", "    <>\n      <ExitConsole />\n      <main", 1)
    else:
        return "render root not found - not modified"

    path.write_text(source, encoding="utf-8", newline="\n")
    return "exit control added"


for page in PAGES:
    print(f"  {page.relative_to(ROOT)}: {add(page)}")
