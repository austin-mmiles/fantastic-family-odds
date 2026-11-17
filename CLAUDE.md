# Fantastic Family Odds Board: project brief

Odds board (no betting) for Austin's 12-team ESPN fantasy league "Fantastic Family Association" (league 369973,
season 2026, running since 2012 as "Fantastic Family League"). Forked from the Love Mahomies odds board
(github.com/austin-mmiles/love-mahomies-odds) with the sportsbook stripped out and a League History tab added.
Live at https://austin-mmiles.github.io/fantastic-family-odds/ and served from `docs/` on `main` by GitHub Pages.

## What it does

- **Board**: every team's playoff, #1 seed, final and title odds, with week-over-week history.
- **Playoff picture**: scenario simulator for seeds.
- **Matchups**: win chance and moneyline for every remaining game; any-two-teams picker for the current week.
- **Teams / Players**: roster outlook per player (projection, floor, ceiling, boom, bust, matchup, schedule, usage trend).
- **History**: all-time, back to 2012 — champions by year, top 10 single-week scores, top 10 single-season point
  totals, and all-time win-loss records by owner (merged across team renames/re-foundings).
- **How it works**: plain-language method plus a live report of how each projection source has performed.

There is no sportsbook/betting here (unlike Love Mahomies) — Austin wanted the projections, playoff picture and
history without the paper-trading layer.

## Layout

| Path | Purpose |
|---|---|
| `pipeline/run.py` | Entry point: `python -m pipeline.run`. Fetches data, simulates, writes `docs/data/`. |
| `pipeline/history.py` | All-time league history: `python -m pipeline.history`. Writes `docs/data/alltime.json`. |
| `pipeline/espn.py` | ESPN Fantasy API client (needs `ESPN_S2`, `ESPN_SWID` cookies for this private league). |
| `pipeline/sleeper.py`, `pipeline/advanced.py`, `pipeline/odds.py` | Extra projection sources — **not used for this league** (see Scoring below); kept from the Love Mahomies fork so this repo can turn them on later. |
| `pipeline/blend.py` | Fits source weights by backtest each run; degrades to ESPN-only when the other sources are off. |
| `pipeline/model.py` | Monte Carlo season simulator and per-player outlook. |
| `pipeline/live.py` | NFL scoreboard (kickoffs, game states) for in-week point-locking; also the gate for the scheduled run. |
| `pipeline/config.py` | League id and all model constants. |
| `docs/` | Static site (`index.html`, `app.js`, `style.css`), no build step. |
| `docs/data/latest.json`, `history.json` | Current snapshot and one frozen snapshot per week. |
| `docs/data/alltime.json` | All-time history data (champions, top scores, all-time records), written by `pipeline/history.py`. |
| `tests/make_fixtures.py` | Builds ESPN-format sample data so the pipeline runs with no network. |
| `.github/workflows/update.yml` | Wakes every 10 minutes; runs the model only when `pipeline.live --need` says something changed. |
| `.github/workflows/history.yml` | Runs `pipeline.history` once a day (all-time data barely changes mid-week). |

## League facts the model depends on

- Lineup: QB, 2 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE), D/ST, K, 7 bench, 1 IR.
- Scoring: full PPR, **6-pt** pass/rush/rec TD, 0.04/pass yd, -2 INT, 0.1/rush or rec yd, **no rushing-first-down
  bonus** (unlike Love Mahomies' 0.5/first-down), distance field goals (3 pts under 40, 4 for 40-49, 5 for 50+),
  missed FG -1, D/ST points- and yards-allowed bands (see "Scoring" below — 4 of the D/ST bands are unconfirmed).
- 14-week regular season; 8 playoff teams; reseeded each round; points scored breaks ties.

## Scoring: why Sleeper/nflverse/DraftKings are off for this league

This league's scoring differs from Love Mahomies' (6-pt passing TDs instead of 4, no rushing-first-down bonus,
different FG/D-ST bands), and `pipeline/sleeper.py` and `pipeline/advanced.py`'s `points_from` hard-code Love
Mahomies' formula. Re-deriving them risked silently mis-scoring players. `pipeline/run.py` already degrades
cleanly to ESPN-only weighting (`{"espn": 1.0}`) when passed `--no-sleeper --no-advanced --no-odds` — confirmed
with no code changes needed — so the scheduled workflow runs with those three flags. ESPN's own
`appliedTotal`/`appliedStatTotal` are already correctly scored for this league, so the model loses the
Sleeper/usage/Vegas blend but not correctness.

Four D/ST-only statIds in this league's scoring settings (89, 90, 92, 93 — likely low points-allowed bands like
PA0/PA1-6) are unconfirmed; this only affects the display-only D/ST scoring note, not the model, since ESPN's own
box scores are used as-is.

