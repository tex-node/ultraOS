import { PublicRegistrationExperience } from "@/app/components/public-registration";

export const dynamic = "force-dynamic";

export default async function PublicRegistrationPage({ params }: { params: Promise<{ organizationSlug: string; eventSlug: string }> }) {
  const { organizationSlug, eventSlug } = await params;
  return <PublicRegistrationExperience organizationSlug={organizationSlug} eventSlug={eventSlug} />;
}
