import Link from "next/link";
import { ContentType } from "@/generated/prisma/enums";
import { OperationsShell } from "@/app/components/operations-shell";
import { generateContentAsset } from "./actions";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function ContentStudioPage() {
  const session = await requirePermission("content:manage");
  const [
    draftPicks,
    fixtures,
    seasons,
    campaigns,
    fanClubs,
    assets,
    jobs,
  ] = await Promise.all([
    prisma.draftPick.findMany({
      include: {
        draft: true,
        player: { include: { athlete: true } },
        seasonClub: { include: { club: true } },
      },
      orderBy: { pickedAt: "desc" },
      take: 100,
    }),
    prisma.fixture.findMany({
      include: {
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    }),
    prisma.season.findMany({ orderBy: { startDate: "desc" } }),
    prisma.sponsorCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.fanClub.findMany({
      include: { club: true },
      orderBy: { club: { name: "asc" } },
    }),
    prisma.contentAsset.findMany({
      include: { job: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.contentJob.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const sourceGroups: Array<{
    type: ContentType;
    label: string;
    options: Array<{ id: string; label: string; disabled?: boolean }>;
  }> = [
    {
      type: "DRAFT_ANNOUNCEMENT",
      label: "Draft Pick Announcement",
      options: draftPicks.map((pick) => ({
        id: pick.id,
        label: `#${pick.pickNumber} ${pick.player.athlete.firstName} ${pick.player.athlete.lastName} | ${pick.seasonClub.club.name}`,
      })),
    },
    {
      type: "FIXTURE_ANNOUNCEMENT",
      label: "Fixture Release",
      options: fixtures.map((fixture) => ({
        id: fixture.id,
        label: `${fixture.homeSeasonClub.club.name} vs ${fixture.awaySeasonClub.club.name} | ${fixture.scheduledAt.toLocaleDateString()}`,
      })),
    },
    {
      type: "RESULT_ANNOUNCEMENT",
      label: "Match Result",
      options: fixtures.map((fixture) => ({
        id: fixture.id,
        label: `${fixture.homeSeasonClub.club.name} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awaySeasonClub.club.name}`,
        disabled: fixture.status !== "FINAL",
      })),
    },
    {
      type: "MVP_ANNOUNCEMENT",
      label: "MVP Announcement",
      options: fixtures.map((fixture) => ({
        id: fixture.id,
        label: `${fixture.homeSeasonClub.club.name} vs ${fixture.awaySeasonClub.club.name}`,
        disabled: fixture.status !== "FINAL",
      })),
    },
    {
      type: "STANDINGS_UPDATE",
      label: "Standings Update",
      options: seasons.map((season) => ({ id: season.id, label: season.name })),
    },
    {
      type: "SPONSOR_REPORT",
      label: "Sponsor Report",
      options: campaigns.map((campaign) => ({
        id: campaign.id,
        label: `${campaign.sponsorName} | ${campaign.name}`,
      })),
    },
    {
      type: "FAN_CLUB_REPORT",
      label: "Fan Club Report",
      options: fanClubs.map((fanClub) => ({
        id: fanClub.id,
        label: `${fanClub.club.name} | ${fanClub.name}`,
      })),
    },
  ];

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Database -&gt; Template -&gt; Content</p>
            <h1 className="mt-2 text-3xl font-semibold">Content studio</h1>
          </div>
          <Link href="/content/templates" className="rounded-xl border border-white/10 px-4 py-3">Manage templates</Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sourceGroups.map((group) => (
            <form key={group.type} action={generateContentAsset} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
              <h2 className="font-semibold">{group.label}</h2>
              <input type="hidden" name="type" value={group.type} />
              <select name="sourceId" required className="mt-4 w-full rounded-lg bg-white/[.05] p-3">
                <option value="">Select source record</option>
                {group.options.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
              </select>
              <button disabled={group.options.every((option) => option.disabled)} className="mt-3 w-full rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950 disabled:opacity-40">Generate asset</button>
            </form>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Generated assets</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[.08]">
            {assets.map((asset) => (
              <Link key={asset.id} href={`/content/assets/${asset.slug}`} className="grid gap-2 border-b border-white/[.06] bg-[#0b100e] p-4 last:border-0 md:grid-cols-[1fr_220px_180px]">
                <span>{asset.title}</span>
                <span className="text-zinc-400">{asset.job.type.replaceAll("_", " ")}</span>
                <span className="text-zinc-500">{asset.createdAt.toLocaleString()}</span>
              </Link>
            ))}
            {assets.length === 0 ? <p className="bg-[#0b100e] p-8 text-center text-zinc-500">No generated assets yet.</p> : null}
          </div>
        </section>
        {jobs.length ? <section className="mt-8 rounded-2xl border border-rose-400/20 bg-rose-400/[.04] p-5"><h2 className="font-semibold text-rose-300">Failed jobs</h2>{jobs.map((job)=><p key={job.id} className="mt-2 text-sm">{job.type}: {job.errorMessage}</p>)}</section> : null}
      </main>
    </OperationsShell>
  );
}
