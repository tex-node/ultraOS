import { notFound } from "next/navigation";
import { isCoachingAssistantEnabled } from "@/lib/coaching/feature-flag";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Print stylesheet: the game-plan page prints as one A4 pre-game sheet and the squad page as a
// training-week sheet. Everything dark becomes black-on-white; interactive chrome is print:hidden.
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body, .coach-sheet { background: #fff !important; color: #000 !important; }
  .coach-sheet * { color: #000 !important; background: transparent !important; border-color: #999 !important; box-shadow: none !important; opacity: 1 !important; }
  .coach-sheet details > summary { display: none; }
  .coach-sheet main { max-width: none; padding: 0; }
  .coach-sheet h1 { font-size: 16pt; }
  .coach-sheet section { break-inside: avoid; padding: 4px 8px; }
}
`;

// The Coaching Assistant ships dark (ADR-011): with the flag off the whole subtree is a 404.
export default function CoachingLayout({ children }: { children: React.ReactNode }) {
  if (!isCoachingAssistantEnabled()) notFound();
  return (
    <div className="coach-sheet min-h-screen bg-ink-900 text-text-1">
      <style>{PRINT_CSS}</style>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="mb-3 text-[10px] uppercase tracking-[.15em] text-info print:hidden">Coaching Assistant · coach-private</p>
        {children}
      </main>
    </div>
  );
}
