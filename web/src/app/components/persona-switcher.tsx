"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PERSONA_LABELS, type Persona } from "@/lib/workspace/nav";
import { choosePersona } from "@/app/components/persona-actions";

// The context switcher: a chip naming the viewport you are in, and - for someone who holds more than one role - the way to
// move between them. One viewport at a time, because the point of the restructure is that the sidebar shows the tools of the
// job you are doing now, not the union of every job you have ever held.
//
// Motion (library #053): the panel opens over 0.25s, fading and sliding down 4px, and closes the moment a choice is made -
// the navigation is already on its way, so a lingering menu would be showing the old context.
const DURATION = 0.25;

export function PersonaSwitcher({ active, available }: { active: Persona; available: Persona[] }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (available.length <= 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-text-2">
        {PERSONA_LABELS[active]}
      </span>
    );
  }

  const duration = reduceMotion ? 0 : DURATION;

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="persona-switcher"
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-brand-400/40 bg-brand-400/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-brand-300"
      >
        {PERSONA_LABELS[active]}
        <span aria-hidden="true">▾</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration, ease: "easeOut" }}
            className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-line bg-ink-800 p-1 shadow-xl"
          >
            <p className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-text-3">Switch view</p>
            {available.map((persona) => (
              <form key={persona} action={choosePersona} className="m-0" onSubmit={() => setOpen(false)}>
                <input type="hidden" name="persona" value={persona} />
                <button
                  type="submit"
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                    persona === active ? "bg-brand-400/10 text-brand-300" : "text-text-2 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {PERSONA_LABELS[persona]}
                  {persona === active ? <span className="ml-2 text-[10px] uppercase text-text-3">active</span> : null}
                </button>
              </form>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
