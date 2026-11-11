import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCoachingViewer } from "@/server/coaching/guard";
import { loadHub } from "@/server/coaching/hub";
import { Card, SectionTitle } from "./_components/ui";

export const dynamic = "force-dynamic";

// Hub. Coaches see their assigned clubs; org admins their organization's clubs that have games;
// super admins and the legacy insights override pick an organization first. One club -> straight in.
export default async function CoachingHubPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const viewer = await requireCoachingViewer();
  const { org } = await searchParams;
  const hub = await loadHub(viewer, org ?? null);

  if (hub.kind === "PICKER") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-text-1">Coaching</h1>
        <SectionTitle>Choose an organization</SectionTitle>
        <ul className="space-y-2">
          {hub.organizations.map((o) => (
            <li key={o.organizationId}>
              <Link href={`/coaching?org=${o.organizationId}`}><Card className="text-sm text-text-1">{o.name}</Card></Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const all = hub.groups.flatMap((g) => g.clubs);
  if (all.length === 1) redirect(`/coaching/${all[0].seasonClubId}`);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">Coaching</h1>
      {all.length === 0 ? (
        <Card quiet className="mt-4"><p data-state="empty" className="text-sm text-text-2">No clubs with games to open yet.</p></Card>
      ) : (
        hub.groups.map((g) => (
          <div key={g.organizationId}>
            <SectionTitle>{g.name}</SectionTitle>
            <ul className="space-y-2">
              {g.clubs.map((c) => (
                <li key={c.seasonClubId}>
                  <Link href={`/coaching/${c.seasonClubId}`}>
                    <Card className="text-sm"><span className="font-semibold text-text-1">{c.clubName}</span> <span className="text-xs text-text-3">· {c.seasonName}</span></Card>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
