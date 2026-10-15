import Link from "next/link";
import { requireCoachingClub } from "@/server/coaching/guard";

export const dynamic = "force-dynamic";

// Club chrome. Layouts do not re-run on client navigation, so every page below also calls the
// guard itself; this one makes sure no club header is ever rendered for someone without access.
export default async function CoachingClubLayout({ children, params }: { children: React.ReactNode; params: Promise<{ seasonClubId: string }> }) {
  const { seasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const base = `/coaching/${seasonClubId}`;
  const tab = "rounded-md px-3 py-2 text-sm text-text-2 transition hover:bg-white/[.06] hover:text-white";
  return (
    <div>
      <div className="mb-4 print:hidden">
        <p className="text-sm font-semibold text-text-1">{scope.clubName} <span className="text-xs font-normal text-text-3">· {scope.seasonName}</span></p>
        <nav aria-label="Coaching sections" className="-mx-3 mt-1 flex flex-wrap gap-1">
          <Link href={base} className={tab}>Home</Link>
          <Link href={`${base}/squad`} className={tab}>Squad</Link>
          <Link href={`${base}/opponents`} className={tab}>Opponents</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
