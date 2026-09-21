"use client";

import { useEffect, useState } from "react";

const FALLBACK_TEAM_COLOR = "#16F2B3";

type TeamData = {
  name: string;
  shortName: string;
  color: string | null;
};

type Data = {
  status: string;
  period: number;
  clockSeconds: number;
  updatedAt: string;
  tournament: string;
  sport: string;
  fixture: {
    status: string;
    homeScore: number;
    awayScore: number;
    venue: string;
    home: TeamData;
    away: TeamData;
  };
};

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function Scoreboard({ gameId, initial }: { gameId: string; initial: Data }) {
  const [data, setData] = useState(initial);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const tick = async () => {
      try {
        const response = await fetch(`/api/games/${gameId}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        setData(await response.json());
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [gameId]);

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-ink-950 p-8 text-white">
      <header className="flex justify-between">
        <div>
          <p className="font-display text-2xl font-bold">{data.tournament.toUpperCase()}</p>
          <p className="mt-1 text-xs tracking-[.3em] text-brand-400">{data.sport.toUpperCase()} · {data.status === "FINAL" ? "FINAL SCOREBOARD" : "LIVE SCOREBOARD"}</p>
        </div>
        <div
          className={`rounded-full px-4 py-2 text-xs font-semibold ${
            connected ? "bg-brand-400/10 text-brand-400" : "bg-danger/10 text-danger"
          }`}
        >
          {connected ? "CONNECTED" : "STALE DATA"}
        </div>
      </header>
      <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-10 text-center">
        <Team t={data.fixture.home} score={data.fixture.homeScore} />
        <div>
          <p className="text-sm tracking-[.3em] text-text-3">PERIOD {data.period}</p>
          <p className="mt-4 font-mono text-8xl font-black tabular-nums">{clock(data.clockSeconds)}</p>
          <p className={`mt-5 text-xl ${data.status === "LIVE" ? "text-danger" : "text-brand-400"}`}>{data.status}</p>
        </div>
        <Team t={data.fixture.away} score={data.fixture.awayScore} />
      </section>
      <footer className="flex justify-between border-t border-line pt-5 text-sm text-text-2">
        <span>{data.fixture.venue}</span>
        <span>SPONSOR PLACEHOLDER</span>
        <span>Neon Ultra</span>
      </footer>
    </main>
  );
}

function Team({ t, score }: { t: TeamData; score: number }) {
  const displayColor = t.color ?? FALLBACK_TEAM_COLOR;

  return (
    <div>
      <div
        className="mx-auto grid h-32 w-32 place-items-center rounded-lg border text-3xl font-bold"
        style={{
          color: displayColor,
          borderColor: `${displayColor}55`,
          background: `${displayColor}12`,
        }}
      >
        {t.shortName}
      </div>
      <h1 className="mt-6 font-display text-4xl font-bold">{t.name}</h1>
      <p className="mt-6 font-mono text-9xl font-black tabular-nums" style={{ color: displayColor }}>
        {score}
      </p>
    </div>
  );
}
