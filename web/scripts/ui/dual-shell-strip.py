"""Dual-shell refactor, step 2: take the shell out of the pages that are now inside (workspace) and (capture).

The layout owns the chrome; the pages become content. This script is deliberately literal - it only rewrites whole JSX wrappers
of the two shell components and drops their imports - so anything it cannot safely transform is reported rather than guessed at.

Run from web/:  python scripts/ui/dual-shell-strip.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "src" / "app"
GROUPS = [APP / "(workspace)", APP / "(capture)"]

OPEN = re.compile(r"<(OperationsShell|WorkspaceShell)\b[^>]*>")
CLOSE = re.compile(r"</(OperationsShell|WorkspaceShell)>")
IMPORTS = re.compile(r'^import\s*\{[^}]*\}\s*from\s*"@/app/components/(operations-shell|workspace-shell)";\s*$', re.M)


def strip(path: Path) -> tuple[int, int]:
    source = path.read_text(encoding="utf-8")
    opens = len(OPEN.findall(source))
    closes = len(CLOSE.findall(source))
    if opens != closes:
        return (0, 0)

    text = OPEN.sub("<>", source)
    text = CLOSE.sub("</>", text)
    text = IMPORTS.sub("", text)
    # collapse the blank lines an import removal leaves behind
    text = re.sub(r"\n{3,}", "\n\n", text)

    if text != source:
        path.write_text(text, encoding="utf-8", newline="\n")
        return (opens, closes)
    return (0, 0)


def main() -> None:
    touched = 0
    ops = 0
    for group in GROUPS:
        for path in sorted(group.rglob("*.tsx")):
            opens, _ = strip(path)
            if opens:
                touched += 1
                ops += opens
                print(f"  {path.relative_to(APP)}  ({opens} wrapper{'s' if opens > 1 else ''})")
    print(f"\n  pages unwrapped: {touched} · shell elements removed: {ops}")


if __name__ == "__main__":
    main()
