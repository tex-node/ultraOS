import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { CoachPhotoImportForm } from "@/app/coaches/photos/import/photo-import-form";
import { requirePermission } from "@/lib/authorization";

export default async function CoachPhotoImportPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/coaches/photos/import");
  const session = await requirePermission("media:upload");
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link className="text-sm text-zinc-400" href="/coaches">Back to coaches</Link>
        <p className="mt-6 text-xs uppercase tracking-[.2em] text-emerald-400">Coach media</p>
        <h1 className="mt-2 text-3xl font-semibold">Bulk coach photo import</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Preview matches before applying. Existing coach photos are only replaced if you explicitly allow it.
        </p>
        <div className="mt-8">
          <CoachPhotoImportForm />
        </div>
      </main>
    </OperationsShell>
  );
}
