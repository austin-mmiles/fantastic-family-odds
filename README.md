# Fantastic Family Odds Board

An odds board for the Fantastic Family Association fantasy football league: title, playoff and matchup odds,
how they have moved week to week, a rest-of-season outlook for every rostered player, and an all-time History
tab (champions, top scores, all-time records back to 2012). No betting here — this is a fork of the
[Love Mahomies odds board](https://github.com/austin-mmiles/love-mahomies-odds) with the sportsbook removed and
league history added.

The site is static (`docs/`) and served by GitHub Pages. Two scheduled GitHub Actions keep the data fresh and
commit it to `docs/data/`.

## One-time setup

1. **Add your ESPN cookies as repository secrets** (Settings → Secrets and variables → Actions → New repository secret).
   The league is private, so ESPN needs to know the request comes from a league member.
   - `ESPN_S2`: the value of the `espn_s2` cookie
   - `ESPN_SWID`: the value of the `SWID` cookie, including the curly braces

   To find them: log in at fantasy.espn.com in Chrome, open DevTools (F12) → Application → Cookies →
   `https://fantasy.espn.com`, and copy the two values. They last about a year; if a workflow starts failing
   with a 401, replace them. (If you already have these set for Love Mahomies on the same ESPN account, the
   same values work here.)
2. **Turn on Pages**: Settings → Pages → Deploy from a branch → `main`, folder `/docs`.
3. **Run both workflows once**: Actions → "Update odds" → Run workflow (rebuilds the season from Week 1), then
   Actions → "Update history" → Run workflow (builds the all-time History tab, 2012-present).

## How it updates

- **Update odds**, every 10 minutes: checks the NFL scoreboard and re-runs the model when a game is being
  played, a game just started or finished, or the last update is more than 3 hours old. Otherwise it exits in
  a few seconds. Each run refreshes the current week's snapshot; when the week rolls over, the last snapshot
  is kept as history.
- **Update history**, once a day: rebuilds `docs/data/alltime.json` from every ESPN season on record. All-time
  totals barely change mid-week, so this doesn't need the 10-minute cadence.
- Past weeks that predate the site are rebuilt once. Old rest-of-season projections are not archived, so those
  weeks use each player's projection at the time as a stand-in.

## The model

`pipeline/model.py` plays out the rest of the season 20,000 times:

- Projections: ESPN's own weekly projections, scaled to what this league's starters have actually scored.
  (Sleeper, the nflverse usage model, and DraftKings lines are turned off for this league — see CLAUDE.md's
  "Scoring" section for why.)
- Each player's boom/bust spread comes from his own game log.
- Each week, managers start their best lineup; scores are drawn with a floor near zero and a long upside tail.
  Quarterbacks move with their receivers and kicker; a D/ST moves against the offense it faces.
- Injuries, questionable tags, byes, and uncertainty that grows for later weeks are included.
- Playoffs follow the league settings (8 teams, reseeded each round, points as the tiebreaker).

Constants are in `pipeline/config.py`.

## League history

`pipeline/history.py` fetches every ESPN season back to 2012 (one API call per season) and computes the
champion for each year, the top 10 single-week and single-season scores, and all-time win-loss records by
owner. See CLAUDE.md for how the champion is determined and how owners are merged across team renames.

## Run locally

```
pip install numpy pandas
ESPN_S2=... ESPN_SWID=... python -m pipeline.run --no-sleeper --no-advanced --no-odds
ESPN_S2=... ESPN_SWID=... python -m pipeline.history
python -m http.server -d docs 8000
```

Test without ESPN access: `python tests/make_fixtures.py /tmp/fx 8 && python -m pipeline.run --fixtures /tmp/fx --sample --rebuild --no-advanced --no-odds --no-sleeper`
