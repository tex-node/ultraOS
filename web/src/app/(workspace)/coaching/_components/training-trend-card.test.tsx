import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TrainingTrendCard } from "./training-trend-card";
import type { PlanTrendArea } from "@/server/coaching/training";

// The trend card's contract, rendered with react-dom/server (a server component with no hooks - the
// static render IS the production render, same pattern as selection-view.test.tsx).
//
// The test that matters most is the "Missing data" one: a session with no logged metric must never
// render a 0. A zero is a measurement; a blank is the absence of one, and the coach decides what to do
// about it.

const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`);

const area = (overrides: Partial<PlanTrendArea> = {}): PlanTrendArea => ({
  metricKey: "game.tov_pg",
  metricLabel: "Turnovers per game",
  unit: null,
  targetValue: 2,
  targetLabel: "2.0 per game",
  reviewWindowGames: 6,
  gamesSinceAdoption: 2,
  points: [
    { sessionId: "s1", occurredAt: at(1), value: 4.2 },
    { sessionId: "s2", occurredAt: at(8), value: null },
    { sessionId: "s3", occurredAt: at(15), value: 2.5 },
  ],
  ...overrides,
});

test("a session with no logged metric renders 'Missing data', never a zero", () => {
  const html = renderToStaticMarkup(<TrainingTrendCard areas={[area()]} trainingHref="/coaching/c/training" />);
  assert.match(html, /Missing data/);
  assert.doesNotMatch(html, />0<|: 0<|: 0 /, "no zero is displayed for the unlogged session");
  assert.match(html, /1 missing data/);
});

test("the card reports the game window and the session count as two different clocks", () => {
  const html = renderToStaticMarkup(<TrainingTrendCard areas={[area({ gamesSinceAdoption: 2 })]} trainingHref="/x" />);
  assert.match(html, /2 of 6 games/);
  assert.match(html, /4 to go/);
  assert.match(html, /sessions assigned to this plan/);
});

test("a complete window says so instead of counting down", () => {
  const html = renderToStaticMarkup(<TrainingTrendCard areas={[area({ gamesSinceAdoption: 6 })]} trainingHref="/x" />);
  assert.match(html, /6 of 6 games/);
  assert.match(html, /window complete/);
});

test("a metric where lower is better is judged against the target; the verdict is rendered", () => {
  const html = renderToStaticMarkup(<TrainingTrendCard areas={[area()]} trainingHref="/x" />);
  // latest 2.5 vs target 2.0 for a lower-is-better metric -> off target.
  assert.match(html, /off target/);
  assert.match(html, /2\.5/);
});

test("an unknown-direction metric renders 'no verdict' rather than a wrong colour", () => {
  const html = renderToStaticMarkup(<TrainingTrendCard areas={[area({ metricKey: "custom.thing" })]} trainingHref="/x" />);
  assert.match(html, /no verdict/);
  assert.doesNotMatch(html, /on target|off target/);
});

test("a plan with no completed sessions explains what to do instead of showing an empty chart", () => {
  const html = renderToStaticMarkup(<TrainingTrendCard areas={[area({ points: [] })]} trainingHref="/x" />);
  assert.match(html, /No completed session is assigned to this plan yet/);
  assert.doesNotMatch(html, /Missing data/);
});
