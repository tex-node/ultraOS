import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { PersonAvatar } from "@/app/components/person-avatar";
import { uploadStaffProfilePhoto } from "@/app/media/actions";
import { staffCompleteness } from "@/lib/participant-profiles";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function CoachProfilePage({ params }: { params: Promise<{ ultraStaffId: string }> }) {
  const session = await auth();
  const { ultraStaffId } = await params;
  if (!session?.user) redirect(`/login?callbackUrl=/coaches/${ultraStaffId}`);
  const staff = await prisma.staff.findFirst({
    where: ultraStaffId.startsWith("UBS-") ? { ultraStaffId } : { id: ultraStaffId },
    include: {
      headCoachAssignments: { include: { club: true, division: true, season: true } },
      assistantCoachAssignments: { include: { club: true, division: true, season: true } },
      scoutAssignments: { include: { club: true, division: true, season: true } },
      trainingSessionsCoached: { orderBy: { occurredAt: "desc" }, take: 20 },
      documents: hasPermission(session.user.roles, "staff:manage") ? { orderBy: { createdAt: "desc" }, take: 10 } : false,
    },
  });
  if (!staff) notFound();
  const completeness = staffCompleteness(staff);
  const assignments = [...staff.headCoachAssignments, ...staff.assistantCoachAssignments, ...staff.scoutAssignments];
  const canUploadMedia = hasPermission(session.user.roles, "media:upload");
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6"><p className="text-xs uppercase tracking-[.2em] text-emerald-400">Permanent staff profile</p><div className="mt-2 flex flex-wrap items-center gap-4"><PersonAvatar className="h-24 w-24" name={staff.name} photoUrl={staff.photoUrl} /><div><h1 className="text-3xl font-semibold">{staff.name}</h1><p className="mt-2 text-sm text-zinc-400">{staff.ultraStaffId ?? "Ultra Staff ID pending"} | {staff.role}</p><p className="mt-1 text-xs text-zinc-500">Profile: {completeness.status}</p></div></div></section>{canUploadMedia ? <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6"><h2 className="text-lg font-semibold">Coach or staff profile photo</h2><p className="mt-1 text-sm text-zinc-400">Upload a JPG, PNG, or WebP basketball picture or profile photo. The file is validated before storage and becomes the staff primary photo.</p><form action={uploadStaffProfilePhoto.bind(null, staff.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]" encType="multipart/form-data"><input accept="image/jpeg,image/png,image/webp" className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="file" required type="file" /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="altText" placeholder="Alt text, e.g. coach headshot" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Upload photo</button></form></section> : null}<nav className="mt-6 flex flex-wrap gap-2 text-sm text-zinc-300">{["Overview","Career","Assignments","Matches","Training","Media","Documents","Applications","Administration"].map((tab) => <a className="rounded-xl border border-white/10 px-3 py-2" href={`#${tab.toLowerCase()}`} key={tab}>{tab}</a>)}</nav><h2 id="assignments" className="mt-8 text-xl font-semibold">Assignments</h2><div className="mt-4 grid gap-3">{assignments.map((assignment) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={assignment.id}><p className="font-semibold">{assignment.club.name}</p><p className="text-sm text-zinc-400">{assignment.season.name} | {assignment.division.name}</p></article>)}</div><h2 id="training" className="mt-8 text-xl font-semibold">Training sessions led</h2><div className="mt-4 grid gap-3">{staff.trainingSessionsCoached.map((training) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={training.id}><p className="font-semibold">{training.title}</p><p className="text-sm text-zinc-400">{training.sessionType} | {training.occurredAt.toDateString()}</p></article>)}</div>{"documents" in staff ? <><h2 id="documents" className="mt-8 text-xl font-semibold">Documents</h2><div className="mt-4 grid gap-3">{staff.documents.map((document) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={document.id}><p>{document.title}</p><p className="text-sm text-zinc-400">{document.type} | {document.approvalStatus}</p></article>)}</div></> : null}</main></OperationsShell>;
}
