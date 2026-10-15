import Link from "next/link";
import type { DefensiveAssignment, GamePlan, KeyToTheGame, LateGamePlan } from "@/lib/coaching/game-plan";
import { Card, ConfidenceChip, formatDate, Num, SectionTitle } from "./ui";
import { PrintButton } from "./print-button";

export type PlayedGame = { gameId: string; scheduledAt: Date; focusScore: number; opponentScore: number };

// Pre-game plan for one opponent (ADR-011): Keys to the Game with Evidence on tap, "how they beat
// us", read-only defensive assignments, the late-game plan and head-to-head. On print it is one
// A4 sheet: keys, assignments, late game and the opponent's top three.

function KeyCard({ k, index }: { k: KeyToTheGame; index: number }) {
  return (
    <li data-key={k.kind}>
      <Card quiet={k.confidence === "MEDIUM"}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-text-1"><span className="mr-2 tabular-nums text-text-3">{index + 1}</span>{k.title}</h3>
          <ConfidenceChip confidence={k.confidence} />
        </div>
        <p className="mt-1 text-sm text-text-2">{k.rationale}</p>
        <details className="mt-2 text-xs text-text-2 print:hidden">
          <summary className="cursor-pointer select-none text-info">Evidence</summary>
          <ul className="mt-2 space-y-1">
            {k.evidence.map((e) => (
              <li key={e.metric}><span className="text-text-3">{e.metric}:</span> <Num>{e.value}</Num> <span className="text-text-3">({e.baseline}; {e.sample})</span></li>
            ))}
          </ul>
        </details>
        <p className="mt-1 hidden text-xs print:block">{k.evidence.map((e) => `${e.metric} ${e.value} (${e.baseline})`).join("; ")}</p>
      </Card>
    </li>
  );
}

function Assignment({ a }: { a: DefensiveAssignment }) {
  const label = (p: { name: string; jerseyNumber: number | null }) => `${p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ""}${p.name}`;
  return (
    <li data-assignment={a.threat.playerId} className="rounded-md border border-line-subtle p-2">
      <p className="text-sm text-text-1">
        {label(a.threat)} <span className="text-xs text-text-3"><Num>{a.threat.ppg}</Num> PPG</span>
      </p>
      {a.defender ? (
        <>
          <p className="text-sm text-brand-400">Guard with {label(a.defender)}</p>
          <p className="text-xs text-text-2">{a.reasons.join("; ")}</p>
          {a.alternatives.length > 0 ? <p className="text-xs text-text-3">Alternatives: {a.alternatives.map(label).join(", ")}</p> : null}
        </>
      ) : (
        <p className="text-xs text-text-3">{a.reasons.join(" ")}</p>
      )}
    </li>
  );
}

const ROLE_LABEL = { FREE_THROWS: "Free throws", THREE_POINT: "Three-pointer", FOUR_POINT: "Four-pointer" } as const;

function LateGame({ late }: { late: LateGamePlan }) {
  const label = (p: { name: string; jerseyNumber: number | null }) => `${p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ""}${p.name}`;
  return (
    <Card>
      <ul className="space-y-1 text-sm text-text-1">
        {late.closers.map((c) => (
          <li key={c.role}><span className="text-text-3">{ROLE_LABEL[c.role]}:</span> {label(c.player)} <span className="text-xs text-text-3"><Num>{c.value}</Num> ({c.sample})</span></li>
        ))}
        {late.deny ? <li><span className="text-text-3">Deny:</span> {label(late.deny)}</li> : null}
        {late.foulTarget ? <li><span className="text-text-3">Foul:</span> {label(late.foulTarget)} <span className="text-xs text-text-3"><Num>{late.foulTarget.ftPct}</Num> ({late.foulTarget.sample})</span></li> : null}
      </ul>
      {late.notes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {late.notes.map((n) => <li key={n} data-note="late-game" className="text-xs text-text-3">{n}</li>)}
        </ul>
      ) : null}
    </Card>
  );
}

export function GamePlanView({ plan, seasonClubId, played }: { plan: GamePlan; seasonClubId: string; played: PlayedGame[] }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-text-1">vs {plan.opponent.name}</h1>
          <p className="mt-1 text-xs text-text-3">
            {plan.focus.name} · <Num>{plan.opponent.games}</Num> opponent games · head-to-head <Num>{plan.headToHead.focusWins}-{plan.headToHead.focusLosses}</Num>
          </p>
        </div>
        <PrintButton label="Print pre-game sheet" />
      </div>

      {plan.status === "INSUFFICIENT_DATA" ? (
        <Card quiet className="mt-4">
          <p data-state="insufficient" className="text-sm text-text-2">{plan.insufficientReason}</p>
        </Card>
      ) : (
        <>
          <SectionTitle>Keys to the game</SectionTitle>
          {plan.keys.length > 0 ? (
            <ul className="space-y-3">{plan.keys.map((k, i) => <KeyCard key={k.kind} k={k} index={i} />)}</ul>
          ) : (
            <p className="text-sm text-text-3">Nothing stands out about {plan.opponent.name} yet. Keep to your own game.</p>
          )}

          <SectionTitle>How they beat us</SectionTitle>
          {plan.howTheyBeatUs.length > 0 ? (
            <ul className="space-y-3 print:hidden">{plan.howTheyBeatUs.map((k, i) => <KeyCard key={k.kind} k={k} index={i} />)}</ul>
          ) : (
            <p className="text-sm text-text-3">No clear route stands out against {plan.focus.name}.</p>
          )}

          <SectionTitle>Defensive assignments</SectionTitle>
          <ul className="space-y-2">{plan.assignments.map((a) => <Assignment key={a.threat.playerId} a={a} />)}</ul>
          <p data-note="defense" className="mt-2 text-xs text-text-3">{plan.defenseNote}</p>

          <SectionTitle>Late game</SectionTitle>
          {plan.lateGame ? <LateGame late={plan.lateGame} /> : null}
        </>
      )}

      <SectionTitle>Head-to-head</SectionTitle>
      {played.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {played.map((g) => (
            <li key={g.gameId} className="flex items-center justify-between gap-2">
              <span className="text-text-2">{formatDate(g.scheduledAt)} · <Num>{g.focusScore}-{g.opponentScore}</Num></span>
              <Link href={`/coaching/${seasonClubId}/review/${g.gameId}`} className="text-xs text-info print:hidden">Post-game review</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-3">Not played yet this season.</p>
      )}
    </div>
  );
}
