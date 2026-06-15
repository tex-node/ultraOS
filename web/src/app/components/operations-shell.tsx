import Link from "next/link";
import { signOut } from "@/auth";

type OperationsShellProps = {
  children: React.ReactNode;
  user: {
    name?: string | null;
    role: string;
  };
};

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clubs", label: "Clubs" },
  { href: "/players", label: "Athletes" },
  { href: "/drafts", label: "Drafts" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/standings", label: "Standings" },
  { href: "/audit", label: "Audit" },
];

export function OperationsShell({ children, user }: OperationsShellProps) {
  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <header className="border-b border-white/[0.07] bg-[#080d0b]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link className="font-semibold tracking-tight" href="/dashboard">
              Ultra Basketball
            </Link>
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">
              League operating system
            </p>
          </div>
          <nav className="flex items-center gap-2">
            {navigation.filter((item) =>
              item.href !== "/audit" ||
              user.role === "SUPER_ADMIN" ||
              user.role === "LEAGUE_OPERATOR",
            ).map((item) => (
              <Link
                key={item.href}
                className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{user.role}</p>
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
