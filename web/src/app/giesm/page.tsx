import { notFound } from "next/navigation";
import { PublicRegistrationExperience } from "@/app/components/public-registration";
import { resolvePublicShortLink } from "@/lib/public-short-links";

export const dynamic = "force-dynamic";

// app.neonultra.ng/giesm — GIESM 2026 Volleyball Championship (Volleyball + Flag Race) registration.
export default async function GiesmRegistrationPage() {
  const link = resolvePublicShortLink("giesm");
  if (!link) notFound();
  return <PublicRegistrationExperience organizationSlug={link.organizationSlug} eventSlug={link.eventSlug} />;
}
