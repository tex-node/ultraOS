"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

// Sub-site tabs + share button (product roadmap F2). Client-side only for the active-tab
// highlight and the Web Share API (with clipboard fallback); everything else is static.
export function SubSiteTabs({ basePath, title }: { basePath: string; title: string }) {
  const pathname = usePathname();
  const [shared, setShared] = useState(false);
  const tabs = [
    { href: basePath, label: "Overview" },
    { href: `${basePath}/fixtures`, label: "Fixtures & Stats" },
  ];
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      throw new Error("no-web-share");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // Clipboard unavailable (permissions, insecure context) — the URL bar still works.
      }
    }
  };
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex gap-1 rounded-xl border border-white/[.08] bg-white/[.02] p-1">
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
      </nav>
      <button
        onClick={share}
        type="button"
        className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:border-white/20 hover:text-white"
      >
        {shared ? "Link copied ✓" : "Share"}
      </button>
    </div>
  );
}
