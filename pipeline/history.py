"""All-time league history: champions, top scores, and all-time records, back to ESPN's earliest season.

Reuses the Espn client's auth (ESPN_S2 / ESPN_SWID). Unlike the weekly model, this needs no projections --
ESPN's own box scores already carry each team's final score for a finished week, so this module just reads
and aggregates them.

    python -m pipeline.history [--out docs/data/alltime.json] [--first 2012] [--current 2026]
"""
import argparse, json, os, sys
from .espn import Espn, EspnError

HBASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{league}"
CBASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league}"


def _get(api, season, current):
    """One season's teams + full schedule, win a single call. `current` -> the live (non-history) endpoint."""
    import urllib.request
    url = (CBASE if season == current else HBASE + "?seasonId={season}").format(
        league=api.league_id, season=season)
    url += ("&" if season == current else "&") + "view=mTeam&view=mMatchupScore"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    if api.s2 and api.swid:
        req.add_header("Cookie", f"espn_s2={api.s2}; SWID={api.swid}")
    with urllib.request.urlopen(req, timeout=40) as r:
        j = json.load(r)
    return j[0] if isinstance(j, list) else j


def fetch_season(api, season, current):
    try:
        L = _get(api, season, current)
    except Exception as e:
        return {"year": season, "error": str(e)}
    teams = []
    for t in L.get("teams") or []:
        name = ((t.get("location") or "") + " " + (t.get("nickname") or "")).strip() or t.get("name") or f"Team{t['id']}"
        rec = t.get("record", {}).get("overall") or {}
        teams.append({
            "id": t["id"], "name": " ".join(name.split()), "owners": t.get("owners") or [],
            "rcf": t.get("rankCalculatedFinal"), "seed": t.get("playoffSeed"),
            "w": rec.get("wins", 0), "l": rec.get("losses", 0), "t": rec.get("ties", 0),
            "pf": rec.get("pointsFor", 0.0), "pa": rec.get("pointsAgainst", 0.0),
        })
    weeks = {}
    for m in L.get("schedule") or []:
        wk = m.get("matchupPeriodId")
        for side in ("home", "away"):
            s = m.get(side)
            if s and s.get("totalPoints") is not None:
                weeks.setdefault(wk, []).append({"t": s["teamId"], "p": s["totalPoints"]})
    members = {m["id"]: {"name": ((m.get("firstName") or "") + " " + (m.get("lastName") or "")).strip(),
                         "dn": m.get("displayName")} for m in L.get("members") or []}
    return {"year": season, "teams": teams, "weeks": weeks, "members": members}


def fetch_all(league_id, s2, swid, first, current, log=print):
    api = Espn(league_id, current, s2, swid)
    seasons, owners = {}, {}
    for y in range(first, current + 1):
        log(f"  fetching {y}...")
        s = fetch_season(api, y, current)
        if s.get("error"):
            log(f"    skipped ({s['error']})")
            continue
        seasons[y] = s
        for oid, m in s["members"].items():
            owners.setdefault(oid, m)
    return seasons, owners


def owner_name(owners, oid):
    m = owners.get(oid)
    if not m:
        return oid
    return m["name"].strip() or m.get("dn") or oid


def build(seasons, owners, current):
    """-> {champions, top_weeks, top_seasons, records} using team-season display names, merged by owner name."""
    week_scores, season_rows, champions = [], [], []
    by_name = {}
    for y, s in sorted(seasons.items()):
        team_name = {t["id"]: t["name"] for t in s["teams"]}
        for wk, rows in s["weeks"].items():
            for row in rows:
                week_scores.append({"y": y, "wk": wk, "team": team_name.get(row["t"], row["t"]), "p": round(row["p"], 2)})
        for t in s["teams"]:
            oid = (t["owners"] or [None])[0]
            name = owner_name(owners, oid) if oid else "Unknown"
            season_rows.append({"y": y, "team": t["name"], "owner": name, "pf": round(t["pf"], 2)})
            rec = by_name.setdefault(name, {"owner": name, "w": 0, "l": 0, "t": 0, "seasons": 0, "titles": 0, "pf": 0.0})
            rec["w"] += t["w"]; rec["l"] += t["l"]; rec["t"] += t["t"]; rec["seasons"] += 1; rec["pf"] += t["pf"]
            if t["rcf"] == 1 and y != current:
                rec["titles"] += 1
        if y != current:
            champ = next((t for t in s["teams"] if t["rcf"] == 1), None)
            if champ:
                oid = (champ["owners"] or [None])[0]
                champions.append({"y": y, "team": champ["name"], "owner": owner_name(owners, oid) if oid else "Unknown",
                                   "seed": champ["seed"], "w": champ["w"], "l": champ["l"]})
    week_scores.sort(key=lambda r: -r["p"])
    season_rows.sort(key=lambda r: -r["pf"])
    champions.sort(key=lambda r: r["y"])
    records = sorted(by_name.values(), key=lambda r: -( (r["w"] + 0.5 * r["t"]) / max(1, r["w"] + r["l"] + r["t"]) ))
    for r in records:
        r["pf"] = round(r["pf"], 2)
    return {
        "seasons": sorted(seasons), "champions": champions,
        "top_weeks": week_scores[:10], "top_seasons": season_rows[:10], "records": records,
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "data", "alltime.json"))
    ap.add_argument("--first", type=int, default=2012)
    ap.add_argument("--current", type=int, default=None, help="defaults to pipeline.config.SEASON")
    a = ap.parse_args(argv)
    from . import config as C
    current = a.current or C.SEASON
    s2, swid = os.environ.get("ESPN_S2"), os.environ.get("ESPN_SWID")
    seasons, owners = fetch_all(C.LEAGUE_ID, s2, swid, a.first, current)
    if not seasons:
        print("ERROR: no seasons fetched", file=sys.stderr)
        return 2
    out = build(seasons, owners, current)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {a.out}: {len(out['seasons'])} seasons, {len(out['champions'])} champions, {len(out['records'])} owners")
    return 0


if __name__ == "__main__":
    sys.exit(main())
