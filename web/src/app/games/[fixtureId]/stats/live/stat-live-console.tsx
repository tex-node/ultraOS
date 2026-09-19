"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/app/components/submit-button";
import { GameClock } from "../../../game-clock";
import {
  confirmStartingFive,
  flipPossession,
  recordGameTimeout,
  recordJumpBall,
  recordStatisticianShot,
  recordStatisticianStat,
  recordWaveSubstitution,
  undoLastStatisticianEvent,
  verifyScoreboard,
  voidStatisticianEvent,
} from "../../../stats-actions";
import { pauseGame, resumeGame } from "../../../actions";
import { shotZone } from "@/lib/sports/shot-zones";
import { CourtSvg, type CourtPoint } from "./court-svg";

const BIG_BTN = "min-h-[52px] min-w-[52px] rounded-xl text-sm font-semibold active:scale-95 transition";
const CARD = "rounded-2xl border border-white/[.08] bg-[#0b100e] p-5";

export type LiveTeam = {
  id: string;
  name: string;
  shortName: string;
  color: string | null;
  players: { id: string; name: string }[];
  onCourt: string[];
};

export type LiveEvent = {
  id: string;
  eventType: string;
  typeKey: string | null;
  description: string;
  period: number;
  clockSeconds: number;
  status: string;
  made: boolean | null;
  x: number | null;
  y: number | null;
  courtZone: string | null;
  playerName: string | null;
  teamId: string | null;
};

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  return Math.floor(s / 60).toString().padStart(2, "0") + ":" + (s % 60).toString().padStart(2, "0");
}

