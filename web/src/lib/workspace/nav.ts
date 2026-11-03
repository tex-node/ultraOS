// Persona-scoped navigation (streak v36).
//
// WHY. The workspace sidebar was one list for everybody: a coach saw Vendors, Audit, Imports and the draft machinery, and an
// operator saw a courtside console link they would never use. The spec asks for persona viewports - the same shell, a
// different set of tools - and the decision of WHAT to show belongs on the server, next to the roles, not in a client
// component that happens to hide things.
//
// THE RULE. A persona is derived from the user's roles in the active organization; the nav is the union of the sections that
// persona is allowed to see. A person with several roles gets several personas, and the switcher lets them choose - the
// sidebar shows ONE viewport at a time instead of merging every tool into a wall of tabs.

export type Persona = "admin" | "coach" | "scorer" | "scout" | "fan";

export type NavItem = { href: string; label: string };
export type NavSection = { label: string; links: NavItem[]; personas: Persona[] };

export const PERSONA_LABELS: Record<Persona, string> = {
  admin: "League operator",
  coach: "Coach",
  scorer: "Scorekeeper",
  scout: "Scout",
  fan: "Fan",
};

/** Which persona each role opens into. A role that is not listed opens the fan viewport, which has no operational tools.
 *  Plain strings, not the Prisma enum: this module is imported by a client component (the switcher), and the generated enum
 *  module is not client-safe. */
const ROLE_PERSONAS: Record<string, Persona> = {
  SUPER_ADMIN: "admin",
  LEAGUE_OPERATOR: "admin",
  TOURNAMENT_DIRECTOR: "admin",
  VENDOR_MANAGER: "admin",
  GATE_MANAGER: "admin",
  COACH: "coach",
  TEAM_MANAGER: "coach",
  SCOREKEEPER: "scorer",
  OFFICIAL: "scorer",
  SCOUT: "scout",
  PLAYER: "fan",
  FAN: "fan",
  MEDIA: "fan",
  VENDOR: "fan",
  VOLUNTEER: "fan",
};

const PERSONA_ORDER: Persona[] = ["admin", "coach", "scorer", "scout", "fan"];

/** Every persona the user can open, most privileged first, deduplicated. */
export function personasForRoles(roles: readonly string[]): Persona[] {
  const seen = new Set<Persona>();
  for (const role of roles) {
    const persona = ROLE_PERSONAS[role];
    if (persona) seen.add(persona);
  }
  if (seen.size === 0) seen.add("fan");
  return PERSONA_ORDER.filter((persona) => seen.has(persona));
}

// The sections themselves. `personas` says who may see a section; the union across a user's personas is their sidebar.
const SECTIONS: NavSection[] = [
  {
    label: "Live & Game Control",
    personas: ["admin", "scorer"],
    links: [
      { href: "/gameday", label: "Game Control Board" },
      { href: "/broadcast", label: "Broadcast" },
      { href: "/novelty-matches", label: "Exhibition" },
    ],
  },
  {
    label: "Coach hub",
    personas: ["coach", "admin"],
    links: [
      { href: "/coaching", label: "Overview" },
      { href: "/coaching/squad", label: "Squad roster" },
      { href: "/coaching/selection", label: "Selection advisor" },
      { href: "/coaching/opponents", label: "Opponent plans" },
      { href: "/coaching/training", label: "Training & plans" },
    ],
  },
  {
    label: "Manage",
    personas: ["admin"],
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/demo-mode", label: "Demo Mode" },
      { href: "/competitions", label: "Tournaments" },
      { href: "/events", label: "Events & Tickets" },
      { href: "/launch-readiness", label: "Launch" },
    ],
  },
  {
    label: "Tournament",
    personas: ["admin", "scout"],
    links: [
      { href: "/fixtures", label: "Fixtures & Stats" },
      { href: "/standings", label: "Standings" },
      { href: "/leaders", label: "Leaders" },
      { href: "/clubs", label: "Clubs" },
      { href: "/players", label: "Athletes" },
      { href: "/coaches", label: "Coaches" },
      { href: "/applications", label: "Applications" },
      { href: "/drafts", label: "Drafts" },
      { href: "/draft-events", label: "Draft Day" },
    ],
  },
  {
    label: "Scouting",
    personas: ["scout", "coach", "admin"],
    links: [
      { href: "/participants/search", label: "Athlete search" },
      { href: "/draft-readiness", label: "Draft board" },
      { href: "/data-readiness", label: "Data readiness" },
    ],
  },
  {
    label: "Commerce",
    personas: ["admin"],
    links: [
      { href: "/vendors", label: "Vendors" },
      { href: "/orders", label: "Orders" },
      { href: "/check-in", label: "Gate Scanner" },
      { href: "/qr-operations", label: "QR Ops" },
    ],
  },
  {
    label: "System",
    personas: ["admin"],
    links: [
      { href: "/access", label: "Game-Control Access" },
      { href: "/operations", label: "Operations" },
      { href: "/content", label: "Content" },
      { href: "/media", label: "Media" },
      { href: "/imports", label: "Imports" },
      { href: "/audit", label: "Audit" },
      { href: "/announcements", label: "Announcements" },
    ],
  },
];

/**
 * The sidebar for one persona. Sections keep their declared order; a persona with no operational tools (fan) gets an empty
 * list, and the shell renders no sidebar rather than an empty rail.
 */
export function sectionsForPersona(persona: Persona): NavSection[] {
  return SECTIONS.filter((section) => section.personas.includes(persona));
}

/** Where a persona lands when it is opened: its first link. */
export function homeForPersona(persona: Persona): string {
  const first = sectionsForPersona(persona)[0]?.links[0];
  if (first) return first.href;
  return persona === "fan" ? "/" : "/dashboard";
}
