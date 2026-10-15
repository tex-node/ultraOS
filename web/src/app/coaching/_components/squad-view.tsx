import Link from "next/link";
import type { PlayerDevelopmentPlan } from "@/lib/coaching/player-development";
import { SQUAD_SETUP_BANNER } from "@/lib/coaching/squad-setup";
import { Banner, Card, ConfidenceChip, Num } from "./ui";
import { PrintButton } from "./print-button";

export type UnassessedPlayer = { playerId: string; name: string; jerseyNumber: number | null };

// Squad page: one card per player (top focus areas with a confidence chip, strengths, quiet
// INSUFFICIENT_DATA). On print it becomes a training-week sheet: focus areas + drill names only.

function PlayerCard({ plan, seasonClubId }: { plan: PlayerDevelopmentPlan; seasonClubId: string }) {
  const insufficient = plan.status === "INSUFFICIENT_DATA";
  return (
    <li data-player={plan.playerId}>
      <Card quiet={insufficient}>
        <Link href={`/coaching/${seasonClubId}/players/${plan.playerId}`} className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-text-1">
            {plan.jerseyNumber != null ? <span className="mr-1 tabular-nums text-text-3">#{plan.jerseyNumber}</span> : null}
            {plan.name}
          </span>
          <span className="text-xs text-text-3">
            {plan.position && plan.positionGroup !== "UNKNOWN" ? `${plan.position} · ` : ""}
            <Num>{plan.gamesPlayed}</Num> GP
          </span>
        </Link>
        {insufficient ? (
          <p data-state="insufficient" className="mt-2 text-xs text-text-3">Not enough data yet: {plan.gamesPlayed} games played.</p>
        ) : (
          <>
            {plan.focusAreas.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {plan.focusAreas.map((f) => (
                  <li key={f.dimension} className="flex items-center justify-between gap-2 text-sm text-text-1">
                    <span>{f.label} <span className="text-xs text-text-3">{f.evidence.playerValueLabel}</span></span>
                    <ConfidenceChip confidence={f.evidence.confidence} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-text-3">No focus areas this season.</p>
            )}
            {plan.strengths.length > 0 ? (
              <p className="mt-2 text-xs text-brand-400">Strengths: {plan.strengths.map((s) => s.label).join(", ")}</p>
            ) : null}
          </>
        )}
      </Card>
    </li>
  );
}

export function SquadView({
  seasonClubId,
  clubName,
  plans,
  unassessed,
  needsPositions,
}: {
  seasonClubId: string;
  clubName: string;
  plans: PlayerDevelopmentPlan[];
  unassessed: UnassessedPlayer[];
  needsPositions: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-text-1">{clubName} squad</h1>
        <PrintButton label="Print training week" />
      </div>

      {needsPositions ? (
        <div className="mt-3 print:hidden" data-banner="positions">
          <Banner>
            {SQUAD_SETUP_BANNER}{" "}
            <Link href={`/coaching/${seasonClubId}/squad/setup`} className="font-semibold text-info underline">Set up the squad</Link>
          </Banner>
        </div>
      ) : (
        <p className="mt-2 text-xs text-text-3 print:hidden">
          <Link href={`/coaching/${seasonClubId}/squad/setup`} className="text-info">Edit positions and heights</Link>
        </p>
      )}

      <ul className="mt-4 space-y-3 print:hidden">
        {plans.map((p) => <PlayerCard key={p.playerId} plan={p} seasonClubId={seasonClubId} />)}
        {unassessed.map((p) => (
          <li key={p.playerId} data-player={p.playerId}>
            <Card quiet>
              <p className="text-base font-semibold text-text-1">
                {p.jerseyNumber != null ? <span className="mr-1 tabular-nums text-text-3">#{p.jerseyNumber}</span> : null}
                {p.name}
              </p>
              <p data-state="insufficient" className="mt-1 text-xs text-text-3">No games played yet.</p>
            </Card>
          </li>
        ))}
      </ul>

      <div className="mt-4 hidden print:block" data-print="training-week">
        <p className="text-sm">Training week: focus areas and drills</p>
        {plans.filter((p) => p.focusAreas.length > 0).map((p) => (
          <div key={p.playerId} className="mt-2 break-inside-avoid border-t pt-1 text-xs">
            <p className="font-semibold">{p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ""}{p.name}</p>
            <ul>
              {p.focusAreas.map((f) => (
                <li key={f.dimension}>{f.label}: {f.target.statement} Drills: {f.drills.map((d) => d.name).join("; ")}.</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
