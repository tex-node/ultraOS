"""Dual-shell refactor, step 1: create the route groups and move the routes into them.

Route groups do not change URLs, so every existing address keeps working. What changes is which layout wraps a page.

Run from web/:  python scripts/ui/dual-shell-move.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # web/
APP = ROOT / "src" / "app"

GROUPS = {
    "(portal)": ["page.tsx", "t", "public", "login", "signup", "api-docs", "register", "embed", "[vanitySlug]", "giesm"],
    "(workspace)": [
        "admin", "coaching", "dashboard", "operations", "settings", "scoresheets",
        "players", "events", "fixtures", "vision", "imports",
    ],
    "(capture)": ["games/[fixtureId]/live", "games/[fixtureId]/stats", "gameday"],
}


def run(*args: str) -> None:
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"{' '.join(args)} failed:\n{result.stdout}\n{result.stderr}")


def main() -> None:
    for group in GROUPS:
        (APP / group).mkdir(exist_ok=True)
        # keep the group directory tracked even while empty
        (APP / group / ".gitkeep").write_text("", encoding="utf-8")

    moved = 0
    for group, entries in GROUPS.items():
        for entry in entries:
            src = APP / entry
            dst = APP / group / entry
            if not src.exists():
                print(f"  skip (absent): {entry}")
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            run("git", "mv", str(src), str(dst))
            print(f"  {entry:34} -> {group}/{entry}")
            moved += 1
    print(f"\n  moved {moved} routes")


if __name__ == "__main__":
    main()
