"use client";

import { PERSONA_LABELS, type Persona } from "@/lib/workspace/nav";
import { choosePersona } from "@/app/components/persona-actions";

// The context switcher (spec §4): a chip in the header that names the viewport you are in, and lets a person who holds more
// than one role move between them. One viewport at a time - the point of the restructure is that the sidebar shows the tools
// of the job you are doing now, not the union of every job you have ever held.
export function PersonaSwitcher({ active, available }: { active: Persona; available: Persona[] }) {
  if (available.length <= 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-text-2">
        {PERSONA_LABELS[active]}
      </span>
    );
  }

  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-brand-400/40 bg-brand-400/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-brand-300">
        {PERSONA_LABELS[active]}
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-line bg-ink-800 p-1 shadow-xl">
        <p className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-text-3">Switch view</p>
        {available.map((persona) => (
          <form key={persona} action={choosePersona} className="m-0">
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
      </div>
    </details>
  );
}
