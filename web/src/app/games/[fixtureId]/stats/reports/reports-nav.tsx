"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Reports navigation with the Quick Print header button (transcript 17:20): box scores,
// play-by-play and shot charts render from live data, and print with one click.
export function ReportsNav({ fixtureId }: { fixtureId: string }) {
  const pathname = usePathname();
  const tabs = [
    ["box-score", "Box score"],
    ["play-by-play", "Play-by-play"],
    ["shot-chart", "Shot chart"],
  ] as const;

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      {tabs.map(([slug, label]) => {
        const href = `/games/${fixtureId}/stats/reports/${slug}`;
        const active = pathname === href;
        return (
          <Link
            key={slug}
            href={href}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${active ? "bg-emerald-400 text-zinc-950" : "border border-white/10 text-zinc-300 hover:border-white/25"}`}
          >
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-300 hover:border-amber-400"
      >
        Quick Print
      </button>
    </div>
  );
}