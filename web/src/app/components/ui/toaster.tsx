"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

// Global feedback (motion-prompt #056).
//
// A module-level bus rather than a React context: the call sites that need a toast are behind server actions and offline
// queues, not inside one provider tree, and threading a context through them would mean converting components that do not
// otherwise need to be client components.
//
// Timing from the library: slide in from the right over 0.35s, dismiss after 2s. Reduced motion turns the slide into a fade
// of zero duration, which is the requirement, not an option.
const DURATION = 0.35;
const DISMISS_AFTER_MS = 2000;

type Toast = { id: number; message: string; tone: "info" | "warn" };

let nextId = 1;
const listeners = new Set<(toast: Toast) => void>();

/** Show a toast. Safe to call from any client component; a no-op on the server. */
export function toast(message: string, tone: Toast["tone"] = "info") {
  if (typeof window === "undefined") return;
  const entry = { id: nextId++, message, tone };
  listeners.forEach((listener) => listener(entry));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const listener = (entry: Toast) => {
      setToasts((current) => [...current, entry]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== entry.id));
      }, DISMISS_AFTER_MS);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const duration = reduceMotion ? 0 : DURATION;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration, ease: "easeOut" }}
            data-testid="toast"
            className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-xl backdrop-blur ${
              entry.tone === "warn"
                ? "border-warn/40 bg-ink-800/95 text-warn"
                : "border-brand-400/40 bg-ink-800/95 text-text-1"
            }`}
          >
            {entry.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
