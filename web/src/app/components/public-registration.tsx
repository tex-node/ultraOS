import { notFound } from "next/navigation";
import { RegistrationFormView } from "@/app/register/[organizationSlug]/[eventSlug]/registration-form";
import { APP_NAME } from "@/lib/branding";
import { loadPublicRegistration } from "@/lib/registration/service";
import { parseSportConfig } from "@/lib/registration/sport-config";

// Shared public registration experience. Used by the canonical route
// (/register/[organizationSlug]/[eventSlug]) and by memorable short links (e.g. /giesm).
export async function PublicRegistrationExperience({
  organizationSlug,
  eventSlug,
}: {
  organizationSlug: string;
  eventSlug: string;
}) {
  const ctx = await loadPublicRegistration(organizationSlug, eventSlug);
  if (!ctx) notFound();
  const config = parseSportConfig(ctx.form.sportConfig);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-xs uppercase tracking-[.24em] text-emerald-400">{APP_NAME}</p>
      <h1 className="mt-2 text-3xl font-bold text-white">{ctx.form.title}</h1>
      {ctx.form.description ? <p className="mt-3 text-zinc-400">{ctx.form.description}</p> : null}
      {!ctx.accepting ? (
        <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
          Registration is not currently open.
        </p>
      ) : null}
      <RegistrationFormView
        organizationSlug={organizationSlug}
        eventSlug={eventSlug}
        mode={ctx.form.mode}
        accepting={ctx.accepting}
        confirmationMessage={ctx.form.confirmationMessage}
        fields={ctx.form.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          scope: field.scope,
          required: field.required,
          options: Array.isArray(field.options) ? (field.options as string[]) : null,
        }))}
        sports={config.sports}
        requireBothSports={config.requireBothSports}
        requireGuardianConsent={config.requireGuardianConsent}
        rosters={config.rosters as Record<string, { minRoster: number; maxRoster: number; activeCount?: number; substitutesAllowed: boolean; orderRequired: boolean } | undefined>}
        gender={config.gender}
      />
    </main>
  );
}
