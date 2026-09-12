import { redirect } from "next/navigation";

// Phase 1 Stage 5.2B-1: /apply is legacy - kept working rather than broken, but explicit about
// where it goes rather than silently relying on the Stage 3a DB default. Every real application
// route is now org-scoped (/apply/[organizationSlug]); this redirect is the one deliberate,
// temporary exception, targeting Neon Ultra by name since it's the only organization that exists
// today. A second organization would need its own real entry point (or this could become a
// league picker once one exists) rather than continuing to hardcode Neon Ultra here.
export default function ApplyRedirectPage() {
  redirect("/apply/neon-ultra");
}
