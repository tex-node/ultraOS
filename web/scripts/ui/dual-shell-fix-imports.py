"""Repair the relative imports that the capture move broke.

Moving `games/[fixtureId]/live` and `/stats` into `(capture)` made `../../actions` point at `(capture)/games/actions`, which does
not exist. The shared modules still live in `src/app/games/`, so these imports become the alias form - which is also what keeps
the next move from breaking them again.

Run from web/:  python scripts/ui/dual-shell-fix-imports.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CAPTURE = ROOT / "src" / "app" / "(capture)"
SHARED = {p.stem for p in (ROOT / "src" / "app" / "games").glob("*.ts*")}

PATTERN = re.compile(r'"((?:\.\./)+)([a-z-]+)"')


def main() -> None:
    changed = 0
    for path in sorted(CAPTURE.rglob("*.ts*")):
        source = path.read_text(encoding="utf-8")

        def repl(match: re.Match[str]) -> str:
            module = match.group(2)
            return f'"@/app/games/{module}"' if module in SHARED else match.group(0)

        updated = PATTERN.sub(repl, source)
        if updated != source:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed += 1
            print(f"  {path.relative_to(ROOT)}")
    print(f"\n  files rewritten: {changed}")


if __name__ == "__main__":
    main()