export function StatLiveConsole({
  gameId,
  fixtureId,
  status,
  periodLabel,
  clockSeconds,
  clockStartedAt,
  homeScore,
  awayScore,
  fourPointEnabled,
  canOperate,
  startersConfirmed,
  teams,
  possessionTeamId,
  timeouts,
  official,
  statScore,
  lastVerification,
  events,
}: {
  gameId: string;
  fixtureId: string;
  status: string;
  period: number;
  periodLabel: string;
  clockSeconds: number;
  clockStartedAt: string | null;
  homeScore: number;
  awayScore: number;
  fourPointEnabled: boolean;
  canOperate: boolean;
  startersConfirmed: { home: boolean; away: boolean };
  teams: [LiveTeam, LiveTeam];
  possessionTeamId: string | null;
  timeouts: { home: number; away: number };
  official: { home: number; away: number };
  statScore: { home: number; away: number };
  lastVerification: { allMatch: boolean; description: string; period: number; clockSeconds: number } | null;
  events: LiveEvent[];
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0].id);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [pending, setPending] = useState<CourtPoint | null>(null);
  const [shotValue, setShotValue] = useState<2 | 3 | 1 | 4>(2);
  const [waveMode, setWaveMode] = useState(false);
  const [waveOuts, setWaveOuts] = useState<string[]>([]);
  const [waveIns, setWaveIns] = useState<string[]>([]);
  const pauseFormRef = useRef<HTMLFormElement>(null);
  const resumeFormRef = useRef<HTMLFormElement>(null);

  const team = teams.find((t) => t.id === selectedTeamId) ?? teams[0];
  const effectivePlayerId =
    selectedPlayerId && team.players.some((p) => p.id === selectedPlayerId)
      ? selectedPlayerId
      : (team.onCourt[0] ?? team.players[0]?.id ?? "");
  const pendingZone = pending ? shotZone(pending.x, pending.y) : null;

  // Spacebar toggles the game clock. Typing in a field never triggers it.
  useEffect(() => {
    if (!canOperate) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (status === "LIVE") pauseFormRef.current?.requestSubmit();
      else if (status === "PAUSED") resumeFormRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canOperate, status]);

  const toggleWaveOut = useCallback((playerId: string) => {
    setWaveOuts((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }, []);
  const toggleWaveIn = useCallback((playerId: string) => {
    setWaveIns((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }, []);

  const shotDots = events
    .filter((e) => e.x !== null && e.y !== null && e.status === "ACTIVE")
    .slice(0, 30)
    .map((e) => ({ id: e.id, x: e.x as number, y: e.y as number, made: e.made }));
  const possessionSide = possessionTeamId === teams[0].id ? teams[0].shortName : possessionTeamId === teams[1].id ? teams[1].shortName : "�";
  const isMutable = status === "LIVE" || status === "PAUSED";

  const selectTeam = (id: string) => {
    setSelectedTeamId(id);
    setSelectedPlayerId("");
    setPending(null);
    setWaveOuts([]);
    setWaveIns([]);
  };

  return (
    <div>
      {/* header: score, clock, possession, controls */}
      <section className={CARD}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <div>
            <p className="font-semibold">{teams[0].name}</p>
            <p className="font-mono text-4xl font-bold">{homeScore}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">{periodLabel}</p>
            <p className="font-mono text-3xl font-bold">
              <GameClock seconds={clockSeconds} status={status} startedAt={clockStartedAt} />
            </p>
            <p className="mt-1 text-xs text-emerald-400">{status}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Possession {possessionSide}</p>
          </div>
          <div>
            <p className="font-semibold">{teams[1].name}</p>
            <p className="font-mono text-4xl font-bold">{awayScore}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {canOperate ? (
            <>
              <form ref={pauseFormRef} action={pauseGame.bind(null, gameId, fixtureId)}>
                <SubmitButton pendingLabel="�" disabled={status !== "LIVE"} className={`${BIG_BTN} border border-white/10 px-4 text-xs`}>Pause (space)</SubmitButton>
              </form>
              <form ref={resumeFormRef} action={resumeGame.bind(null, gameId, fixtureId)}>
                <SubmitButton pendingLabel="�" disabled={status !== "PAUSED"} className={`${BIG_BTN} border border-white/10 px-4 text-xs`}>Resume (space)</SubmitButton>
              </form>
            </>
          ) : null}
          {isMutable ? (
            <>
              <form action={flipPossession.bind(null, gameId, fixtureId)}>
                <input type="hidden" name="seasonClubId" value={possessionTeamId === teams[0].id ? teams[1].id : teams[0].id} />
                <SubmitButton pendingLabel="�" className={`${BIG_BTN} border border-white/10 px-4 text-xs`}>Flip arrow</SubmitButton>
              </form>
              <form action={recordJumpBall.bind(null, gameId, fixtureId)}>
                <input type="hidden" name="seasonClubId" value={teams[0].id} />
                <SubmitButton pendingLabel="�" className={`${BIG_BTN} border border-white/10 px-4 text-xs`}>Jump: {teams[0].shortName}</SubmitButton>
              </form>
              <form action={recordJumpBall.bind(null, gameId, fixtureId)}>
                <input type="hidden" name="seasonClubId" value={teams[1].id} />
                <SubmitButton pendingLabel="�" className={`${BIG_BTN} border border-white/10 px-4 text-xs`}>Jump: {teams[1].shortName}</SubmitButton>
              </form>
              <form action={recordGameTimeout.bind(null, gameId, fixtureId)}>
                <input type="hidden" name="seasonClubId" value={selectedTeamId} />
                <SubmitButton pendingLabel="�" className={`${BIG_BTN} border border-amber-400/30 px-4 text-xs text-amber-300`}>Timeout</SubmitButton>
              </form>
            </>
          ) : null}
          <p className="mt-3 w-full text-center text-xs text-zinc-500">
            Timeouts {teams[0].shortName} {timeouts.home} · {teams[1].shortName} {timeouts.away}
            {lastVerification ? (
              <span className={lastVerification.allMatch ? "text-emerald-300" : "text-rose-300"}>
                {" "}· Score {lastVerification.allMatch ? "verified" : "MISMATCH"} (P{lastVerification.period} {mmss(lastVerification.clockSeconds)})
              </span>
            ) : null}
          </p>
        </div>
      </section>

      {/* timeouts + scoreboard verification */}
      {isMutable ? (
        <section className={`${CARD} mt-6`}>
          <h3 className="font-semibold">Verify against the venue scoreboard</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            During a timeout or stoppage, read the building&apos;s board and confirm the app matches it. Official{" "}
            {official.home}–{official.away} · Statistician {statScore.home}–{statScore.away}.
          </p>
          <form action={verifyScoreboard.bind(null, gameId, fixtureId)} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <label className="text-xs text-zinc-400">
              Venue home
              <input name="venueHomeScore" type="number" min={0} max={300} required defaultValue={official.home} className="mt-1 min-h-[48px] w-full rounded-lg bg-white/[.05] p-3 text-sm text-white" />
            </label>
            <label className="text-xs text-zinc-400">
              Venue away
              <input name="venueAwayScore" type="number" min={0} max={300} required defaultValue={official.away} className="mt-1 min-h-[48px] w-full rounded-lg bg-white/[.05] p-3 text-sm text-white" />
            </label>
            <label className="text-xs text-zinc-400">
              Note (optional)
              <input name="note" placeholder="e.g. checked at the media timeout" className="mt-1 min-h-[48px] w-full rounded-lg bg-white/[.05] p-3 text-sm text-white" />
            </label>
            <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 px-5 text-sm text-emerald-300`}>Verify</SubmitButton>
          </form>
        </section>
      ) : null}

      {/* starters gate */}
      {!startersConfirmed.home || !startersConfirmed.away ? (
        <section className={`${CARD} mt-6`}>
          <h3 className="font-semibold">Confirm starting fives</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Pick exactly five per team before the tip. Shots and subs need confirmed starters.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {teams.map((t, index) => {
              const confirmed = index === 0 ? startersConfirmed.home : startersConfirmed.away;
              if (confirmed) return <p key={t.id} className="text-sm text-emerald-300">{t.name} starters confirmed.</p>;
              return (
                <form key={t.id} action={confirmStartingFive.bind(null, gameId, fixtureId)} className="rounded-xl border border-white/[.06] p-4">
                  <input type="hidden" name="seasonClubId" value={t.id} />
                  <h4 className="text-sm font-semibold">{t.name}</h4>
                  <div className="mt-2 grid gap-1">
                    {t.players.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-300">
                        <input type="checkbox" name="playerIds" value={p.id} /> {p.name}
                      </label>
                    ))}
                  </div>
                  <SubmitButton pendingLabel="�" className={`${BIG_BTN} mt-3 border border-emerald-400/30 px-4 text-xs text-emerald-300`}>Confirm five</SubmitButton>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* roster strips */}
      <section className={`${CARD} mt-6`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Roster</h3>
          <div className="flex gap-2">
            {teams.map((t) => (
              <button key={t.id} type="button" onClick={() => selectTeam(t.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${t.id === selectedTeamId ? "bg-emerald-400 text-zinc-950" : "border border-white/10 text-zinc-300"}`}>
                {t.shortName}
              </button>
            ))}
            <button type="button" onClick={() => { setWaveMode((v) => !v); setWaveOuts([]); setWaveIns([]); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${waveMode ? "bg-amber-400 text-zinc-950" : "border border-amber-400/30 text-amber-300"}`}>
              {waveMode ? "Wave: ON" : "Wave sub"}
            </button>
          </div>
        </div>

        {teams.map((t) => (
          <div key={t.id} className="mt-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">{t.name} � on court</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {t.players.filter((p) => t.onCourt.includes(p.id)).map((p) => {
                const isOut = waveOuts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (waveMode && t.id === selectedTeamId) toggleWaveOut(p.id);
                      else if (!waveMode) { selectTeam(t.id); setSelectedPlayerId(p.id); }
                    }}
                    className={`min-h-[48px] rounded-xl border px-3 text-xs font-semibold ${waveMode && t.id === selectedTeamId && isOut ? "border-rose-400 bg-rose-500/20 text-rose-200" : p.id === effectivePlayerId && t.id === selectedTeamId ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-zinc-200"}`}
                    style={t.color ? { borderLeftColor: t.color, borderLeftWidth: 4 } : undefined}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">{t.name} � bench</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {t.players.filter((p) => !t.onCourt.includes(p.id)).map((p) => {
                const isIn = waveIns.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (waveMode && t.id === selectedTeamId) toggleWaveIn(p.id);
                      else if (!waveMode) { selectTeam(t.id); setSelectedPlayerId(p.id); }
                    }}
                    className={`min-h-[48px] rounded-xl border px-3 text-xs ${waveMode && t.id === selectedTeamId && isIn ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-zinc-400"}`}
                    style={t.color ? { borderLeftColor: t.color, borderLeftWidth: 4 } : undefined}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {waveMode ? (
          <form action={recordWaveSubstitution.bind(null, gameId, fixtureId)} className="mt-4 rounded-xl border border-amber-400/20 p-4">
            <input type="hidden" name="seasonClubId" value={selectedTeamId} />
            {waveOuts.map((id) => <input key={"o" + id} type="hidden" name="playerOutIds" value={id} />)}
            {waveIns.map((id) => <input key={"i" + id} type="hidden" name="playerInIds" value={id} />)}
            <p className="text-sm text-zinc-300">Wave for {team.shortName}: {waveOuts.length} out, {waveIns.length} in.</p>
            <SubmitButton pendingLabel="�" disabled={waveOuts.length === 0 || waveOuts.length !== waveIns.length} className={`${BIG_BTN} mt-3 bg-amber-400 px-5 text-sm text-zinc-950 disabled:opacity-40`}>Apply wave</SubmitButton>
          </form>
        ) : null}
      </section>

      {/* shot panel + court */}
      <section className={`${CARD} mt-6`}>
        <h3 className="font-semibold">Log a shot � {team.name}</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {effectivePlayerId ? team.players.find((p) => p.id === effectivePlayerId)?.name : "Pick a player above"} � click the court, then Made or Missed.
          {pending && pendingZone ? ` Marked ${pending.x}, ${pending.y} ft (${pendingZone.replace(/_/g, " ")}).` : ""}
        </p>
        <div className="mt-3 flex gap-2">
          {(fourPointEnabled ? [2, 3, 4, 1] : [2, 3, 1]).map((value) => (
            <button key={value} type="button" onClick={() => setShotValue(value as 2 | 3 | 1 | 4)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${shotValue === value ? "bg-emerald-400 text-zinc-950" : "border border-white/10 text-zinc-300"}`}>
              {value === 1 ? "FT" : value + "PT"}
            </button>
          ))}
          <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400">Clear mark</button>
        </div>
        <div className="mx-auto mt-4 max-w-md">
          <CourtSvg onSelect={setPending} pending={pending} dots={shotDots} />
        </div>
        <form action={recordStatisticianShot.bind(null, gameId, fixtureId)} className="mt-4 flex flex-wrap gap-2" onSubmit={() => setPending(null)}>
          <input type="hidden" name="seasonClubId" value={team.id} />
          <input type="hidden" name="playerId" value={effectivePlayerId} />
          <input type="hidden" name="shotValue" value={shotValue} />
          {pending ? <input type="hidden" name="x" value={pending.x} /> : null}
          {pending ? <input type="hidden" name="y" value={pending.y} /> : null}
          <SubmitButton pendingLabel="�" disabled={!effectivePlayerId || (shotValue !== 1 && !pending)} className={`${BIG_BTN} flex-1 border border-emerald-400/40 px-5 text-emerald-300 disabled:opacity-40`} name="made" value="true">Made</SubmitButton>
          <SubmitButton pendingLabel="�" disabled={!effectivePlayerId || (shotValue !== 1 && !pending)} className={`${BIG_BTN} flex-1 border border-rose-400/40 px-5 text-rose-300 disabled:opacity-40`} name="made" value="false">Missed</SubmitButton>
        </form>
        <OtherStats gameId={gameId} fixtureId={fixtureId} teamId={team.id} playerId={effectivePlayerId} />
      </section>

      {/* action log */}
      <section className={`${CARD} mt-6`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Action log</h3>
          <form action={undoLastStatisticianEvent.bind(null, gameId, fixtureId)}>
            <SubmitButton pendingLabel="�" className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-300">Undo last</SubmitButton>
          </form>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-zinc-200">{event.description}</p>
                  <p className="text-xs text-zinc-500">P{event.period} � {mmss(event.clockSeconds)}{event.courtZone ? ` � ${event.courtZone.replace(/_/g, " ")}` : ""} � {event.status}</p>
                </div>
                {event.status === "ACTIVE" ? (
                  <form action={voidStatisticianEvent.bind(null, gameId, fixtureId)} className="shrink-0">
                    <input type="hidden" name="eventId" value={event.id} />
                    <SubmitButton pendingLabel="�" className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-400" title="Void this entry">Void</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OtherStats({ gameId, fixtureId, teamId, playerId }: { gameId: string; fixtureId: string; teamId: string; playerId: string }) {
  const stats = [
    ["OFFENSIVE_REBOUND", "O-REB"],
    ["DEFENSIVE_REBOUND", "D-REB"],
    ["ASSIST", "AST"],
    ["STEAL", "STL"],
    ["BLOCK", "BLK"],
    ["TURNOVER", "TO"],
    ["FOUL", "FOUL"],
  ] as const;
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {stats.map(([typeKey, label]) => (
        <form key={typeKey} action={recordStatisticianStat.bind(null, gameId, fixtureId)}>
          <input type="hidden" name="seasonClubId" value={teamId} />
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="eventType" value={typeKey} />
          <SubmitButton pendingLabel="�" disabled={!playerId} className={`${BIG_BTN} w-full border border-white/10 px-2 text-xs text-zinc-300 disabled:opacity-40`}>{label}</SubmitButton>
        </form>
      ))}
    </div>
  );
}