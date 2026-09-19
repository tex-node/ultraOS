"use client";

import { useState } from "react";
import { CourtSvg } from "../../live/court-svg";

export type ChartShot = {
  id: string;
  x: number;
  y: number;
  made: boolean | null;
  teamId: string | null;
  description: string;
};

// Shot chart: every located shot plotted on the court, filterable by team. Makes read from the
// same x/y the console stores, so the chart and the ledger agree by construction.
export function ShotChartClient({
  homeId,
  homeName,
  awayName,
  shots,
}: {
  homeId: string;
  homeName: string;
  awayName: string;
  shots: ChartShot[];
}) {
  const [filter, setFilter] = useState<"ALL" | "HOME" | "AWAY">("ALL");
  const visible = shots.filter((shot) =>
    filter === "ALL" ? true : filter === "HOME" ? shot.teamId === homeId : shot.teamId !== homeId,
  );
  const makes = visible.filter((shot) => shot.made === true).length;
  const misses = visible.filter((shot) => shot.made === false).length;

  return (
    <div>
      <div className="no-print mt-4 flex flex-wrap items-center gap-2">
        {(["ALL", "HOME", "AWAY"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${filter === option ? "bg-emerald-400 text-zinc-950" : "border border-white/10 text-zinc-300"}`}
          >
            {option === "ALL" ? "Both teams" : option === "HOME" ? homeName : awayName}
          </button>
        ))}
        <span className="ml-2 text-sm text-zinc-400">
          {visible.length} shots · <span className="text-emerald-300">{makes} made</span> ·{" "}
          <span className="text-rose-300">{misses} missed</span>
        </span>
      </div>
      <div className="mx-auto mt-4 max-w-xl">
        <CourtSvg
          onSelect={() => {}}
          pending={null}
          dots={visible.map((shot) => ({ id: shot.id, x: shot.x, y: shot.y, made: shot.made }))}
          interactive={false}
        />
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500 no-print">Green = made, red = missed.</p>
    </div>
  );
}