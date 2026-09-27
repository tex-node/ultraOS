// Coaching-insights access is deliberately hardcoded to one account, not a role - the feature
// was requested as a private view for a single person, not a staff permission. If it ever needs
// to open up to more people, replace this with a real role/permission check instead of adding
// emails to this list.
const INSIGHTS_ACCESS_EMAILS = new Set(["texdevices@gmail.com"]);

export function hasInsightsAccess(email: string | null | undefined): boolean {
  return !!email && INSIGHTS_ACCESS_EMAILS.has(email);
}
