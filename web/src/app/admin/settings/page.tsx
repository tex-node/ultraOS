import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { MediaStorageProvider } from "@/generated/prisma/enums";
import { loadMediaProviderState, setMediaProviderAction } from "./actions";

export const dynamic = "force-dynamic";

// Platform settings (streak v18, Prompt 2).
//
// This screen exists because a value that only lived in an untracked env file cost two streaks: MEDIA_STORAGE_PROVIDER
// was unset everywhere, R2 credentials sat unused, and nothing in the product could show that every asset was landing on
// a local disk. The page shows the provider in effect, WHICH source decided it, and whether the credentials to switch
// are actually present - before offering the switch.
const PROVIDER_LABEL: Record<string, string> = {
  LOCAL_PERSISTENT_STORAGE: "Local disk",
  CLOUDFLARE_OBJECT_STORAGE: "Cloudflare R2",
};

const SOURCE_LABEL: Record<string, string> = {
  environment: "MEDIA_STORAGE_PROVIDER (environment)",
  database: "SystemConfig (set here)",
  default: "built-in default (nothing configured)",
};

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/settings");
  if (!session.user.roles.includes("SUPER_ADMIN")) redirect("/dashboard");

  const state = await loadMediaProviderState();
  const warning =
    state.provider === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE && !state.credentials.ready
      ? `R2 is selected but its credentials are incomplete: ${state.credentials.missing.join(", ")}. Uploads will fail.`
      : null;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Platform settings</p>
        <h1 className="mt-2 text-2xl font-bold">Media storage</h1>
        <p className="mt-1 text-sm text-text-2">
          Where uploaded bytes are written. Read on every upload, so a change here takes effect within seconds - no
          deploy needed.
        </p>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
          <p className="text-[11px] uppercase tracking-wider text-text-3">In effect</p>
          <p className="mt-1 text-lg font-bold text-text-1">{PROVIDER_LABEL[state.provider] ?? state.provider}</p>
          <p className="mt-1 text-xs text-text-3">decided by: {SOURCE_LABEL[state.source] ?? state.source}</p>
          {state.environmentValue ? (
            <p className="mt-1 text-xs text-text-3">
              The environment variable is set to <code>{state.environmentValue}</code>, which overrides anything saved here.
            </p>
          ) : null}
          {warning ? <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{warning}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {[MediaStorageProvider.LOCAL_PERSISTENT_STORAGE, MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE].map((option) => (
              <form key={option} action={setMediaProviderAction}>
                <input type="hidden" name="provider" value={option} />
                <button
                  type="submit"
                  disabled={option === state.provider || (option === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE && !state.credentials.ready)}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-text-2 disabled:opacity-40 hover:border-brand-400/40 hover:text-white"
                >
                  {option === state.provider ? `Using ${PROVIDER_LABEL[option]}` : `Switch to ${PROVIDER_LABEL[option]}`}
                </button>
              </form>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-line p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">R2 credentials</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {["R2_ACCOUNT_ID", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"].map((name) => {
              const present = Boolean(process.env[name]);
              return (
                <li key={name} className={present ? "text-text-2" : "text-warn"}>
                  {present ? "present" : "missing"} · <code>{name}</code>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-text-3">
            Credentials are never displayed, only whether they exist. Switching to R2 while any is missing is refused
            rather than saved and forgotten.
          </p>
        </section>
      </main>
    </OperationsShell>
  );
}
