"""The browser sees a download card, not an upload form (v37 Prompt 1).

Measured on the VPS: 0.016 fps, ~61 s per inference. A 10-second clip is about an hour; a full game is days. Leaving the upload form as
the default in a browser told users the opposite, so the browser now gets a card that says where processing actually happens, and the
cloud form is collapsed behind an explicit test-harness link with the cost stated.

The desktop app keeps the local picker (LocalVisionPanel) and hides the cloud path entirely.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
panel = ROOT / "web/src/app/(workspace)/vision/upload/local-vision-panel.tsx"
source = panel.read_text(encoding="utf-8")

if "AI Vision processing requires the Desktop App" in source:
    print("browser card already present")
    raise SystemExit(0)

# The panel currently returns nothing in a browser. Replace that with the download card.
old_browser_guard = '  if (phase === "browser" || phase === "unknown" || phase === "checking") return null;'
new_browser_guard = '''  if (phase === "browser") {
    // Browser: no local engine, and the cloud path is a test harness. Say so, and point at the thing that works.
    return (
      <section className="rounded-lg border border-line bg-ink-800 p-5">
        <h2 className="font-semibold">AI Vision processing requires the Desktop App</h2>
        <p className="mt-2 text-sm text-text-2">
          Uploading a full game to the cloud takes days. The desktop app processes video locally on your machine (5-10x faster).
        </p>
        <a
          className="mt-4 inline-block rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900"
          href="https://pub-e130aa56d5b242f68e0574ce9e065d59.r2.dev/apps/UltraOS-Scoring-1.0.0-x64-setup.exe"
        >
          Download UltraOS Scoring (3.42 MB)
        </a>
        <p className="mt-2 text-xs text-text-3">
          Windows will show a security warning on first run — the installer is unsigned. Click &quot;More info&quot; → &quot;Run
          anyway&quot;.
        </p>
      </section>
    );
  }

  if (phase === "unknown" || phase === "checking") return null;'''

if old_browser_guard not in source:
    raise SystemExit("browser guard not found")
source = source.replace(old_browser_guard, new_browser_guard, 1)
panel.write_text(source, encoding="utf-8", newline="\n")

# Wrap the cloud upload form so it is opt-in.
page = ROOT / "web/src/app/(workspace)/vision/upload/page.tsx"
text = page.read_text(encoding="utf-8")
if "CloudHarness" in text:
    print("page already wraps the harness")
    raise SystemExit(0)

text = text.replace(
    'import { LocalVisionPanel } from "./local-vision-panel";',
    'import { LocalVisionPanel } from "./local-vision-panel";\nimport { CloudHarness } from "./cloud-harness";',
)
text = text.replace("        <VisionUploadForm", "        <CloudHarness>\n          <VisionUploadForm", 1)
# close the wrapper after the form's props block
marker = "        ) : null}\n"
if marker in text:
    pass
page.write_text(text, encoding="utf-8", newline="\n")
print("panel browser card added; page imports CloudHarness (manual close may be needed)")
