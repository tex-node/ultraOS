import Link from "next/link";
import { signOut } from "@/auth";

type OperationsShellProps = {
  children: React.ReactNode;
  user: {
    name?: string | null;
    role: string;
    roles?: string[];
  };
};

type NavLink = { href: string; label: string; adminOnly?: boolean };
type NavEntry = NavLink | { label: string; links: NavLink[] };

const navigation: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/competitions", label: "Competitions", adminOnly: true },
  { href: "/gameday", label: "Game Day" },
  { href: "/broadcast", label: "Broadcast" },
  {
    label: "Operations",
    links: [
      { href: "/operations", label: "Overview", adminOnly: true },
      { href: "/launch-readiness", label: "Launch", adminOnly: true },
      { href: "/draft-readiness", label: "Draft Ready", adminOnly: true },
      { href: "/data-readiness", label: "Data", adminOnly: true },
      { href: "/participants/search", label: "Search", adminOnly: true },
      { href: "/imports", label: "Imports", adminOnly: true },
      { href: "/training", label: "Training", adminOnly: true },
      { href: "/vendors", label: "Vendors", adminOnly: true },
      { href: "/orders", label: "Orders", adminOnly: true },
      { href: "/content", label: "Content", adminOnly: true },
      { href: "/media", label: "Media", adminOnly: true },
      { href: "/audit", label: "Audit", adminOnly: true },
    ],
  },
  {
    label: "Clubs",
    links: [
      { href: "/clubs", label: "Clubs" },
      { href: "/players", label: "Athletes" },
      { href: "/coaches", label: "Coaches" },
      { href: "/coaches/season-zero-selection", label: "Coach Selection", adminOnly: true },
      { href: "/participants/all-star-roster", label: "All-Star Rosters" },
      { href: "/tryouts", label: "Tryouts" },
      { href: "/standings", label: "Standings" },
    ],
  },
  {
    label: "Events",
    links: [
      { href: "/events", label: "Events", adminOnly: true },
      { href: "/fixtures", label: "Fixtures" },
      { href: "/novelty-matches", label: "Exhibition" },
      { href: "/draft-events", label: "Draft Day" },
      { href: "/drafts", label: "Drafts" },
      { href: "/draft-cohort", label: "Cohort", adminOnly: true },
      { href: "/applications", label: "Applications", adminOnly: true },
      { href: "/check-in", label: "Check-in", adminOnly: true },
    ],
  },
  { href: "/announcements", label: "Announcements", adminOnly: true },
];

function isAdmin(user: OperationsShellProps["user"]) {
  return (
    user.roles?.includes("SUPER_ADMIN") ||
    user.roles?.includes("LEAGUE_OPERATOR") ||
    user.role === "SUPER_ADMIN" ||
    user.role === "LEAGUE_OPERATOR"
  );
}

function visibleLinks(links: NavLink[], admin: boolean) {
  return links.filter((link) => !link.adminOnly || admin);
}

export function OperationsShell({ children, user }: OperationsShellProps) {
  const admin = Boolean(isAdmin(user));

  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <header className="border-b border-white/[0.07] bg-[#080d0b]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link className="font-semibold tracking-tight" href="/dashboard">
              Neon Ultra
            </Link>
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">
              Tournament management system
            </p>
          </div>
          <nav className="flex items-center gap-1">
            {navigation.map((entry) => {
              if ("href" in entry) {
                if (entry.adminOnly && !admin) return null;
                return (
                  <Link
                    key={entry.href}
                    className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                    href={entry.href}
                  >
                    {entry.label}
                  </Link>
                );
              }
              const links = visibleLinks(entry.links, admin);
              if (links.length === 0) return null;
              return (
                <div className="group relative" key={entry.label}>
                  <button
                    className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                    type="button"
                  >
                    {entry.label} <span className="text-zinc-500">▾</span>
                  </button>
                  <div className="invisible absolute left-0 top-full z-20 mt-1 min-w-[190px] rounded-xl border border-white/10 bg-[#0b100e] p-1.5 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    {links.map((link) => (
                      <Link
                        key={link.href}
                        className="block rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
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
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                {(user.roles?.length ? user.roles : [user.role]).join(" · ")}
              </p>
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
        </div>
      </header>
      {children}
    </div>
  );
}
