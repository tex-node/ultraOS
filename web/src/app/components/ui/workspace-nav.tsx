"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

// Workspace sidebar nav (handoff shells §Workspace): active item gets the green fill,
// green text and a 2px inset bar. `sections` arrives pre-filtered by role from the server.
export type WorkspaceNavLink = { href: string; label: string };
export type WorkspaceNavSection = { label: string; links: WorkspaceNavLink[] };

export function WorkspaceNav({ sections }: { sections: WorkspaceNavSection[] }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav className="flex gap-5 overflow-x-auto px-5 pb-3 [scrollbar-width:thin] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-6">
      {sections.map((section) => (
        <div key={section.label} className="shrink-0 lg:shrink">
          <p className="hidden text-[10px] uppercase tracking-[0.2em] text-text-3 lg:mb-1 lg:block">
            {section.label}
          </p>
          <div className="flex gap-1 lg:flex-col">
            {section.links.map((link) => {
              const isActive = active(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition ${
                    isActive
                      ? "border-l-2 border-brand-400 bg-brand-400/10 text-brand-400"
                      : "text-text-2 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}