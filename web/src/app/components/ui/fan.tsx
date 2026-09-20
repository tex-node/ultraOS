import Image from "next/image";

// D1 QR ticket card: scannable QR, code, and status on a light card for contrast.
export function QrCard({
  code,
  title,
  subtitle,
  status,
}: {
  code: string;
  title: string;
  subtitle: string;
  status: string;
}) {
  return (
    <section className="rounded-lg bg-white p-6 text-center text-zinc-950">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-700">{title}</p>
      <p className="mt-2 text-sm">{subtitle}</p>
      <Image src={`/api/qr/${code}`} alt="QR code" width={260} height={260} className="mx-auto mt-4" unoptimized />
      <p className="mt-2 break-all font-mono text-xs text-zinc-500">{code}</p>
      <p className="mt-2 text-sm font-semibold">{status}</p>
    </section>
  );
}

// D1 mini score bug: two sides and a scoreline, one line, tabular numerals.
export function ScorePill({
  home,
  away,
  homeScore,
  awayScore,
  href,
}: {
  home: string;
  away: string;
  homeScore: number | string;
  awayScore: number | string;
  href?: string;
}) {
  const body = (
    <>
      <span className="font-bold">{home}</span>
      <span className="font-mono font-black tabular-nums">
        {homeScore} – {awayScore}
      </span>
      <span className="font-bold">{away}</span>
    </>
  );
  const className = "inline-flex items-center gap-3 rounded-full border border-line bg-ink-800 px-4 py-2 text-sm text-text-1";
  return href ? (
    <a href={href} className={`${className} transition hover:border-brand-400/40`}>
      {body}
    </a>
  ) : (
    <span className={className}>{body}</span>
  );
}

// D1 bracket matchup node: two entrants, optional scores, winner highlighted.
export function BracketNode({
  home,
  away,
  homeScore,
  awayScore,
  label,
}: {
  home: string;
  away: string;
  homeScore?: number | null;
  awayScore?: number | null;
  label?: string;
}) {
  const decided = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;
  const homeWon = decided && (homeScore as number) > (awayScore as number);
  const row = (name: string, score: number | null | undefined, won: boolean) => (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className={`truncate text-sm ${won ? "font-bold text-white" : "text-text-2"}`}>{name}</span>
      <span className={`font-mono font-black tabular-nums ${won ? "text-brand-300" : "text-text-3"}`}>
        {score ?? "–"}
      </span>
    </div>
  );
  return (
    <div className="w-64 overflow-hidden rounded-lg border border-line bg-ink-800">
      {label ? <p className="border-b border-line px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-text-3">{label}</p> : null}
      {row(home, homeScore ?? null, homeWon)}
      <div className="border-t border-line" />
      {row(away, awayScore ?? null, decided && !homeWon)}
    </div>
  );
}
