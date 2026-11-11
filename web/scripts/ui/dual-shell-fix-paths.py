"""Repair every import that pointed at a route which moved into a route group.

Route groups do not change URLs, but they do change paths on disk, so `@/app/public/events/actions` stopped resolving once
`public/` became `(portal)/public/`. This rewrites those references to the new locations, longest prefix first so that
`@/app/games/[fixtureId]/live` is matched before any shorter rule could claim it.

Run from web/:  python scripts/ui/dual-shell-fix-paths.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ALIAS_RULES = [
    # capture (longest first)
    ("@/app/games/[fixtureId]/live", "@/app/(capture)/games/[fixtureId]/live"),
    ("@/app/games/[fixtureId]/stats", "@/app/(capture)/games/[fixtureId]/stats"),
    ("@/app/gameday", "@/app/(capture)/gameday"),
    # workspace
    ("@/app/admin", "@/app/(workspace)/admin"),
    ("@/app/coaching", "@/app/(workspace)/coaching"),
    ("@/app/dashboard", "@/app/(workspace)/dashboard"),
    ("@/app/operations", "@/app/(workspace)/operations"),
    ("@/app/settings", "@/app/(workspace)/settings"),
    ("@/app/scoresheets", "@/app/(workspace)/scoresheets"),
    ("@/app/players", "@/app/(workspace)/players"),
    ("@/app/events", "@/app/(workspace)/events"),
    ("@/app/fixtures", "@/app/(workspace)/fixtures"),
    ("@/app/vision", "@/app/(workspace)/vision"),
    ("@/app/imports", "@/app/(workspace)/imports"),
    # portal
    ("@/app/public", "@/app/(portal)/public"),
    ("@/app/t/", "@/app/(portal)/t/"),
    ("@/app/[vanitySlug]", "@/app/(portal)/[vanitySlug]"),
    ("@/app/giesm", "@/app/(portal)/giesm"),
    ("@/app/login", "@/app/(portal)/login"),
    ("@/app/signup", "@/app/(portal)/signup"),
    ("@/app/register", "@/app/(portal)/register"),
    ("@/app/embed", "@/app/(portal)/embed"),
    ("@/app/api-docs", "@/app/(portal)/api-docs"),
]

RELATIVE_RULES = [
    ("src/app/games/[fixtureId]/live", "src/app/(capture)/games/[fixtureId]/live"),
    ("src/app/games/[fixtureId]/stats", "src/app/(capture)/games/[fixtureId]/stats"),
    ("src/app/gameday", "src/app/(capture)/gameday"),
    ("src/app/public", "src/app/(portal)/public"),
]


def rewrite(text: str) -> str:
    for old, new in ALIAS_RULES:
        # the alias must be followed by a boundary, so "@/app/events" does not eat "@/app/eventsomething"
        text = re.sub(re.escape(old) + r"(?=[/\"']|$)", new, text)
    for old, new in RELATIVE_RULES:
        text = text.replace(old, new)
    return text


def main() -> None:
    changed = 0
    for base in ("src", "scripts", "e2e"):
        for path in sorted((ROOT / base).rglob("*.ts*")):
            if "node_modules" in path.parts:
                continue
            source = path.read_text(encoding="utf-8")
            updated = rewrite(source)
            if updated != source:
                path.write_text(updated, encoding="utf-8", newline="\n")
                changed += 1
    print(f"  files rewritten: {changed}")


if __name__ == "__main__":
    main()
