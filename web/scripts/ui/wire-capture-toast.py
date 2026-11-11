"""Raise a toast when a courtside tap is queued offline (motion-prompt #056, call site 1 of 2).

The capture component already sets an inline acknowledgment next to the pad. The toast is additive: it is the same fact at the
edge of the screen, where it does not push the pad down, and it needs no state of its own.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CAPTURE = ROOT / "src/app/(capture)/games/[fixtureId]/live/live-score-capture.tsx"

IMPORT = 'import { toast } from "@/app/components/ui/toaster";'

source = CAPTURE.read_text(encoding="utf-8")
if "toast(" in source:
    print("capture: toast already wired")
else:
    lines = source.split("\n")
    last_import = max(i for i, line in enumerate(lines) if line.startswith("import "))
    lines.insert(last_import + 1, IMPORT)
    source = "\n".join(lines)

    target = 'setAck({ kind: "queued", message: `✓ Captured offline: +${scoring} — queued for sync` });'
    if target not in source:
        # the file stores a mojibake check mark; fall back to the prefix
        target = 'setAck({ kind: "queued", message:'
        index = source.find(target)
        if index == -1:
            raise SystemExit("queued acknowledgment not found")
        end = source.find("});", index) + 3
        source = source[:end] + '\n    toast(`Offline: +${scoring} queued`, "warn");' + source[end:]
    else:
        source = source.replace(
            target,
            target + '\n    toast(`Offline: +${scoring} queued`, "warn");',
        )

    CAPTURE.write_text(source, encoding="utf-8", newline="\n")
    print("capture: offline tap now raises a toast")
