"""Mount the toaster in the root layout and give the tournament tabs their sliding underline.

Two edits, both small on purpose: the toast viewport has to live in the root layout so every shell can raise one, and the tab
underline replaces a background-swap with a shared-layout indicator.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = ROOT / "src/app/layout.tsx"
TABS = ROOT / "src/app/(portal)/t/[organizationSlug]/[competitionSlug]/sub-site-tabs.tsx"

# ---------------------------------------------------------------- root layout
source = LAYOUT.read_text(encoding="utf-8")
if "Toaster" not in source:
    if 'import "./globals.css";' in source:
        source = source.replace('import "./globals.css";', 'import "./globals.css";\nimport { Toaster } from "@/app/components/ui/toaster";', 1)
    else:
        lines = source.split("\n")
        last_import = max(i for i, line in enumerate(lines) if line.startswith("import "))
        lines.insert(last_import + 1, 'import { Toaster } from "@/app/components/ui/toaster";')
        source = "\n".join(lines)
    if "</body>" in source:
        source = source.replace("</body>", "        <Toaster />\n      </body>", 1)
    else:
        raise SystemExit("no </body> in root layout")
    LAYOUT.write_text(source, encoding="utf-8", newline="\n")
    print("root layout: toaster mounted")
else:
    print("root layout: toaster already mounted")

# ------------------------------------------------------------------------ tabs
tabs = TABS.read_text(encoding="utf-8")
if "layoutId" in tabs:
    print("tabs: underline already present")
else:
    tabs = tabs.replace(
        'import { useState } from "react";',
        'import { useState } from "react";\nimport { motion } from "framer-motion";',
    )

    old_nav = """      <nav className="flex gap-1 rounded-xl border border-white/[.08] bg-white/[.02] p-1">
        {tabs.map((tab) => {
          const active = tab.href === basePath ? pathname === basePath : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-emerald-400/15 text-emerald-300" : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>"""

    new_nav = """      {/* The underline is one shared layout element, so it slides between tabs instead of blinking (library #057, 0.25s). */}
      <nav className="flex gap-1 rounded-xl border border-white/[.08] bg-white/[.02] p-1">
        {tabs.map((tab) => {
          const active = tab.href === basePath ? pathname === basePath : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative rounded-lg px-4 py-2 text-sm font-semibold transition ${
                active ? "text-emerald-300" : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
              {active ? (
                <motion.span
                  layoutId="subsite-tab-underline"
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-emerald-400"
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>"""

    if old_nav not in tabs:
        raise SystemExit("tab nav markup changed - underline not applied")
    tabs = tabs.replace(old_nav, new_nav)
    TABS.write_text(tabs, encoding="utf-8", newline="\n")
    print("tabs: sliding underline added")
