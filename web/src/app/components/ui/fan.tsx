import Image from "next/image";

// D1 QR ticket card (handoff components.md §QR card): elevated card with green glow, QR on
// light at >= 132px, mono code spaced, status pill under the code, dashed divider.
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
    <section className="rounded-lg border border-line bg-ink-600 p-6 shadow-glow-green">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">{title}</p>
      <p className="mt-1 text-sm text-text-2">{subtitle}</p>
      <div className="my-4 border-t border-dashed border-line-strong" />
      <div className="rounded-md bg-[#f9fafb] p-4 text-center">
        <Image src={`/api/qr/${code}`} alt="QR code" width={220} height={220} className="mx-auto" unoptimized />
      </div>
      <p className="mt-3 break-all text-center font-mono text-base tracking-[0.14em] text-text-1">{code}</p>
      <div className="mt-3 text-center">
        <span className="inline-block rounded-full border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-300">
          {status}
        </span>
      </div>
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
