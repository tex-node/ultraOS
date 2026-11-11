"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

// Evidence accordion for the Selection Advisor (motion-prompt #052).
//
// The content stays MOUNTED while collapsed: a coach printing the page, or a screen reader walking it, should still reach the
// evidence. Only its height animates, over 0.35s, and the chevron turns 180°.
const DURATION = 0.35;

export function EvidenceAccordion({
  title,
  tone,
  defaultOpen = true,
  children,
}: {
  title: string;
  tone: "positive" | "negative";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : DURATION;
  const border = tone === "positive" ? "border-success/25 bg-success/[.05]" : "border-danger/25 bg-danger/[.05]";
  const label = tone === "positive" ? "text-success" : "text-danger";

  return (
    <div className={`rounded-lg border ${border}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className={`text-[10px] font-semibold uppercase tracking-[.15em] ${label}`}>{title}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration }}
          className={`text-[10px] ${label}`}
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        <motion.div
          key="content"
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="px-3 pb-3">{children}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
