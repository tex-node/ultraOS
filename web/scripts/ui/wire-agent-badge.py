"""Surface the desktop agent in the sync badge (Action 3 of the desktop streak).

Two edits to sync-status-badge.tsx:
  * import the detector and hold a small piece of state for it;
  * append the "Local agent" suffix to the badge label when the agent answers.

The badge keeps its existing meaning (sync state). This adds a second fact next to it: whether durable local storage is backing
the queue, which is what a scorekeeper on a venue laptop actually wants to know before the wifi drops.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BADGE = ROOT / "src/app/components/sync-status-badge.tsx"

IMPORT = 'import { detectLocalAgent } from "@/lib/offline/local-agent";'
STATE = """  // Desktop agent: true when the Tauri shell's local agent answers the handshake. Purely informational - the outbox mirrors to
  // it in enqueue(), and the web path is unchanged when it is absent.
  const [hasLocalAgent, setHasLocalAgent] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void detectLocalAgent().then((present) => {
      if (!cancelled) setHasLocalAgent(present);
    });
    return () => {
      cancelled = true;
    };
  }, []);
"""

LABEL_OLD = """  const label = needsAttention
    ? `${deadLetterCount} failed Â· Retry`"""
LABEL_NEW = """  const label = needsAttention
    ? `${deadLetterCount} failed Â· Retry`"""

source = BADGE.read_text(encoding="utf-8")

if "detectLocalAgent" in source:
    print("badge: agent already wired")
else:
    source = source.replace(
        'import { getOrCreateDeviceId } from "@/lib/offline/device-id";',
        'import { getOrCreateDeviceId } from "@/lib/offline/device-id";\n' + IMPORT,
    )
    source = source.replace(
        'import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";',
        'import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";',
    )
    anchor = "  const pending = useLiveQuery("
    if anchor not in source:
        raise SystemExit("badge layout changed - pending block not found")
    source = source.replace(anchor, STATE + "\n" + anchor, 1)

    # Append the agent suffix once the label is computed.
    label_anchor = "  return (\n    <button"
    if label_anchor not in source:
        raise SystemExit("badge layout changed - render not found")
    suffix = (
        "  const agentSuffix = hasLocalAgent ? \" Â· Local agent\" : \"\";\n"
    )
    source = source.replace(label_anchor, suffix + label_anchor, 1)

    # The label is rendered inside the button; find the JSX that prints it and append the suffix.
    for candidate in ("        {label}\n", "      {label}\n", "        {label}\n      "):
        if candidate in source:
            source = source.replace(candidate, candidate.replace("{label}", "{label}{agentSuffix}"), 1)
            break
    else:
        raise SystemExit("badge label render not found")

    BADGE.write_text(source, encoding="utf-8", newline="\n")
    print("badge: local agent indicator added")
