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
- [x] `pipeline/history.py` written and tested against synthetic data; league 369973's structure, scoring and
  14 seasons of history (2012-2025, plus 2026 in progress) confirmed live via ESPN's API.
- [ ] GitHub repo `fantastic-family-odds` not yet created — waiting on Austin to create it (public) and grant the
  Claude GitHub App access, same as Love Mahomies.
- [ ] `ESPN_S2`/`ESPN_SWID` secrets not yet added to this repo (same ESPN account as Love Mahomies, so the same
  cookie values should work, but Austin needs to confirm and add them himself — never commit these).
- [ ] GitHub Pages not yet enabled for this repo.
- [ ] Playoff weeks (15-17... this league's bracket runs to week 17 too, 8 teams, 3 rounds) tested on sample data
  only; recheck once ESPN posts the 2026 bracket.
- [ ] D/ST statIds 89/90/92/93 unconfirmed (see Scoring above) — low priority, display-only.
- Ideas: re-derive Sleeper/advanced scoring for this league's rules so projections stop being ESPN-only; refit
  `pipeline/config.py`'s volatility constants once this league has its own season of data.

## Working conventions

- Test offline: `python tests/make_fixtures.py /tmp/fx 8 && python -m pipeline.run --fixtures /tmp/fx --sample --rebuild --no-advanced --no-odds --no-sleeper`
- The site has no build step; edit `docs/` directly and check desktop and phone widths.
- Never commit ESPN cookies.
