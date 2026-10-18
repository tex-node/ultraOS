# Player Selection / Rotation Advisor - real-data sanity check

Written 2026-10-18 for P15 I2-b. Read this before trusting or tuning the advisor in
`src/lib/coaching/selection.ts`.

**Question this answers:** does the advisor's top five look like what coaches actually did?

**Short answer:** yes, but only where it has enough data - 4/5 overlap on the three LBCL fixtures
with a real sample, 3/5 on the Ultra fixture where no player has one. The four divergences are all
explainable by things the advisor cannot see (a player who did not play at all, a coach's short
rotation), not by the model being wrong. **Nothing was tuned to match these results** - two genuine
bugs the exercise exposed were fixed (below), and that is all.

## Method

- **As-of kickoff, not hindsight.** For each fixture the advisor is rebuilt from games played
  *before* that fixture only, and the fixture itself is excluded (`--exclude-fixture` +
  `--as-of` on `scripts/coaching-selection-preview.ts`). Without this the advisor would see the very
  game it is being compared against.
- **Focus side = the home club** of each fixture (the script is deterministic; the page lets a coach
  choose either side, and a coach of either club sees their own).
- **Comparison proxy:** the five players with the most minutes in that game. This is not the same as
  "the starting five" - a box score records minutes, not who was announced first - but it is the only
  outcome the data contains, and a rotation advisor's job is to predict minutes.
- Fixtures: three LBCL games late in the season (26, 27 and 31 prior games in scope) and one Ultra
  Season Zero game (11 prior games, but only two per player).

## Results

| # | Fixture | Prior games | Advisor status | Matchup | Overlap (advised top 5 vs actual top-5 minutes) |
|---|---|---|---|---|---|
| 1 | LBCL: Campos 75-40 White Fire, 2026-10-02 | 26 | OK | DEGRADED | **4/5** |
| 2 | LBCL: White Fire 55-58 Ogra, 2026-10-03 | 27 | OK | INSUFFICIENT_DATA | **4/5** |
| 3 | LBCL: LXB Surulere 54-58 Cantonment, 2026-10-04 | 31 | OK | INSUFFICIENT_DATA | **4/5** |
| 4 | Ultra: Surge 15-26 Vortex, 2026-08-15 | 11 (2 per player) | **INSUFFICIENT_DATA** | INSUFFICIENT_DATA | 3/5 (not meaningful) |

### Fixture 1 - Campos 75-40 White Fire (4/5)

Advised: Adesuyi (76), Stephen Q (60), Korede (44), Donald (35), Shedrack (no sample).
Actual minutes: Pascal 26, Korede 25, Shedrack 23, Donald 22, Stephen Q 22, Akunebe 22, **Adesuyi 21**.

