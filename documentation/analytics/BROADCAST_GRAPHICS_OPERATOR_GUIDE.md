# Broadcast Graphics Operator Guide

How to use `/broadcast/graphics` — the Ultra Basketball media team's production workspace for
turning verified Season Zero analytics into broadcast, social, and web graphics. Built in Track
G.14 on top of the card system documented in
[`ULTRA_ANALYTICS_CARD_GUIDE.md`](./ULTRA_ANALYTICS_CARD_GUIDE.md).

## Access

Session-authenticated, same login as `/broadcast/stats` and every other internal operations page
— not part of the public site. If you're not logged in, you'll be redirected to `/login`.

## The workflow

1. Open **`/broadcast/graphics`**.
2. Pick a category tab: **Players, Teams, Games, Leaders, Records, Milestones, Matchups.**
3. Each subject row shows only the card types that genuinely apply to it — a player with no
   milestone this season shows no "Milestone" button; a team below the Team DNA qualification
   floor (fewer than 2 games) shows no "Team DNA" button. You never have to guess whether a card
   will actually have content.
4. Click a card-type button (e.g. "Spotlight," "DNA," "Best Game") to open the full production
   preview.
5. On the preview page, switch between **Web, Square, Portrait, Broadcast 16:9** — the card
   content reflows to fit each format live.
6. Below the card, a **Suggested Caption** block shows the deterministic social copy for that
   exact card (headline / subject / stat) — copy-paste it, it's never auto-posted anywhere.
7. If the subject has a public share page, an **Open Public Share View** link takes you to the
   canonical `/public/share/*` route.

You never construct a URL by hand — every button on the gallery and preview pages is a real link
with the right query parameters already filled in.

## Category tabs

| Tab | Shows | Card buttons offered (only when applicable) |
|---|---|---|
| **Players** | Every player with at least one game played | Spotlight (always) · DNA (qualified sample only) · Best Game (always) · Milestone (if earned) · Season Leader (if rank #1 in a real category) |
| **Teams** | All 8 clubs | Team Profile (always) · Team DNA (qualified sample only) · Best Performance (always) · Milestone (if earned) · a link to the public club page |
| **Games** | Every `FINAL` Season Zero game | Game Result (always) · Game Star (if a Game Star was determined) · Why They Won (if any directional factor exists) · a link to the full game story |
| **Leaders** | Scoring / Rebounding / Assist / FG% / 3PT% leaders | View Card for the current #1 in each category |
| **Records** | The full Season Zero Record Book | View Card (Graphics Gallery preview) and Share View (public page) |
| **Milestones** | The 12 most recent player and team milestones | View Card |
| **Matchups** | Two dropdown forms — pick any two players, or any two teams | Generate Matchup Card |

## Formats

| Format | Dimensions | Use |
|---|---|---|
| Web | responsive | embedded directly in a page |
| Square | 1080×1080 | Instagram/general social |
| Portrait | 1080×1350 | Instagram/Twitter portrait |
| Broadcast 16:9 | 1920×1080 | on-air / LED display composition |

## Exporting a PNG

For the four card types that have a public share route (Player Spotlight, Team Profile, Game
Result, Record), a matching **PNG endpoint** exists:

```
/api/share/player/[id]?format=square|portrait|broadcast
/api/share/team/[id]?format=square|portrait|broadcast
/api/share/game/[id]?format=square|portrait|broadcast
/api/share/record/[key]?format=square|portrait|broadcast
```

Open the URL directly in a browser tab to view/save the PNG (right-click → Save Image, or use
your browser's download action) — there's no in-app "Download" button, since a same-origin image
URL you can open directly is more reliable across environments than a script-triggered download.

For card types without a dedicated PNG endpoint (Game Star, Player DNA, Team DNA, Matchup,
Category Leader, Milestone, Why They Won), use the Graphics Gallery preview and your OS/browser's
own screenshot tool — the HTML preview is pixel-accurate to the intended composition at every
format.

## What every graphic can and cannot say

- **Never** a 4PT, Ultra Time, shot-location, or possession-level statistic for a historical
  Season Zero game — all 11 real games are `BOX_SCORE_ONLY`, and no card builder in this system
  reads those fields for a `BOX_SCORE_ONLY` game (this is enforced in code, not just by omission
  in the UI — see the capability-gating tests in `analytics.test.ts`).
- **Never** a prediction, win probability, or "expected winner" — every comparison/matchup card is
  explicitly descriptive of what already happened, tested to never contain that language.
- **Never** a player's or staff member's email, phone number, or any internal database ID — cards
  only ever expose the same public-safe fields already shown on the public website.
- **Never** "Ultra Basketball all-time record" — say "Season Zero record" until a real second
  season's data exists in the database.

## Known limitations

- Card types without a public share route (Game Star, Player DNA, Team DNA, Matchup, Category
  Leader, Milestone, Why They Won) are viewable and screenshot-able through the Graphics Gallery,
  but don't yet have a dedicated `/api/share/*` PNG endpoint of their own — only the original four
  share-route card types do.
- The Matchup tab's player/team dropdowns list every rostered subject; for a very large future
  roster this would benefit from a search box, but Season Zero's ~50 active players and 8 teams
  are small enough to browse directly.
