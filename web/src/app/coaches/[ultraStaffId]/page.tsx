import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { PersonAvatar } from "@/app/components/person-avatar";
import { uploadStaffProfilePhoto } from "@/app/media/actions";
import { staffCompleteness } from "@/lib/participant-profiles";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: this authenticated-only (no further permission gate) staff/coach profile
// page - also served at /staff/[ultraStaffId] via a re-export - previously read Staff via the
// bare, unscoped client. An Org B user could view Org A's coach/staff profile (name, assignments,
// training history, and - for staff:manage holders - documents) in full. Scoped to the viewer's
// own organization, matching the launch-readiness/data-readiness "Organization context required"
// precedent for the case (today: self-registered FANs, see Stage 5.5B Batch 4) where the session
// has no organization at all.
export default async function CoachProfilePage({ params }: { params: Promise<{ ultraStaffId: string }> }) {
  const session = await auth();
  const { ultraStaffId } = await params;
  if (!session?.user) redirect(`/login?callbackUrl=/coaches/${ultraStaffId}`);
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const staff = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.staff.findFirst({
      where: ultraStaffId.startsWith("UBS-") ? { ultraStaffId } : { id: ultraStaffId },
      include: {
        headCoachAssignments: { include: { club: true, division: true, season: true } },
        assistantCoachAssignments: { include: { club: true, division: true, season: true } },
        scoutAssignments: { include: { club: true, division: true, season: true } },
        trainingSessionsCoached: { orderBy: { occurredAt: "desc" }, take: 20 },
        documents: hasPermission(session.user.roles, "staff:manage") ? { orderBy: { createdAt: "desc" }, take: 10 } : false,
      },
    }),
  );
  if (!staff) notFound();
  const completeness = staffCompleteness(staff);
  const assignments = [...staff.headCoachAssignments, ...staff.assistantCoachAssignments, ...staff.scoutAssignments];
  const canUploadMedia = hasPermission(session.user.roles, "media:upload");
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><section className="rounded-lg border border-line bg-ink-800 p-6"><p className="text-xs uppercase tracking-[.2em] text-brand-400">Permanent staff profile</p><div className="mt-2 flex flex-wrap items-center gap-4"><PersonAvatar className="h-24 w-24" name={staff.name} photoUrl={staff.photoUrl} /><div><h1 className="text-3xl font-semibold">{staff.name}</h1><p className="mt-2 text-sm text-text-2">{staff.ultraStaffId ?? "Ultra Staff ID pending"} | {staff.role}</p><p className="mt-1 text-xs text-text-3">Profile: {completeness.status}</p></div></div></section>{canUploadMedia ? <section className="mt-6 rounded-lg border border-line bg-ink-800 p-6"><h2 className="text-lg font-semibold">Coach or staff profile photo</h2><p className="mt-1 text-sm text-text-2">Upload a JPG, PNG, or WebP basketball picture or profile photo. The file is validated before storage and becomes the staff primary photo.</p><form action={uploadStaffProfilePhoto.bind(null, staff.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]" encType="multipart/form-data"><input accept="image/jpeg,image/png,image/webp" className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="file" required type="file" /><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="altText" placeholder="Alt text, e.g. coach headshot" /><button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Upload photo</button></form></section> : null}<nav className="mt-6 flex flex-wrap gap-2 text-sm text-text-1">{["Overview","Career","Assignments","Matches","Training","Media","Documents","Applications","Administration"].map((tab) => <a className="rounded-md border border-line px-3 py-2" href={`#${tab.toLowerCase()}`} key={tab}>{tab}</a>)}</nav><h2 id="assignments" className="mt-8 text-xl font-semibold">Assignments</h2><div className="mt-4 grid gap-3">{assignments.map((assignment) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={assignment.id}><p className="font-semibold">{assignment.club.name}</p><p className="text-sm text-text-2">{assignment.season.name} | {assignment.division.name}</p></article>)}</div><h2 id="training" className="mt-8 text-xl font-semibold">Training sessions led</h2><div className="mt-4 grid gap-3">{staff.trainingSessionsCoached.map((training) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={training.id}><p className="font-semibold">{training.title}</p><p className="text-sm text-text-2">{training.sessionType} | {training.occurredAt.toDateString()}</p></article>)}</div>{"documents" in staff ? <><h2 id="documents" className="mt-8 text-xl font-semibold">Documents</h2><div className="mt-4 grid gap-3">{staff.documents.map((document) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={document.id}><p>{document.title}</p><p className="text-sm text-text-2">{document.type} | {document.approvalStatus}</p></article>)}</div></> : null}</main></OperationsShell>;
}
