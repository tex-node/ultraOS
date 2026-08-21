import type { ContentType } from "@/generated/prisma/enums";

export type GraphicData = {
  type: ContentType | "CLUB_PROFILE" | "COACH_PROFILE";
  title: string;
  kicker?: string;
  headline: string;
  subheadline?: string;
  stats?: Array<{ label: string; value: string }>;
  footer?: string;
  sourceId: string;
  [key: string]: unknown;
};

export function renderTemplate(
  template: string,
  variables: Record<string, string>,
  escape: (value: string) => string = (value) => value,
) {
  return template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, key: string) =>
    escape(variables[key] ?? ""),
  );
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
