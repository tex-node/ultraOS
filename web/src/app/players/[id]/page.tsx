import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { PersonAvatar } from "@/app/components/person-avatar";
import { uploadAthleteProfilePhoto } from "@/app/media/actions";
import { deleteAthlete, removePlayerRegistration } from "../actions";
import { requireSession } from "@/lib/authorization";
import { athleteCareerStats, athleteCompleteness } from "@/lib/participant-profiles";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously read the Athlete (and every award/document/media/training/
// registration record) via the bare, unscoped client - an Org B authenticated user could view
// Org A's athlete profile in full. ultraAthleteId is deliberately GLOBAL-unique (Stage 5.4A), so
// scoping this lookup to the caller's own organization can only exclude ids that were never
// theirs to see.
export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/players/${id}`);
  const session = await requireSession();
  const query = await searchParams;
  const canManage = hasPermission(session.user.roles, "player:manage");
  const canUploadMedia = hasPermission(session.user.roles, "media:upload");
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const { athlete, career } = await withOrganizationContext(session.user.organizationId, async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: id.startsWith("UBA-") ? { ultraAthleteId: id } : { id },
      include: {
        awards: { orderBy: { awardedAt: "desc" } },
        documents: canManage ? { orderBy: { createdAt: "desc" }, take: 10 } : false,
        media: { orderBy: { createdAt: "desc" }, take: canManage ? 20 : 6 },
        trainingRecords: { include: { trainingSession: true }, orderBy: { createdAt: "desc" }, take: canManage ? 20 : 5 },
        registrations: {
          orderBy: { season: { startDate: "desc" } },
          include: {
            draftSquadMembers: { include: { draftSquad: true } },
            season: { include: { competition: { select: { name: true } } } },
            seasonClub: { include: { club: true, division: true } },
            _count: { select: { draftPicks: true, gameEvents: true, playerStats: true } },
          },
        },
      },
    });
    const career = athlete ? await athleteCareerStats(athlete.id, tx) : null;
    return { athlete, career };
  });
  if (!athlete || !career) notFound();
  const completeness = athleteCompleteness(athlete);
  const current = athlete.registrations[0];

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/players" className="text-sm text-text-2">Back to athletes</Link>
        {query.error === "has-registrations" ? <p className="mt-5 rounded-md bg-danger/10 p-4 text-danger">Remove all season registrations before deleting this athlete identity.</p> : null}
        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[.2em] text-brand-400">Permanent athlete profile</p>
              <h1 className="mt-2 text-3xl font-semibold">{athlete.firstName} {athlete.lastName}</h1>
              <p className="mt-2 text-sm text-text-2">{athlete.ultraAthleteId ?? "Ultra ID pending"} | {current?.seasonClub ? `${current.seasonClub!.club.name} | ${current.seasonClub!.division.name}` : "Unassigned"} | {current?.position ?? "Position pending"}</p>
              <p className="mt-1 text-xs text-text-3">Profile: {completeness.status}{canManage && completeness.missing.length ? ` | Missing: ${completeness.missing.join(", ")}` : ""}</p>
            </div>
            {canManage ? <div className="flex gap-2"><Link href={`/players/${athlete.id}/edit`} className="rounded-md border border-line px-4 py-2 text-sm">Edit athlete</Link><Link href={`/players/${athlete.id}/seasons/new`} className="rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900">Register for season</Link>{athlete.registrations.length === 0 ? <form action={deleteAthlete.bind(null, athlete.id)}><button className="rounded-md border border-rose-400/20 px-4 py-2 text-sm text-danger">Delete athlete</button></form> : null}</div> : null}
          </div>
        </section>

        {canUploadMedia ? (
          <section className="mt-6 rounded-lg border border-line bg-ink-800 p-6">
            <h2 className="text-lg font-semibold">Player profile photo</h2>
            <p className="mt-1 text-sm text-text-2">Upload a JPG, PNG, or WebP basketball picture or profile photo. The file is validated before storage and becomes the athlete primary photo.</p>
            <PersonAvatar className="mt-4 h-28 w-28" name={`${athlete.firstName} ${athlete.lastName}`} photoUrl={athlete.photoUrl} />
            <form action={uploadAthleteProfilePhoto.bind(null, athlete.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]" encType="multipart/form-data">
              <input accept="image/jpeg,image/png,image/webp" className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="file" required type="file" />
              <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="altText" placeholder="Alt text, e.g. player headshot" />
              <button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Upload photo</button>
            </form>
          </section>
        ) : null}

        <nav className="mt-6 flex flex-wrap gap-2 text-sm text-text-1">{["Overview", "Career", "Match Data", "Training", "Media", "Awards", "Draft History", "Clubs", ...(canManage ? ["Documents", "Scout Reports", "Administration"] : [])].map((tab) => <a className="rounded-md border border-line px-3 py-2" href={`#${tab.toLowerCase().replaceAll(" ", "-")}`} key={tab}>{tab}</a>)}</nav>

        <section id="overview" className="mt-8 grid gap-4 md:grid-cols-4"><Metric label="Games" value={career.totals.games} /><Metric label="Points" value={career.totals.points} /><Metric label="Rebounds" value={career.totals.rebounds} /><Metric label="Assists" value={career.totals.assists} /></section>

        <h2 id="clubs" className="mt-8 text-xl font-semibold">Player registrations and clubs</h2>
        <div className="mt-4 space-y-4">{athlete.registrations.map((player) => <article key={player.id} className="rounded-lg border border-line bg-ink-800 p-5">
          <div className="flex justify-between gap-4"><div><p className="font-semibold">{player.season.name} | {player.position}</p><p className="text-xs text-text-3">{player.season.competition.name} | Player | {player.status}</p></div>{canManage ? <div className="flex gap-3"><Link href={`/player-registrations/${player.id}/edit`} className="text-sm text-brand-400">Edit registration</Link><form action={removePlayerRegistration.bind(null, player.id, athlete.id)}><button className="text-sm text-danger">{player._count.draftPicks + player._count.gameEvents + player._count.playerStats > 0 ? "Deactivate" : "Delete"}</button></form></div> : null}</div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><p>SeasonClub: <b>{player.seasonClub! ? `${player.seasonClub!.club.name} | ${player.seasonClub!.division.name}` : "Unassigned"}</b></p><p>Jersey: <b>{player.jerseyNumber ?? "-"}</b></p><p>Measurements: <b>{player.heightCm}cm / {player.weightKg}kg</b></p><p>Draft squad: <b>{player.draftSquadMembers[0]?.draftSquad.name ?? "-"}</b></p></div>
        </article>)}</div>

        <h2 id="match-data" className="mt-8 text-xl font-semibold">Match Data</h2>
        <div className="mt-4 grid gap-3">{career.gameLog.slice(0, 10).map((stat) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={stat.id}><p className="font-semibold">{stat.game.fixture.homeSeasonClub!.club.name} vs {stat.game.fixture.awaySeasonClub!.club.name}</p><p className="text-sm text-text-2">{stat.points} PTS | {stat.rebounds} REB | {stat.assists} AST | {stat.steals} STL | {stat.blocks} BLK</p></article>)}</div>

        <h2 id="training" className="mt-8 text-xl font-semibold">Training</h2>
        <div className="mt-4 grid gap-3">{athlete.trainingRecords.map((record) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={record.id}><p className="font-semibold">{record.trainingSession.title}</p><p className="text-sm text-text-2">{record.attendanceStatus} | {record.publicSummary ?? (canManage ? record.developmentFocus : "Private notes hidden")}</p></article>)}</div>

        <h2 id="media" className="mt-8 text-xl font-semibold">Media</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{athlete.media.map((media) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={media.id}><p className="font-semibold">{media.title}</p><p className="text-sm text-text-2">{media.type} | {media.visibility} | {media.approved ? "Approved" : "Pending"}</p></article>)}</div>

        <h2 id="awards" className="mt-8 text-xl font-semibold">Awards</h2>
        <div className="mt-4 grid gap-3">{athlete.awards.map((award) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={award.id}><p className="font-semibold">{award.name}</p><p className="text-sm text-text-2">{award.awardedAt.toDateString()}</p></article>)}</div>

        {canManage && "documents" in athlete ? <><h2 id="documents" className="mt-8 text-xl font-semibold">Documents</h2><div className="mt-4 grid gap-3">{athlete.documents.map((document) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={document.id}><p className="font-semibold">{document.title}</p><p className="text-sm text-text-2">{document.type} | {document.approvalStatus}</p></article>)}</div></> : null}
      </main>
    </OperationsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-line bg-ink-800 p-5"><p className="text-sm text-text-2">{label}</p><p className="mt-2 text-2xl font-semibold text-brand-300">{value}</p></div>;
}
