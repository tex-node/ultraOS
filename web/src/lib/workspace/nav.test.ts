import assert from "node:assert/strict";
import test from "node:test";
import { homeForPersona, personasForRoles, sectionsForPersona } from "@/lib/workspace/nav";

// v36: the sidebar is now a function of the reader's roles, so the mapping is pinned here. The failure these guard against is
// the one the spec names: a coach seeing vendor payouts and audit logs, or an operator seeing courtside-only tools.
test("an operator opens the admin persona and sees the commerce/system sections", () => {
  const personas = personasForRoles(["LEAGUE_OPERATOR"]);
  assert.deepEqual(personas, ["admin"]);
  const labels = sectionsForPersona("admin").map((section) => section.label);
  assert.ok(labels.includes("Commerce"));
  assert.ok(labels.includes("System"));
});

test("a coach opens the coach persona and sees the coach hub, but never commerce or system", () => {
  assert.deepEqual(personasForRoles(["COACH"]), ["coach"]);
  const labels = sectionsForPersona("coach").map((section) => section.label);
  assert.deepEqual(labels, ["Coach hub", "Scouting"]);
  assert.ok(!labels.includes("Commerce"));
  assert.ok(!labels.includes("System"));
});

test("a scorekeeper gets live controls and nothing administrative", () => {
  const labels = sectionsForPersona(personasForRoles(["SCOREKEEPER"])[0]).map((section) => section.label);
  assert.deepEqual(labels, ["Live & Game Control"]);
});

test("a scout gets the athlete-data sections, not the matchday controls", () => {
  const labels = sectionsForPersona(personasForRoles(["SCOUT"])[0]).map((section) => section.label);
  assert.deepEqual(labels, ["Tournament", "Scouting"]);
});

test("several roles open several personas, most privileged first, without duplicates", () => {
  assert.deepEqual(personasForRoles(["COACH", "LEAGUE_OPERATOR", "SCOREKEEPER"]), ["admin", "coach", "scorer"]);
  assert.deepEqual(personasForRoles(["COACH", "TEAM_MANAGER"]), ["coach"]);
});

test("an unknown or fan-only role opens the fan persona, which has no operational tools", () => {
  assert.deepEqual(personasForRoles(["FAN"]), ["fan"]);
  assert.deepEqual(personasForRoles(["SOMETHING_NEW"]), ["fan"]);
  assert.deepEqual(sectionsForPersona("fan"), []);
  assert.equal(homeForPersona("fan"), "/");
});

test("each persona lands somewhere it can actually use", () => {
  for (const persona of ["admin", "coach", "scorer", "scout"] as const) {
    const home = homeForPersona(persona);
    const reachable = sectionsForPersona(persona).some((section) => section.links.some((link) => home.startsWith(link.href)));
    assert.ok(reachable, `${persona} home ${home} is not in its own sidebar`);
  }
});

test("no link appears in two personas' sections with a different meaning (one href, one label)", () => {
  const byHref = new Map<string, string>();
  for (const persona of ["admin", "coach", "scorer", "scout"] as const) {
    for (const section of sectionsForPersona(persona)) {
      for (const link of section.links) {
        const existing = byHref.get(link.href);
        if (existing) assert.equal(existing, link.label, `${link.href} is labelled "${existing}" and "${link.label}"`);
        byHref.set(link.href, link.label);
      }
    }
  }
});
