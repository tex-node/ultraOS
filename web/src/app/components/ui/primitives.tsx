import Link from "next/link";

// D1 card + badge primitives. Depth from surface color + border (system §3) — glow is
// reserved for active/selected states, never default card chrome.
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-ink-800 p-5 ${className}`}>{children}</section>;
}

// Badge tones follow system §13: Active green, Live RED, Upcoming blue, Completed slate,
// Draft purple, Featured amber. Status is always text as well as color.
type BadgeTone = "active" | "live" | "upcoming" | "completed" | "draft" | "featured" | "neutral" | "brand";

const tones: Record<BadgeTone, string> = {
  active: "border-success/30 bg-success/10 text-success",
  live: "border-danger/30 bg-danger/10 text-danger",
  upcoming: "border-info/30 bg-info/10 text-info",
  completed: "border-line bg-white/[0.04] text-text-2",
  draft: "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
  featured: "border-warn/30 bg-warn/10 text-warn",
  neutral: "border-line bg-white/[0.04] text-text-2",
  brand: "border-brand-400/40 bg-brand-400/10 text-brand-300",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

// Pipeline stepper (order tracking, onboarding progress). `current` is the active index;
// `failed` renders the trail in the danger tone (e.g. cancelled orders).
export function Steps({ steps, current, failed = false }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <ol className="flex gap-1" aria-label="Progress">
      {steps.map((step, index) => (
        <li key={step} className="flex-1">
          <div className={`h-1.5 rounded-full ${failed ? "bg-danger/60" : index <= current ? "bg-brand-400" : "bg-white/10"}`} />
          <p className={`mt-1 text-[10px] uppercase tracking-wide ${failed ? "text-danger" : index <= current ? "text-brand-300" : "text-text-3"}`}>
            {step}
          </p>
        </li>
      ))}
    </ol>
  );
}

// Link-styled tab bar (no client JS — active tab is derived from the current path).
export function LinkTabs({ basePath, tabs, pathname }: { basePath: string; tabs: { href: string; label: string }[]; pathname: string }) {
  return (
    <nav className="flex gap-1 rounded-lg border border-line bg-white/[0.02] p-1" aria-label="Sections">
      {tabs.map((tab) => {
        const active = tab.href === basePath ? pathname === basePath : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              active ? "bg-brand-400/15 text-brand-300" : "text-text-2 hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Empty state that teaches the next action (brief mandate #5).
export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-transparent p-8 text-center">
      <p className="font-semibold text-text-1">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-2">{body}</p>
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

// Skeleton loader block for Suspense/data-loading states.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
}
