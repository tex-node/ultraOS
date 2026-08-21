import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { uploadImportCsv } from "@/app/imports/actions";
import { ImportType } from "@/generated/prisma/enums";
import { hasPermission, type Permission } from "@/lib/permissions";

function permissionForType(type: ImportType): Permission {
  if (type === ImportType.PLAYER) return "data:import:players";
  if (type === ImportType.COACH) return "data:import:coaches";
  return "data:import:clubs";
}

export async function ImportUploadPage({
  description,
  title,
  type,
}: {
  description: string;
  title: string;
  type: ImportType;
}) {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/${type.toLowerCase()}s/import`);
  const permission = permissionForType(type);
  if (!hasPermission(session.user.roles, permission)) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold">Access required</h1>
          <p className="mt-3 text-sm text-zinc-400">Your account cannot run this import.</p>
        </main>
      </OperationsShell>
    );
  }

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link className="text-sm text-emerald-400 hover:text-emerald-300" href="/imports">
          Import history
        </Link>
        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <p className="text-xs uppercase tracking-[.2em] text-emerald-400">CSV import</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
          <div className="mt-6">
            <Link
              className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200 hover:border-emerald-400"
              href={`/imports/template?type=${type}`}
            >
              Download template
            </Link>
          </div>
          <form action={uploadImportCsv} className="mt-8 space-y-5">
            <input name="type" type="hidden" value={type} />
            <label className="block text-sm text-zinc-300">
              CSV file
              <input
                accept=".csv,text/csv"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white"
                name="file"
                required
                type="file"
              />
            </label>
            <p className="text-xs leading-5 text-zinc-500">
              Upload only parses and validates rows. No users, athletes, staff, clubs, or season
              records are written until an operator confirms the import preview.
            </p>
            <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">
              Upload and preview
            </button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}
