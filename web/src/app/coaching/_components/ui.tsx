import type { ReactNode } from "react";

// Shared presentation for the coach-private pages (Neon Ultra tokens: dark surfaces, 1px borders,
// neon green only as a signal). Server-safe: no hooks, so these also render in plain unit tests.
// Low-sample content is made quieter (muted text, lower opacity) but never hidden.

export function ConfidenceChip({ confidence }: { confidence: "HIGH" | "MEDIUM" }) {
  const tone = confidence === "HIGH" ? "border-brand-400/40 text-brand-400" : "border-warn/40 text-warn";
  return (
    <span data-chip="confidence" className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {confidence}
    </span>
  );
}

export type Verdict = "HELD" | "BROKEN" | "NOT_TESTABLE";

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const tone =
    verdict === "HELD" ? "border-success/40 text-success" : verdict === "BROKEN" ? "border-danger/40 text-danger" : "border-line-strong text-text-3";
  return (
    <span data-chip="verdict" className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {verdict === "NOT_TESTABLE" ? "Not testable" : verdict}
    </span>
  );
}

export function Card({ children, quiet = false, className = "" }: { children: ReactNode; quiet?: boolean; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-ink-800 p-4 ${quiet ? "opacity-70" : ""} ${className}`}>{children}</section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[.15em] text-text-3">{children}</h2>;
}

export function Num({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

export function Banner({ children }: { children: ReactNode }) {
  return <div role="note" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-text-1">{children}</div>;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
