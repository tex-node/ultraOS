import Link from "next/link";
import { signOut } from "@/auth";

export type WorkspaceUser = {
  name?: string | null;
  role: string;
  roles?: string[];
};

type NavLink = { href: string; label: string; adminOnly?: boolean };
type NavSection = { label: string; links: NavLink[] };

// Organizer workspace navigation (product roadmap F1/F6). Sections mirror the workspace
// dashboard; every href is an existing route — this shell only reorganizes, never adds.
const sections: NavSection[] = [
  {
    label: "Manage",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/competitions", label: "Tournaments", adminOnly: true },
      { href: "/events", label: "Events", adminOnly: true },
      { href: "/launch-readiness", label: "Launch", adminOnly: true },
    ],
  },
  {
    label: "Tournament",
    links: [
      { href: "/clubs", label: "Clubs" },
      { href: "/players", label: "Athletes" },
      { href: "/coaches", label: "Coaches" },
      { href: "/coaches/season-zero-selection", label: "Coach Selection", adminOnly: true },
      { href: "/fixtures", label: "Fixtures" },
      { href: "/standings", label: "Standings" },
      { href: "/leaders", label: "Leaders" },
      { href: "/drafts", label: "Drafts" },
      { href: "/draft-events", label: "Draft Day" },
      { href: "/applications", label: "Applications", adminOnly: true },
    ],
  },
  {
    label: "Live",
    links: [
      { href: "/gameday", label: "Game Day" },
      { href: "/broadcast", label: "Broadcast" },
      { href: "/novelty-matches", label: "Exhibition" },
    ],
  },
  {
    label: "Commerce",
    links: [
      { href: "/vendors", label: "Vendors", adminOnly: true },
      { href: "/orders", label: "Orders", adminOnly: true },
      { href: "/check-in", label: "Check-in", adminOnly: true },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/operations", label: "Operations", adminOnly: true },
      { href: "/access", label: "Access", adminOnly: true },
      { href: "/content", label: "Content", adminOnly: true },
      { href: "/media", label: "Media", adminOnly: true },
      { href: "/imports", label: "Imports", adminOnly: true },
      { href: "/audit", label: "Audit", adminOnly: true },
      { href: "/data-readiness", label: "Data", adminOnly: true },
      { href: "/participants/search", label: "Search", adminOnly: true },
      { href: "/training", label: "Training", adminOnly: true },
      { href: "/announcements", label: "Announcements", adminOnly: true },
    ],
  },
];

function isAdmin(user: WorkspaceUser) {
  return (
    user.roles?.includes("SUPER_ADMIN") ||
    user.roles?.includes("LEAGUE_OPERATOR") ||
    user.role === "SUPER_ADMIN" ||
    user.role === "LEAGUE_OPERATOR"
  );
}

// Organizer workspace shell: sidebar navigation on desktop, compact top bar below lg.
// Same props contract as the legacy operations header so pages adopt it unchanged.
export function WorkspaceShell({ children, user }: { children: React.ReactNode; user: WorkspaceUser }) {
  const admin = Boolean(isAdmin(user));

  return (
    <div className="min-h-screen bg-[#050807] text-white lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-white/[0.07] bg-[#080d0b]/95 lg:flex lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link className="font-semibold tracking-tight" href="/admin">
              Neon Ultra
            </Link>
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">Organizer workspace</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:border-white/20 hover:text-white"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
        <nav className="flex gap-5 overflow-x-auto px-5 pb-3 [scrollbar-width:thin] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-6">
          {sections.map((section) => {
            const links = section.links.filter((link) => !link.adminOnly || admin);
            if (links.length === 0) return null;
            return (
              <div key={section.label} className="shrink-0 lg:shrink">
                <p className="hidden text-[10px] uppercase tracking-[0.2em] text-zinc-500 lg:mb-1 lg:block">
                  {section.label}
                </p>
                <div className="flex gap-1 lg:flex-col">
                  {links.map((link) => (
                    <Link
                      key={link.href}
                      className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-5 py-4 lg:block">
          <Link href="/profile" className="block transition hover:opacity-80">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {(user.roles?.length ? user.roles : [user.role]).join(" · ")}
            </p>
          </Link>
          <Link href="/public" className="mt-2 block text-xs text-emerald-400">
            ← Back to fan portal
          </Link>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
