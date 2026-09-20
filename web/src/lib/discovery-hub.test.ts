import assert from "node:assert/strict";
import test from "node:test";
import { filterHubTournaments } from "@/lib/discovery-hub";

const rows = [
  { slug: "vb-cup", name: "Volleyball Cup", sportSlug: "volleyball", sportName: "Volleyball", cities: ["Lagos"] },
  { slug: "fb-league", name: "Lagos Football League", sportSlug: "football", sportName: "Football", cities: ["Lagos", "Abuja"] },
  { slug: "tt-open", name: "Table Tennis Open", sportSlug: "table-tennis", sportName: "Table Tennis", cities: ["Abuja"] },
];

test("empty filter keeps everything", () => {
  assert.equal(filterHubTournaments(rows, {}).length, 3);
});

test("sport filter matches slug case-insensitively, 'all' is open", () => {
  assert.deepEqual(filterHubTournaments(rows, { sport: "Football" }).map((r) => r.slug), ["fb-league"]);
  assert.equal(filterHubTournaments(rows, { sport: "all" }).length, 3);
});

test("city filter matches any host city", () => {
  assert.deepEqual(filterHubTournaments(rows, { city: "abuja" }).map((r) => r.slug), ["fb-league", "tt-open"]);
});

test("search matches name, sport, or city", () => {
  assert.deepEqual(filterHubTournaments(rows, { q: "cup" }).map((r) => r.slug), ["vb-cup"]);
  assert.deepEqual(filterHubTournaments(rows, { q: "TENNIS" }).map((r) => r.slug), ["tt-open"]);
  assert.deepEqual(filterHubTournaments(rows, { q: "lagos" }).map((r) => r.slug), ["vb-cup", "fb-league"]);
});

test("filters combine", () => {
  assert.deepEqual(filterHubTournaments(rows, { sport: "football", city: "Abuja", q: "league" }).map((r) => r.slug), [
    "fb-league",
  ]);
  assert.equal(filterHubTournaments(rows, { sport: "football", city: "Abuja", q: "cup" }).length, 0);
});
