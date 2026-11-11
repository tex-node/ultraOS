"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { WorkspaceNav, type WorkspaceNavSection } from "@/app/components/ui/workspace-nav";

// Workspace navigation as a drawer below `lg` (motion-prompt #050).
//
// The desktop sidebar stays exactly as it was: this component only owns the small-screen case, where the old shell stacked
// the whole nav above the content and pushed the actual page below the fold. A scorer on a phone should see the scoreboard,
// not a menu.
//
// Timing comes from the library: 0.4s slide from the left, backdrop dimmed, and every duration collapses to zero when the
// visitor has asked for reduced motion - an accessibility requirement, not a nicety.
const DURATION = 0.4;
const EASE = [0.22, 1, 0.36, 1] as const;

export function WorkspaceDrawer({ sections, workspaceName }: { sections: WorkspaceNavSection[]; workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // Escape closes it, and the drawer locks body scroll while it is open so the page behind cannot drift.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const duration = reduceMotion ? 0 : DURATION;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        data-testid="workspace-menu"
        className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2"
      >
        Menu
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Workspace navigation"
              className="fixed inset-y-0 left-0 z-50 flex w-[max(40%,260px)] flex-col border-r border-line bg-ink-800 shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration, ease: EASE }}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="font-display text-sm font-semibold">{workspaceName}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="rounded px-2 py-1 text-xs text-text-2"
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-3">
                <WorkspaceNav sections={sections} />
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
