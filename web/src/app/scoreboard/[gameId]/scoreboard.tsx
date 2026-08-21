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
    <main className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-[#020403] p-8 text-white">
      <header className="flex justify-between">
        <div>
          <p className="text-2xl font-black">ULTRA BASKETBALL</p>
          <p className="text-xs tracking-[.3em] text-emerald-400">LIVE SCOREBOARD</p>
        </div>
        <div
          className={`rounded-full px-4 py-2 text-xs ${
            connected ? "bg-emerald-400/10 text-emerald-400" : "bg-rose-400/10 text-rose-400"
          }`}
        >
          {connected ? "CONNECTED" : "STALE DATA"}
        </div>
      </header>
      <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-10 text-center">
        <Team t={data.fixture.home} score={data.fixture.homeScore} />
        <div>
          <p className="text-sm tracking-[.3em] text-zinc-500">PERIOD {data.period}</p>
          <p className="mt-4 font-mono text-8xl font-black">{clock(data.clockSeconds)}</p>
          <p className="mt-5 text-xl text-emerald-400">{data.status}</p>
        </div>
        <Team t={data.fixture.away} score={data.fixture.awayScore} />
      </section>
      <footer className="flex justify-between border-t border-white/10 pt-5 text-sm text-zinc-400">
        <span>{data.fixture.venue}</span>
        <span>SPONSOR PLACEHOLDER</span>
        <span>Updates every 2 seconds</span>
      </footer>
    </main>
  );
}

function Team({ t, score }: { t: TeamData; score: number }) {
  const displayColor = t.color ?? FALLBACK_TEAM_COLOR;

  return (
    <div>
      <div
        className="mx-auto grid h-32 w-32 place-items-center rounded-3xl border text-3xl font-black"
        style={{
          color: displayColor,
          borderColor: `${displayColor}55`,
          background: `${displayColor}12`,
        }}
      >
        {t.shortName}
      </div>
      <h1 className="mt-6 text-4xl font-black">{t.name}</h1>
      <p className="mt-6 text-9xl font-black" style={{ color: displayColor }}>
        {score}
      </p>
    </div>
  );
}
