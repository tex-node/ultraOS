export const dynamic = "force-dynamic";

// Distraction-free capture shell (spec §1). No sidebar, no header, no footer, no tabs: a scorer on a tablet at the side of
// the court gets the pad and nothing else. The layout deliberately has no navigation at all - leaving this viewport is a
// deliberate act (the "Exit" control on the page), not something a stray tap can do.
export default function CaptureLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-ink-900 text-text-1">{children}</div>;
}