To turn Sleeper/advanced/odds back on for this league: re-derive `points_from` for 6-pt TDs and no first-down
bonus, confirm the D/ST bands against ESPN's `scoringItems` for this league (`view=mSettings`), then drop the
three `--no-*` flags from `update.yml`.

## Model summary

1. Per player per week: ESPN's own projection, scaled to what this league's starters have actually scored (no
   Sleeper/usage/Vegas blend — see Scoring above).
2. Simulate 20,000 seasons: best-lineup managers, lognormal player scores with per-player volatility, QB/receiver/
   kicker and D/ST-vs-offense correlation, injuries, questionable tags, talent drift for later weeks.
3. The volatility/injury/correlation constants in `pipeline/config.py` are inherited from Love Mahomies, not yet
   refit on this league's own results — revisit once a few weeks of actual-vs-projected data exist here.

## League history (all-time tab)

- `pipeline/history.py` fetches every available ESPN season (2012 on; `leagueHistory` for past seasons, the live
  league endpoint for the current one) with `view=mTeam&view=mMatchupScore` — one call per season, no per-week
  fetching needed since ESPN's own weekly `totalPoints` is already final-scored.
- A season's champion is the team with `rankCalculatedFinal === 1` — **not** `rankFinal`, which ESPN always
  reports as 0. Verified empirically: in 2024, "Victorious $ecret" entered the playoffs as the #4 seed and is
  `rankCalculatedFinal: 1`, i.e. the actual champion. Reseeded, upset-prone playoffs mean the #1 seed is often
  not the champion in this league (e.g. 2014's champion went 5-8 in the regular season).
- All-time records are aggregated by the **ESPN member GUID** that owns a team each season (`team.owners[0]`),
  not by team name, since names/abbreviations change across a team's history. Member display names come from
  each season's `members` list (older seasons' members are merged in, since a departed owner may not appear in
  the current season's list), then rows for the same resolved name are summed.
- `docs/data/alltime.json` shape: `{seasons: [...], champions: [{y, team, owner, seed, w, l}], top_weeks: [...],
  top_seasons: [...], records: [{owner, w, l, t, seasons, titles, pf}]}`.

## Playoff picture (scenario simulator)

- `#/scenarios`, all in the browser: 5,000 seeded simulations of the remaining regular-season games using each
  game's model win chance and projected scores; the user can force any game's winner.
- Shows, for a chosen team: playoff and #1-seed chance, what each final record gets them, which of this week's
  other games matter most, and the seed grid for all 12 teams. Unchanged from the Love Mahomies fork — it only
  depends on `D.games`/`D.teams`, which are league-agnostic.

## Status and open items (update this section as things change)

- [x] Forked from Love Mahomies 2026-11-16: sportsbook (Supabase ledger, bet slip, betting locks) stripped from
  `docs/app.js`/`index.html`/`style.css`; `docs/book-config.json` and `setup/supabase.sql` removed.
- [x] Repo created, Pages enabled, ESPN secrets added, both workflows running live (2026-11-17). Data verified
  against ESPN's own standings page for league 369973 — exact match on every team's W-L and points for.
- [x] `pipeline/history.py` live and confirmed against real league data (14 seasons, 2012-2025, plus 2026 in
  progress). Fixed 2026-11-17: the live-season URL was missing its leading `?` (both branches of the ternary used
  `&`), so the whole current season silently dropped out of `fetch_season` on every run — this is why a top-10
  single-week score from this season was missing from the first "Update history" run. `top_seasons` deliberately
  excludes the in-progress season (a partial total isn't comparable to a full 14-week one); `top_weeks` does not,
  since a finished week's score is already final.
- [x] 2026-11-17, per Austin's feedback: removed the global Players tab (the per-team roster outlook on each
  Team page is unaffected — only the all-players browse/search page is gone); removed the vig/"Prices" selector
  entirely (this site is for seeing projections, not for pricing bets — `price()` now always shows fair odds,
  no multiplier); added click-to-sort column headers on the Board table and the History page's all-time records
  table (`sortHead`/`wireSort` helpers in `docs/app.js`, reusable for other tables later); added a head-to-head
  section to the History tab (career record between any two owners, from a new `h2h` map in `alltime.json`
  aggregated by owner across every season, built in `pipeline/history.py`'s `build()`).
- [x] 2026-11-17: fixed a post-deploy regression from the above — GitHub Pages' CDN kept serving a stale cached
  `app.js` (from before the vig/Players removal) even after the HTML updated, so the live site threw
  `TypeError: Cannot set properties of null (setting 'value')` on the removed `#vig` element and never rendered
  past "Loading the board…". `index.html` now loads `app.js?v=2`; bump that query param on any future `app.js`
  change that doesn't already land in a differently-named file, since GH Pages' CDN cache is more persistent than
  its normal cache-control headers suggest. 2026-11-17 follow-up: `style.css` has the exact same problem (no
  version query string of its own), so a CSS-only change can render stale even after `app.js`/`index.html` are
  confirmed fresh — `index.html` now also loads `style.css?v=3`. **Bump both `app.js?v=N` and `style.css?v=N`
  together on every `docs/` push that touches either file**, and when verifying a deploy, do a real
  `location.reload()` (or open a fresh tab) rather than just changing the URL hash — a hash-only navigation reuses
  the already-loaded (possibly stale) document and never re-fetches anything.
- [x] 2026-11-17, mobile/UI pass per Austin's feedback: found the real cause of the Board's "filter" looking
  misaligned — the metric-selector pills under "How the odds have moved" just wrapped unevenly at phone widths;
  now a clean 2-column grid under 720px (`.seg` media query). Also found `.wallet` (Playoff picture's team
  selector + stat tiles) had no CSS rule at all — a leftover from the sportsbook strip — so it rendered as
  unstyled smashed-together text; replaced with a `.row` + the existing `.stats` grid, same look as the Team
  page. Moved "Seeds for everyone" to right after the headline/stats (was at the bottom); removed "Pick the
  games" entirely (the chip buttons, the per-week game-picker grid, and the underlying `SC.picks`/`gkey` plumbing
  in `scenarioSim`) since it added interaction complexity Austin didn't want — the simulator now always plays out
  from the model's own win chances. The nav bar also squeezed into a narrow one-link-per-line column beside the
  brand on phone widths (brand text left little room beside it); fixed by forcing `nav` to its own full-width row
  under 720px so it wraps normally, 3-ish links per line. Verified with local Playwright screenshots at 390×844
  (iPhone) and 1280×900 (desktop) before pushing — no console errors, no visual regressions on desktop.
- [x] 2026-11-17, round 2 per Austin's feedback (screenshots from his phone): found the actual root cause of the
  Board header looking misaligned with the data — it was never the sortable-filter styling, it's that the body
  row's `<td class="rank">` (the 1/2/3… number) has no matching `<th>` in the header, so every header label was
  silently shifted one column left of its data in `<table>` layout. Fixed by adding a blank leading `<th
  class="rank">` to `viewBoard()`'s `cols` array — sorting is unaffected and kept, since removing it wouldn't
  have fixed the alignment. Nav tabs: replaced the two-row wrap from the previous pass with a single-row,
  horizontally-scrollable pill strip on mobile (bigger touch targets, `aria-current` tab filled solid so the
  active one is obvious, next pill visibly peeking off the right edge as a scroll affordance). Playoff picture:
  reordered so "Seeds for everyone" is now the first section (no team pick needed to see it), with the
  team-picker ("Pick a team": the "Show me" select, stat tiles, headline, "What each finish gets you") below it —
  opposite of the previous pass's order, which Austin asked to flip back. Verified again with local Playwright
  screenshots (390×844 and 1280×900) before pushing.
- [ ] Playoff weeks (this league's bracket runs to week 17 too, 8 teams, 3 rounds) tested on sample data only;
  recheck once ESPN posts the 2026 bracket.
- [ ] D/ST statIds 89/90/92/93 unconfirmed (see Scoring above) — low priority, display-only.
- Ideas: re-derive Sleeper/advanced scoring for this league's rules so projections stop being ESPN-only; refit
  `pipeline/config.py`'s volatility constants once this league has its own season of data; extend `sortHead`/
  `wireSort` to the Teams and top-scores/top-seasons tables if that'd help.

## Working conventions

- Test offline: `python tests/make_fixtures.py /tmp/fx 8 && python -m pipeline.run --fixtures /tmp/fx --sample --rebuild --no-advanced --no-odds --no-sleeper`
- The site has no build step; edit `docs/` directly and check desktop and phone widths.
- Never commit ESPN cookies.