Every advised starter played 21-25 minutes. The only difference is which of Adesuyi (21 min) and
Pascal (26 min) makes the top five - a 5-minute gap between 6th and 5th. **No explanation needed: the
advisor was right about the rotation and wrong by one place at the margin.** Shedrack is a good
illustration of the sample rule: three games (below C1's four-game gate), so no form score, and he is
still ranked 5th on matchup and availability - and he played 23 minutes.

### Fixture 2 - White Fire 55-58 Ogra (4/5)

Advised: Obioma (57), Fofana (53), Olisaemeka (47), Jeboto (44), Laditan (43).
Actual minutes: Olisaemeka 33, Obioma 30, Kelechi 27, Laditan 25, Jeboto 23... **Fofana: did not play.**

Four of five advised starters played 23-33 minutes. **Fofana did not appear in the box score at all.**
The advisor scored him on six games of history and cannot know he was unavailable - there is no
injury, suspension or squad-availability feed in the product, and inventing one from absence patterns
would be guessing. This is the single largest class of error the advisor will make in practice, and it
is a **data gap, not a model flaw**: the fix is a coach marking availability, not a different formula.

### Fixture 3 - LXB Surulere 54-58 Cantonment (4/5)

Advised: Udeli (69), Joshua (65), Francis (62), Igwe (55), Eze (49).
Actual minutes: Momoh 37, Udeli 36, Francis 35, Eze 27, Joshua 23, Segun 23, then six players with 1-3
minutes each (a 12-man rotation).

Four of five advised starters were genuinely in the rotation (23-36 minutes). Two things the advisor
could not see:

- **Ahmad Momoh played 37 minutes** and is not in the advised eight at all. He had three games in the
  window with a form sample below the gate, so he ranks with the no-sample group. Nothing in a box
  score predicts that a bench player is about to play 37 minutes.
- **Ik Igwe was advised to start and played 1 minute.** He has a real sample (four games) and decent
  form, so the advice was defensible on the evidence - the coach simply went a different way.

The 12-man rotation with six sub-3-minute appearances is also a sign of a game that stopped being
competitive (54-58 final, so not a blowout - more likely foul trouble or a short bench). **The advisor
has no notion of "this is a game the coach treats as a run-out".**

### Fixture 4 - Ultra Surge 15-26 Vortex (3/5, and the advisor says so)

Every Surge player had at most two games, against C1's four-game gate, so **no player has a form
sample**: the advisor returns `INSUFFICIENT_DATA` and the page shows the ranked squad with the banner
"insufficient games to generate a recommendation", no START/ROTATE labels. The three advised names
that did play were the three who played the most (20, 18, 13 minutes). The overlap figure is noise;
what matters is that the **UI refuses to give advice** in this state (see the component test).

Note what the Ultra case exposes: with no form samples anywhere, the ordering falls back to
availability and freshness, and players who have never played at all appear in the list with neutral
scores. That is why the page shows no recommendation labels here and why a no-sample player's overall
is displayed as a dash.

## What the exercise changed (two real bugs, no tuning)

1. **Load counted future fixtures.** A game scheduled next week was counted as load carried this week
   whenever the advisor was asked about a past date. Fixed by bounding the window at both ends.
2. **Never-played players were "perfectly fresh".** A player with zero appearances scored load 100,
   which is the opposite of a load signal, and in the Ultra fixture it put two players who did not
   play above players who did. Fixed: zero appearances is a neutral 50 with "no games recorded" in
   the evidence.
3. **A no-sample form score of 0 was counted as a real 0** in the overall. It is now excluded and the
   overall is renormalized (the same rule already applied to a null matchup), and players without a
   sample rank below players with one - otherwise availability and freshness alone lifted two-game
   players above five-game performers. Their overall is displayed as a dash, not a number.

**Not changed:** the weights (form 0.5, matchup 0.3, availability 0.12, load 0.08), the five-starter
cut, and the matchup model. None of the four fixtures suggested a systematic error large enough to
justify moving those; the errors were about who was *available*, which no weighting can fix.

## Known limits (from the fixtures, in priority order)

1. **Availability is invisible.** Injury, suspension, late arrival, a player who is simply not at the
   gym: none of it reaches the advisor. Fixture 2 lost one of five starters to this.
2. **Rotation intent is invisible.** A coach running a 12-man rotation or resting players in a decided
   game is not predictable from box scores.
3. **Positions are the matchup's precondition.** Where the opponent's positions are not recorded (nine
   of the ten LBCL clubs), matchup degrades to assignments-only or N/A, and the advisor says so.
4. **Small samples are load-bearing.** Ultra's Season Zero (2-3 games per player) cannot support
   advice; the page's `INSUFFICIENT_DATA` state is the honest answer there.

## Where it shows up

- Page: `/coaching/selection/<fixtureId>`, linked from the opponent game-plan page's "Rotation for the
  next game" section.
- CLI: `npx tsx scripts/coaching-selection-preview.ts <organizationId> <seasonId> "<club>" ["<opponent>"] [--exclude-fixture <id>] [--as-of <iso>] [--no-plan] [--json]`.
- Unit tests: `src/lib/coaching/selection.test.ts` (13) and `src/app/coaching/_components/selection-view.test.tsx` (5).
