"use client";

import { useCallback } from "react";
import { BASKET_X_FT, BASKET_Y_FT, COURT_WIDTH_FT, HALF_COURT_Y_FT } from "@/lib/sports/shot-zones";

export type CourtPoint = { x: number; y: number };
export type CourtDot = CourtPoint & { made: boolean | null; id: string };

const VIEW_W = COURT_WIDTH_FT;
const VIEW_H = HALF_COURT_Y_FT;
const toSy = (y: number) => VIEW_H - y;

const LINE = "stroke-white/25";
const LINE_W = 0.25;

// One attacking half, basket at the top. Both teams shoot at this basket: the stored (x, y) is
// always relative to the basket being attacked (see lib/sports/shot-zones).
export function CourtSvg({
  onSelect,
  pending,
  dots,
  interactive = true,
}: {
  onSelect: (point: CourtPoint) => void;
  pending: CourtPoint | null;
  dots: CourtDot[];
  interactive?: boolean;
}) {
  const handleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = Math.min(COURT_WIDTH_FT, Math.max(0, ((event.clientX - rect.left) / rect.width) * VIEW_W));
      const y = Math.min(HALF_COURT_Y_FT, Math.max(0, VIEW_H - ((event.clientY - rect.top) / rect.height) * VIEW_H));
      onSelect({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    },
    [onSelect],
  );

  const rimSy = toSy(BASKET_Y_FT);

  return (
    <svg
      viewBox={"0 0 " + VIEW_W + " " + VIEW_H}
      onClick={interactive ? handleClick : undefined}
      className={"h-auto w-full rounded-xl " + (interactive ? "cursor-crosshair touch-manipulation" : "")}
      role="application"
      aria-label="Basketball court. Activate to log a shot location."
    >
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#0e1411" stroke="rgba(255,255,255,0.25)" strokeWidth={LINE_W} />
      <line x1={0} y1={0} x2={VIEW_W} y2={0} className={LINE} strokeWidth={0.5} />
      <rect x={17} y={toSy(19)} width={16} height={19} fill="rgba(52,211,153,0.07)" className={LINE} strokeWidth={LINE_W} />
      <circle cx={BASKET_X_FT} cy={toSy(19)} r={6} fill="none" className={LINE} strokeWidth={LINE_W} />
      <path d={"M " + (BASKET_X_FT - 4) + " " + rimSy + " A 4 4 0 0 1 " + (BASKET_X_FT + 4) + " " + rimSy} fill="none" className={LINE} strokeWidth={LINE_W} />
      <line x1={3} y1={VIEW_H} x2={3} y2={toSy(14)} className={LINE} strokeWidth={LINE_W} />
      <line x1={47} y1={VIEW_H} x2={47} y2={toSy(14)} className={LINE} strokeWidth={LINE_W} />
      <path d={"M 3 " + toSy(14) + " A 23.75 23.75 0 0 1 47 " + toSy(14)} fill="none" className={LINE} strokeWidth={LINE_W} />
      <line x1={22} y1={toSy(4)} x2={28} y2={toSy(4)} stroke="rgba(255,255,255,0.6)" strokeWidth={0.4} />
      <circle cx={BASKET_X_FT} cy={rimSy} r={0.75} fill="#f59e0b" />
      {dots.map((dot) => (
        <circle
          key={dot.id}
          cx={dot.x}
          cy={toSy(dot.y)}
          r={0.8}
          fill={dot.made === false ? "#fb7185" : "#34d399"}
          opacity={0.85}
        />
      ))}
      {pending ? (
        <g>
          <circle cx={pending.x} cy={toSy(pending.y)} r={1.3} fill="none" stroke="#fbbf24" strokeWidth={0.4} />
          <line x1={pending.x - 2.2} y1={toSy(pending.y)} x2={pending.x + 2.2} y2={toSy(pending.y)} stroke="#fbbf24" strokeWidth={0.25} />
          <line x1={pending.x} y1={toSy(pending.y) - 2.2} x2={pending.x} y2={toSy(pending.y) + 2.2} stroke="#fbbf24" strokeWidth={0.25} />
        </g>
      ) : null}
    </svg>
  );
}