/* Fantastic Family odds board. Reads data/latest.json, data/history.json and data/alltime.json; no build step. */
(async function () {
  const app = document.getElementById('app');
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let D, H;
  try {
    [D, H] = await Promise.all(['data/latest.json', 'data/history.json'].map(u => fetch(u + '?t=' + Date.now()).then(r => { if (!r.ok) throw new Error(u); return r.json(); })));
  } catch (e) {
    app.innerHTML = '<p class="empty">The odds data has not been published yet. Run the "Update odds" workflow in the repository\'s Actions tab, then reload.</p>';
    return;
  }
  const T = D.teams_meta, ids = Object.keys(T);
  const snaps = H.snapshots || [];
  let vig = 0;
  try { vig = parseFloat(localStorage.getItem('vig') || '0') || 0; } catch (e) {}
  const vigSel = $('#vig'); vigSel.value = String(vig);
  vigSel.addEventListener('change', () => { vig = parseFloat(vigSel.value); try { localStorage.setItem('vig', vig); } catch (e) {} route(); });

  // ---------- formatting ----------
  const pct = (p, d = 1) => p == null ? '–' : (p > 0 && p < 0.001 ? '<0.1' : (100 * p).toFixed(p >= 0.9995 ? 0 : d)) + '%';
  function price(p) {              // American odds, with the chosen vig applied
    if (p == null) return '–';
    const q = Math.min(p * (1 + vig), 0.995);
    if (q < 0.0005) return 'Off';
    const a = q >= 0.5 ? -100 * q / (1 - q) : 100 * (1 - q) / q;
    const r = Math.abs(a) >= 1000 ? Math.round(a / 50) * 50 : Math.abs(a) >= 300 ? Math.round(a / 5) * 5 : Math.round(a);
    return (r > 0 ? '+' : '−') + Math.abs(r).toLocaleString('en-US');
  }
  const teamLink = id => `<a class="team-link" href="#/team/${id}"><span class="dot" style="background:${T[id].color}"></span>${esc(T[id].name)}</a>`;
  const rec = t => `${t.w}-${t.l}${t.t ? '-' + t.t : ''}`;
  function delta(now, before, unit = ' pts') {
    if (before == null) return '<span class="flat">–</span>';
    const d = 100 * (now - before);
    if (Math.abs(d) < 0.05) return '<span class="flat">0.0</span>';
    return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span>`;
  }
  const series = (id, key) => snaps.map(s => ({ x: s.week, y: s.teams[id] ? s.teams[id][key] : null }));
  const prevSnap = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const weekLabel = D.season_over ? 'Final' : `Week ${D.week}`;

  // ---------- charts ----------
  function spark(vals, color) {
    const v = vals.filter(p => p.y != null); if (v.length < 2) return '';
    const w = 96, h = 26, max = Math.max(...v.map(p => p.y), 0.02), x = i => 2 + i * (w - 4) / (v.length - 1), y = p => h - 3 - (h - 6) * p / max;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${v.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1)).join('')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><circle cx="${x(v.length - 1)}" cy="${y(v[v.length - 1].y)}" r="2.6" fill="${color}"/></svg>`;
  }
  function lineChart(lines, opt = {}) {   // lines: [{id,name,color,pts:[{x,y}]}], y in 0..1 unless opt.raw
    const W = 860, Hh = opt.h || 380, m = { l: 44, r: opt.labels === false ? 16 : 168, t: 14, b: 34 };
    const xs = [...new Set(lines.flatMap(l => l.pts.map(p => p.x)))].sort((a, b) => a - b);
    if (xs.length < 1) return '<p class="empty">No history yet.</p>';
    const ymax = opt.raw ? Math.ceil(Math.max(...lines.flatMap(l => l.pts.map(p => p.y || 0))) + 0.5) : [0.1, 0.2, 0.4, 0.6, 0.8, 1].find(v => v >= Math.max(...lines.flatMap(l => l.pts.map(p => p.y || 0))) * 1.04) || 1;
    const X = x => xs.length === 1 ? m.l + (W - m.l - m.r) / 2 : m.l + (W - m.l - m.r) * (x - xs[0]) / (xs[xs.length - 1] - xs[0]);
    const Y = y => m.t + (Hh - m.t - m.b) * (1 - y / ymax);
    const ticks = [0, .25, .5, .75, 1].map(f => f * ymax);
    let g = ticks.map(t => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${opt.raw ? t.toFixed(1) : Math.round(t * 100) + '%'}</text>`).join('');
    g += xs.map(x => `<text x="${X(x)}" y="${Hh - 10}" text-anchor="middle">Wk ${x}</text>`).join('');
    // end labels, nudged apart
    const ends = lines.map(l => ({ l, y: Y(l.pts[l.pts.length - 1].y || 0) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (let i = ends.length - 1; i > 0; i--) { if (ends[i].y > Hh - m.b + 6) ends[i].y = Hh - m.b + 6; if (ends[i].y - ends[i - 1].y < 14) ends[i - 1].y = ends[i].y - 14; }
    const body = lines.map(l => {
      const pts = l.pts.filter(p => p.y != null);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('');
      const last = pts[pts.length - 1];
      return `<path class="s" data-id="${l.id}" d="${d}" stroke="${l.color}"><title>${esc(l.name)}</title></path>` +
        pts.map(p => `<circle data-id="${l.id}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${pts.length === 1 ? 4 : 2.4}" fill="${l.color}"><title>${esc(l.name)}, week ${p.x}: ${opt.raw ? p.y.toFixed(2) : pct(p.y)}</title></circle>`).join('') +
        (opt.labels === false ? '' : `<text class="lab" data-id="${l.id}" x="${W - m.r + 10}" y="${ends.find(e => e.l === l).y + 4}" fill="${l.color}" style="fill:${l.color}">${esc(l.name.length > 19 ? l.name.slice(0, 18) + '…' : l.name)} ${opt.raw ? last.y.toFixed(1) : pct(last.y, 0)}</text>`);
    }).join('');
    return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(opt.label || 'Odds by week')}">${g}${body}</svg>`;
  }
  function wireChart(box, onPick) {       // hover or tap a line / legend chip to isolate it
    const set = id => { box.classList.toggle('has-on', !!id); box.querySelectorAll('[data-id]').forEach(n => n.classList.toggle('on', n.dataset.id === id)); box.querySelectorAll('.legend button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id)); };
    let pinned = null;
    box.addEventListener('pointerover', e => { const n = e.target.closest('svg [data-id]'); if (n && !pinned) set(n.dataset.id); });
    box.addEventListener('pointerout', e => { if (!pinned && e.target.closest('svg [data-id]')) set(null); });
    box.addEventListener('click', e => { const n = e.target.closest('[data-id]'); if (!n) return; pinned = pinned === n.dataset.id ? null : n.dataset.id; set(pinned); if (onPick) onPick(pinned); });
  }

  // ---------- views ----------
  const METRICS = { title: 'Win the title', playoffs: 'Make the playoffs', bye: 'Earn the #1 seed', final: 'Reach the final', exp_wins: 'Expected wins' };
  let boardMetric = 'title';

  function viewBoard() {
    const rows = ids.map(id => ({ id, ...D.teams[id] })).sort((a, b) => b.title - a.title || b.playoffs - a.playoffs);
    const fav = rows[0];
    const mover = prevSnap ? rows.map(r => ({ r, d: r.title - (prevSnap.teams[r.id]?.title ?? r.title) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0] : null;
    const lede = D.season_over
      ? `${esc(T[fav.id].name)} won the ${D.league.season} title.`
      : `${esc(T[fav.id].name)} leads the board at ${pct(fav.title)} to win it all.` + (mover && Math.abs(mover.d) >= 0.005 ? ` Biggest move since last week: ${esc(T[mover.r.id].name)}, ${mover.d > 0 ? 'up' : 'down'} ${Math.abs(100 * mover.d).toFixed(1)} points.` : '');
    app.innerHTML = `<h1>${esc(D.league.name)} title odds, ${weekLabel.toLowerCase() === 'final' ? 'final' : weekLabel}</h1>
      <p class="lede">${lede}</p>
      ${liveBar()}
      <div class="scroll"><table class="board">
        <thead><tr><th class="l" colspan="2">Team</th><th class="hm">Record</th><th class="hm">Points for</th><th>Playoffs</th><th class="hm">#1 seed</th><th>Title</th><th>Price</th><th class="hm">Since last week</th><th class="l hm">Title trend</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-id="${r.id}"><td class="rank">${i + 1}</td><td class="l">${teamLink(r.id)}<span class="sub rec-m"> ${rec(r)}</span></td><td class="hm">${rec(r)}</td><td class="hm">${r.pf.toFixed(1)}</td>
          <td>${pct(r.playoffs)}</td><td class="hm">${pct(r.bye)}</td><td><b>${pct(r.title)}</b></td><td class="price ${i === 0 ? 'fav' : ''}">${price(r.title)}</td>
          <td class="hm">${delta(r.title, prevSnap?.teams[r.id]?.title)}</td><td class="l hm">${spark(series(r.id, 'title'), T[r.id].color)}</td></tr>`).join('')}</tbody>
      </table></div>
      <h2>How the odds have moved</h2>
      <div class="row"><div class="seg" role="group" aria-label="Chart metric">${Object.entries(METRICS).map(([k, v]) => `<button data-m="${k}" aria-pressed="${k === boardMetric}">${v}</button>`).join('')}</div></div>
      <div class="chart" id="trend"></div>
      <p class="sub">Each point is the model's estimate going into that week. Hover or tap a line to isolate a team.${snaps.some(s => s.rebuilt) ? ' Weeks before the site launched were rebuilt after the fact and are approximate.' : ''}</p>`;
    const trend = $('#trend');
    const draw = () => {
      const raw = boardMetric === 'exp_wins';
      trend.innerHTML = lineChart(ids.map(id => ({ id, name: T[id].name, color: T[id].color, pts: series(id, boardMetric) })), { raw, label: METRICS[boardMetric] + ' by week' }) +
        `<div class="legend">${ids.map(id => `<button data-id="${id}" aria-pressed="false"><span class="dot" style="background:${T[id].color}"></span>${esc(T[id].name)}</button>`).join('')}</div>`;
    };
    draw();
    wireChart(trend, id => app.querySelectorAll('.board tr[data-id]').forEach(tr => tr.classList.toggle('is-on', tr.dataset.id === id)));
    app.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; boardMetric = b.dataset.m; app.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); trend.classList.remove('has-on'); draw(); });
  }

  let weekPick = null, h2hA = null, h2hB = null;
  function gameCard(g) {
    const pa = 1 - g.p_home, ws = D.week_scores, isNow = g.week === D.week;
    const side = (id, p, proj, cls) => `<div class="side ${cls}">${teamLink(id)}<div class="pct">${pct(p, 0)}</div><div class="ml">${price(p)}</div>
      <div class="sub">Projected ${proj.toFixed(1)}${isNow && ws[id] ? ` (likely ${ws[id].p10.toFixed(0)} to ${ws[id].p90.toFixed(0)})` : ''}</div></div>`;
    return `<div class="game"><div class="sides">${side(g.away, pa, g.proj_away, '')}<div class="vs">at</div>${side(g.home, g.p_home, g.proj_home, 'r')}</div>
      <div class="split" aria-hidden="true"><i style="width:${100 * pa}%;background:${T[g.away].color}"></i><i style="width:${100 * g.p_home}%;background:${T[g.home].color}"></i></div></div>`;
  }
  function viewWeek() {
    const weeks = [...new Set(D.games.map(g => g.week))].sort((a, b) => a - b);
    const past = [...new Set(D.results.map(g => g.week))].sort((a, b) => a - b);
    if (weekPick == null || ![...weeks, ...past].includes(weekPick)) weekPick = weeks[0] ?? past[past.length - 1];
    const opts = [...past, ...weeks].map(w => `<option value="${w}" ${w === weekPick ? 'selected' : ''}>Week ${w}${w === D.week ? ' (this week)' : w < D.week ? ' (final)' : ''}</option>`).join('');
    let body;
    if (weeks.includes(weekPick)) body = D.games.filter(g => g.week === weekPick).map(gameCard).join('');
    else body = D.results.filter(g => g.week === weekPick).map(g => `<div class="game"><div class="sides">
        <div class="side">${teamLink(g.away)}<div class="result ${g.as > g.hs ? '' : 'flat'}">${g.as.toFixed(2)}</div></div><div class="vs">at</div>
        <div class="side r">${teamLink(g.home)}<div class="result ${g.hs > g.as ? '' : 'flat'}">${g.hs.toFixed(2)}</div></div></div></div>`).join('');
    const hasH2h = Object.keys(D.h2h || {}).length > 0;
    h2hA = h2hA || ids[0]; h2hB = h2hB || ids[1];
    const sel = (id, v) => `<select class="pick" id="${id}">${ids.map(t => `<option value="${t}" ${t === v ? 'selected' : ''}>${esc(T[t].name)}</option>`).join('')}</select>`;
    app.innerHTML = `<h1>Matchup odds</h1>
      <p class="lede">Win chances and moneylines for every game left on the schedule. Later weeks shift as rosters and projections change.</p>
      <div class="row"><label for="wk" class="sub">Week</label><select class="pick" id="wk">${opts}</select></div>
      ${body || '<p class="empty">No games this week.</p>'}
      ${hasH2h ? `<h2>Any two teams, this week</h2><p class="lede">Pick a pair to see who would win if they played in week ${D.week}, whether or not they are scheduled to.</p>
        <div class="row">${sel('ha', h2hA)}<span class="sub">against</span>${sel('hb', h2hB)}</div><div id="h2h"></div>` : ''}`;
    $('#wk').addEventListener('change', e => { weekPick = +e.target.value; viewWeek(); });
    if (hasH2h) {
      const show = () => {
        const p = h2hA === h2hB ? null : D.h2h[h2hA][h2hB];
        $('#h2h').innerHTML = p == null ? '<p class="empty">Pick two different teams.</p>' :
          gameCard({ week: D.week, away: h2hA, home: h2hB, p_home: 1 - p, proj_away: D.week_scores[h2hA].mean, proj_home: D.week_scores[h2hB].mean }).replace('>at<', '>vs<');
      };
      $('#ha').addEventListener('change', e => { h2hA = e.target.value; show(); });
      $('#hb').addEventListener('change', e => { h2hB = e.target.value; show(); });
      show();
    }
  }

  function viewTeams() {
    const rows = ids.map(id => ({ id, ...D.teams[id] })).sort((a, b) => b.playoffs - a.playoffs || b.title - a.title);
    app.innerHTML = `<h1>Teams</h1><p class="lede">Pick a team to see its odds history, remaining schedule and roster outlook.</p>
      <div class="scroll"><table><thead><tr><th class="l">Team</th><th>Record</th><th>Expected wins</th><th>Playoffs</th><th>Reach final</th><th>Title</th><th class="l">Playoff trend</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="l">${teamLink(r.id)}</td><td>${rec(r)}</td><td>${r.exp_wins.toFixed(1)}</td><td>${pct(r.playoffs)}</td><td>${pct(r.final)}</td><td>${pct(r.title)}</td><td class="l">${spark(series(r.id, 'playoffs'), T[r.id].color)}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Luck check</h2>
      <p class="lede">All-play record is how each team would have done playing every other team every week. The gap to the real record is schedule luck.</p>
      <div class="scroll"><table><thead><tr><th class="l">Team</th><th>Record</th><th>All-play record</th><th>All-play win rate</th><th>Wins it deserved</th><th>Luck, in wins</th><th>Points against</th></tr></thead><tbody>
      ${luckRows().map(x => `<tr><td class="l">${teamLink(x.id)}</td><td>${rec(D.teams[x.id])}</td><td>${x.w}-${x.l}</td><td>${pct(x.rate, 0)}</td><td>${x.deserved.toFixed(1)}</td><td class="${x.luck > 0.3 ? 'up' : x.luck < -0.3 ? 'down' : ''}"><b>${x.luck > 0 ? '+' : x.luck < 0 ? '−' : ''}${Math.abs(x.luck).toFixed(1)}</b></td><td>${D.teams[x.id].pa.toFixed(1)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function luckRows() {
    const byWeek = {};
    D.results.forEach(g => { (byWeek[g.week] = byWeek[g.week] || []).push([String(g.home), g.hs], [String(g.away), g.as]); });
    const acc = {}; ids.forEach(id => acc[id] = { id, w: 0, l: 0, games: 0 });
    Object.values(byWeek).forEach(list => list.forEach(([id, s]) => { if (!acc[id]) return; acc[id].games++; list.forEach(([o, so]) => { if (o !== id) { if (s > so) acc[id].w++; else if (s < so) acc[id].l++; } }); }));
    return Object.values(acc).map(x => { const rate = x.w + x.l ? x.w / (x.w + x.l) : 0, deserved = rate * x.games; return Object.assign(x, { rate, deserved, luck: D.teams[x.id].w + 0.5 * (D.teams[x.id].t || 0) - deserved }); }).sort((a, b) => b.luck - a.luck);
  }

  function sosChip(v) {
    if (v == null) return '<span class="sub">–</span>';
    const lab = v >= 1.04 ? 'Easy' : v <= 0.96 ? 'Hard' : 'Even';
    return `<span class="chip ${lab.toLowerCase()}" title="Fantasy points this position scores against these defenses, vs average: ${(100 * (v - 1)).toFixed(0)}%">${lab}</span>`;
  }
  function trendTag(p) {
    const d = p.pos === 'QB' || p.pos === 'K' || p.pos === 'D/ST' ? null : (p.tgt_delta != null && Math.abs(p.tgt_delta) >= 0.05 ? p.tgt_delta : (p.snap_delta != null && Math.abs(p.snap_delta) >= 0.12 ? p.snap_delta : null));
    if (d == null) return '';
    return `<span class="tag ${d > 0 ? 'upt' : 'dnt'}" title="Share of targets or snaps, last two games vs the four before">${d > 0 ? 'Usage up' : 'Usage down'}</span>`;
  }
  function rosterTable(players, withTeam) {
    const maxW = Math.max(1, ...players.flatMap(p => p.weeks)), maxC = Math.max(1, ...players.map(p => p.ceil));
    const hasAdv = players.some(p => p.boom != null);
    return `<div class="scroll"><table><thead><tr><th class="l">Player</th>${withTeam ? '<th class="l">Fantasy team</th>' : ''}<th>Pos rank</th><th>This week</th><th class="l">Floor to ceiling</th>${hasAdv ? '<th>Boom</th><th>Bust</th><th class="l">Matchup</th><th class="l">Schedule left</th>' : ''}<th>Per game, rest of season</th><th>Total, rest of season</th><th class="l">By week</th></tr></thead><tbody>
      ${players.map(p => `<tr><td class="l"><b>${esc(p.name)}</b> <span class="sub">${p.pos}, ${esc(p.nfl)}${p.opp ? ' vs ' + esc(p.opp) : p.wk ? '' : (p.bye === D.week ? ', bye' : '')}</span>${p.slot === 'IR' ? '<span class="tag out">IR</span>' : p.status ? `<span class="tag ${/OUT|RESERVE|SUSP/.test(p.status) ? 'out' : ''}">${esc(p.status[0] + p.status.slice(1).toLowerCase().replace('_', ' '))}</span>` : ''}${trendTag(p)}</td>
        ${withTeam ? `<td class="l">${teamLink(p.team)}</td>` : ''}<td>${p.pos}${p.pos_rank}</td><td><b>${p.wk ? p.wk.toFixed(1) : '–'}</b></td>
        <td class="l">${p.wk ? `<div class="range" title="${p.floor} to ${p.ceil} points in 8 of 10 games"><i style="left:${100 * Math.max(0, p.floor) / maxC}%;width:${100 * (p.ceil - Math.max(0, p.floor)) / maxC}%"></i><b style="left:${100 * p.wk / maxC}%"></b></div><span class="sub">${p.floor} to ${p.ceil}</span>` : '<span class="sub">Not playing</span>'}</td>
        ${hasAdv ? `<td>${p.boom != null ? pct(p.boom, 0) : '–'}</td><td>${p.bust != null ? pct(p.bust, 0) : '–'}</td><td class="l">${p.wk ? sosChip(p.matchup) : '<span class="sub">–</span>'}</td><td class="l">${sosChip(p.sos)}</td>` : ''}
        <td>${p.ros_avg.toFixed(1)}</td><td>${p.ros_total.toFixed(0)}</td>
        <td class="l"><span class="mini" title="Projected points, week ${D.week} to ${D.league.last_week}">${p.weeks.map((w, k) => `<i class="${w ? '' : 'z'}" title="Week ${D.week + k}${p.opps && p.opps[k] ? ' vs ' + p.opps[k] : ' (bye)'}: ${w}" style="height:${Math.max(2, 20 * w / maxW)}px"></i>`).join('')}</span></td></tr>`).join('')}
      </tbody></table></div>${hasAdv ? '<p class="sub">Boom and bust are the chances of a top-tier week or a dud for the position. Matchup and schedule compare the defenses he faces with average.</p>' : ''}`;
  }

  function viewTeam(id) {
    if (!T[id]) return viewTeams();
    const t = D.teams[id], order = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
    const players = D.players.filter(p => String(p.team) === id).sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos) || b.ros_total - a.ros_total);
    const seedTop = t.seed_dist.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p)[0];
    const sched = [...D.results.filter(g => g.home == id || g.away == id).map(g => { const home = g.home == id, us = home ? g.hs : g.as, them = home ? g.as : g.hs; return { week: g.week, opp: home ? g.away : g.home, cell: `<b class="${us > them ? 'up' : 'down'}">${us > them ? 'W' : us < them ? 'L' : 'T'}</b> ${us.toFixed(1)} to ${them.toFixed(1)}`, line: '' }; }),
      ...D.games.filter(g => g.home == id || g.away == id).map(g => { const home = g.home == id, p = home ? g.p_home : 1 - g.p_home; return { week: g.week, opp: home ? g.away : g.home, cell: `<div class="bar"><i style="width:${100 * p}%"></i></div>`, p, line: price(p) }; })].sort((a, b) => a.week - b.week);
    app.innerHTML = `<p class="sub"><a href="#/teams">All teams</a></p>
      <h1><span class="dot" style="background:${T[id].color};width:.5em;height:.5em;margin-right:.25em"></span>${esc(T[id].name)}</h1>
      <div class="stats">
        <div><b>${rec(t)}</b><span>Record</span></div><div><b>${pct(t.playoffs, 0)}</b><span>Make the playoffs ${delta(t.playoffs, prevSnap?.teams[id]?.playoffs)}</span></div>
        <div><b>${pct(t.title)}</b><span>Win the title ${delta(t.title, prevSnap?.teams[id]?.title)}</span></div><div><b>${price(t.title)}</b><span>Title price</span></div>
        <div><b>${t.exp_wins.toFixed(1)}</b><span>Expected wins</span></div><div><b>#${seedTop.i + 1}</b><span>Most likely seed (${pct(seedTop.p, 0)})</span></div>
      </div>
      <div class="cols"><div><h2>Odds by week</h2><div class="chart">${lineChart([
        { id: 'p', name: 'Playoffs', color: T[id].color, pts: series(id, 'playoffs') }, { id: 'f', name: 'Reach final', color: 'var(--muted)', pts: series(id, 'final') },
        { id: 't', name: 'Title', color: 'var(--gold)', pts: series(id, 'title') }], { h: 300, label: T[id].name + ' odds by week' })}</div></div>
      <div><h2>Schedule</h2><div class="scroll"><table><thead><tr><th>Wk</th><th class="l">Opponent</th><th class="l">Result or win chance</th></tr></thead><tbody>
        ${sched.map(s => `<tr><td>${s.week}</td><td class="l">${teamLink(s.opp)}</td><td class="l">${s.cell}${s.p != null ? ` <span class="sub">${pct(s.p, 0)}, ${s.line}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="l">No games.</td></tr>'}
      </tbody></table></div></div></div>
      <h2>Roster outlook</h2>
      <p class="lede">Projections are scaled to how this league's starters have actually scored. Floor and ceiling cover 8 of 10 outcomes.</p>
      ${players.length ? rosterTable(players, false) : '<p class="empty">The season is over.</p>'}
      <h2>Seeding chances</h2>
      <div class="scroll"><table><thead><tr>${t.seed_dist.map((_, i) => `<th>#${i + 1}</th>`).join('')}</tr></thead><tbody><tr>${t.seed_dist.map((p, i) => `<td style="${i < D.league.playoff_teams ? '' : 'color:var(--muted)'}">${p >= 0.0005 ? pct(p, 0) : '–'}</td>`).join('')}</tr></tbody></table></div>
      <p class="sub">The top ${D.league.playoff_teams} seeds make the playoffs.</p>`;
  }

  let pPos = 'All', pQ = '', pSort = 'ros_total';
  function viewPlayers() {
    const posList = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
    app.innerHTML = `<h1>Player outlook</h1><p class="lede">Every rostered player, ranked by projected points for the rest of the fantasy season (through week ${D.league.last_week}).</p>
      <div class="row"><div class="seg" role="group" aria-label="Position">${posList.map(p => `<button data-p="${p}" aria-pressed="${p === pPos}">${p}</button>`).join('')}</div>
      <input class="pick" id="q" type="search" placeholder="Find a player" aria-label="Find a player" value="${esc(pQ)}">
      <select class="pick" id="ps" aria-label="Sort by"><option value="ros_total">Sort: rest of season total</option><option value="ros_avg">Sort: per game</option><option value="wk">Sort: this week</option><option value="ceil">Sort: ceiling</option><option value="boom">Sort: boom chance</option><option value="sos">Sort: easiest schedule</option></select></div><div id="plist"></div>`;
    $('#ps').value = pSort;
    const draw = () => {
      const list = D.players.filter(p => (pPos === 'All' || p.pos === pPos) && (!pQ || p.name.toLowerCase().includes(pQ.toLowerCase()))).sort((a, b) => (b[pSort] ?? -1) - (a[pSort] ?? -1)).slice(0, 150);
      $('#plist').innerHTML = list.length ? rosterTable(list, true) : '<p class="empty">No players match. Clear the search or pick another position.</p>';
    };
    draw();
    app.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pPos = b.dataset.p; app.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
    $('#q').addEventListener('input', e => { pQ = e.target.value; draw(); });
    $('#ps').addEventListener('change', e => { pSort = e.target.value; draw(); });
  }

  function viewAbout() {
    const M = D.model, bp = M && M.by_pos ? Object.entries(M.by_pos) : [];
    const nm = { espn: 'ESPN', sleeper: 'Sleeper', usage: 'Usage model', blend: 'Blend' };
    const report = bp.length ? `<h2>How the sources have done this season</h2>
      <p>Each source is scored against what rostered players actually did in weeks ${M.weeks[0]} to ${M.weeks[M.weeks.length - 1]}. Lower error is better. The weights are refitted on every update and pulled halfway toward a fixed starting point so one odd week cannot swing them.</p>
      <div class="scroll"><table><thead><tr><th class="l">Position</th><th>Player-weeks</th><th class="l">Average miss, points</th><th class="l">Weights now</th></tr></thead><tbody>
      ${bp.map(([pos, r]) => `<tr><td class="l">${pos}</td><td>${r.n}</td><td class="l">${r.rmse ? Object.entries(r.rmse).map(([k, v]) => `${nm[k] || k} ${v}`).join(', ') : '–'}</td><td class="l">${Object.entries(r.weights || {}).map(([k, v]) => `${nm[k] || k} ${Math.round(100 * v)}%`).join(', ')}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="sub">Player stats through NFL week ${M.stats_through_week ?? '–'}.</p>` : '';
    app.innerHTML = `<h1>How it works</h1><div class="prose">
      <p>Every update plays out the rest of the season ${D.sims.toLocaleString('en-US')} times. A team's odds are the share of those seasons in which it made the playoffs, reached the final or won the title.</p>
      <h2>What goes into a player's projection</h2><ul>
        <li><b>ESPN and Sleeper weekly projections</b>, re-scored under this league's rules. They account for the opponent, byes and expected injury returns.</li>
        <li><b>A usage model</b> built from every NFL box score this season: recent pass attempts, carries and targets count most, while yards per touch and touchdown rates are pulled toward what is normal for the position. That discounts hot streaks and rewards rising workloads.</li>
        <li><b>A reality check.</b> Everything is scaled to what this league's starters have actually scored.</li></ul>
      <h2>Ceilings, floors and busts</h2><ul>
        <li>Each player's week is drawn from a curve with a floor near zero and a long upside tail. How wide it is comes from his own game log over two seasons, so boom-or-bust players swing more than steady ones.</li>
        <li>Quarterbacks rise and fall with their own receivers and kicker; a defense does worse when the offense it faces has a good day.</li>
        <li>Players can get hurt and miss time. Questionable players sit some of the time.</li>
        <li><b>Matchup and schedule</b> ratings show how many fantasy points each defense gives up to the position, compared with average. They are shown for context; ESPN and Sleeper projections already price the matchup in, and adding it a second time made the backtest worse.</li></ul>
      ${report}
      <h2>Reading the prices</h2>
      <p>Prices are American odds. +400 means a $100 chance would pay $400 on a $100 stake; −150 means you'd need to risk $150 to win $100. "Fair" converts the chance straight to a price with no cut taken out.</p>
      <h2>Limits</h2><ul>
        <li>Future trades and waiver pickups are not predicted.</li>
        <li>Odds are set before each week's games and do not move during them.</li>
        <li>History from before the site launched was rebuilt afterwards and is approximate.</li>
        <li>Once a week's games start, points already scored are locked in and only the players still to play are simulated, so odds move through the weekend.</li></ul></div>`;
  }

  // ----- live week status (used by the Board header; no betting in this site) -----
  const now = () => (window.__NOW || Date.now());
  const kickMs = x => Date.parse(x.kick);
  const dayTime = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  function nflNow() {
    const g = D.nfl && D.nfl.games; if (!g || !g.length || D.season_over) return null;
    const t = now(), up = g.filter(x => t < kickMs(x)).sort((a, b) => kickMs(a) - kickMs(b));
    return { n: g.length, final: g.filter(x => x.state === 'post').length, playing: g.filter(x => t >= kickMs(x) && x.state !== 'post'), next: up.length ? kickMs(up[0]) : null, kicked: g.length - up.length };
  }
  function liveBar() {               // one line on how fresh the odds are and whether games are in progress
    const n = nflNow(), upd = dayTime(new Date(D.updated).getTime());
    if (!n) return '';
    const playing = n.playing.length, done = n.final === n.n;
    const tag = playing ? '<b class="tag locked">Live</b>' : done ? '<b class="tag">Week final</b>' : '<b class="tag open">Open</b>';
    const games = playing ? `${playing} NFL game${playing === 1 ? ' is' : 's are'} being played, so these odds already lock in points already scored and simulate the rest.` : done ? `All ${n.n} NFL games are final.` : `${n.final} of ${n.n} NFL games final.`;
    const next = !playing && n.next ? ` Next kickoff ${dayTime(n.next)}.` : '';
    return `<p class="livebar" role="status">${tag} <span>Odds updated ${upd}. ${games}${next}</span></p>`;
  }

  // ---------- playoff scenarios ----------
  const SC = { picks: {}, team: null };            // picks: game key -> 'h' or 'a'
  const gkey = g => g.week + ':' + g.home + ':' + g.away;
  const regGames = () => D.games.filter(g => g.week <= D.league.reg_weeks);
  function scenarioSim(picks, N = 5000) {
    const games = regGames(), n = ids.length, ix = {}; ids.forEach((id, i) => ix[id] = i);
    let s = 20261114; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    const w0 = ids.map(id => D.teams[id].w + 0.5 * (D.teams[id].t || 0)), pf0 = ids.map(id => D.teams[id].pf);
    const seed = ids.map(() => new Array(n).fill(0)), sumW = new Array(n).fill(0);
    const byW = ids.map(() => ({}));               // team -> final wins -> {n, seeds[]}
    const lev = games.map(() => ({ h: 0, a: 0, hs: ids.map(() => new Array(n).fill(0)), as: ids.map(() => new Array(n).fill(0)) }));
    const wins = new Array(n), pf = new Array(n), res = new Array(games.length), order = ids.map((_, i) => i);
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < n; i++) { wins[i] = w0[i]; pf[i] = pf0[i]; }
      games.forEach((g, gi) => {
        const pk = picks[gkey(g)], home = pk ? pk === 'h' : rnd() < g.p_home;
        let a = 25 * gauss(), b = 25 * gauss();
        if ((g.proj_home + a > g.proj_away + b) !== home) { const t = a; a = b; b = t; }
        let hs = g.proj_home + a, as = g.proj_away + b;
        if ((hs > as) !== home) { const t = hs; hs = as; as = t; }
        wins[ix[home ? g.home : g.away]]++; pf[ix[g.home]] += hs; pf[ix[g.away]] += as; res[gi] = home;
      });
      order.sort((x, y) => wins[y] - wins[x] || pf[y] - pf[x]);
      order.forEach((ti, pos) => {
        seed[ti][pos]++; sumW[ti] += wins[ti];
        const r = byW[ti][wins[ti]] || (byW[ti][wins[ti]] = { n: 0, seeds: new Array(n).fill(0) }); r.n++; r.seeds[pos]++;
        games.forEach((g, gi) => { (res[gi] ? lev[gi].hs : lev[gi].as)[ti][pos]++; });
      });
      games.forEach((g, gi) => { res[gi] ? lev[gi].h++ : lev[gi].a++; });
    }
    return { N, games, ix, seed, byW, lev, avgW: sumW.map(x => x / N) };
  }
  function viewScenarios() {
    const games = regGames(), k = D.league.playoff_teams, reg = D.league.reg_weeks;
    if (!games.length) { app.innerHTML = `<h1>Playoff picture</h1><p class="empty">The regular season is over, so the seeds are set. See the Board for title odds.</p>`; return; }
    if (!SC.team) { try { SC.team = localStorage.getItem('bettor'); } catch (e) {} if (!T[SC.team]) SC.team = ids[0]; }
    const me = SC.team, R = scenarioSim(SC.picks), mi = R.ix[me], N = R.N;
    const share = (arr, from, to) => arr.slice(from, to).reduce((a, b) => a + b, 0);
    const po = i => share(R.seed[i], 0, k) / N, top = arr => arr.indexOf(Math.max(...arr));
    const myGames = games.filter(g => String(g.home) === me || String(g.away) === me), left = myGames.length;
    const cur = D.teams[me], nPicks = Object.keys(SC.picks).length;
    const rows = Object.entries(R.byW[mi]).map(([wv, r]) => ({ w: +wv, r })).sort((a, b) => b.w - a.w);
    const recLabel = wv => `${wv}-${cur.w + cur.l + (cur.t || 0) + left - wv}`.replace(/\.5/g, '½');
    const range = sd => { const seen = sd.map((c, i) => c > 0 ? i + 1 : 0).filter(Boolean); return seen[0] === seen[seen.length - 1] ? '#' + seen[0] : `#${seen[0]} to #${seen[seen.length - 1]}`; };
    const lock = rows.filter(x => share(x.r.seeds, 0, k) / x.r.n >= 0.99).pop(), alive = rows.filter(x => share(x.r.seeds, 0, k) > 0).pop();
    const p = po(mi);
    let headline = `${esc(T[me].name)} ${nPicks ? 'would make' : 'makes'} the playoffs in ${pct(p, p > 0.995 || p < 0.005 ? 1 : 0)} of ${N.toLocaleString('en-US')} simulated finishes${nPicks ? ' with your picks' : ''}, most often as the #${top(R.seed[mi]) + 1} seed.`;
    if (left && rows.length > 1 && lock && alive) headline += lock.w - cur.w <= 0 ? ' Even losing out keeps them in almost every time.' : ` ${lock.w - cur.w} more win${lock.w - cur.w === 1 ? '' : 's'} in the last ${left} all but locks it up` + (alive.w - cur.w > 0 ? `, and they need at least ${alive.w - cur.w} to have a chance.` : '.');
    // who to root for: this week's games that do not involve the team and are not already picked
    const metric = p > 0.02 && p < 0.98 ? ['playoff chance', sd => share(sd, 0, k)] : R.seed[mi][0] / N > 0.01 && R.seed[mi][0] / N < 0.99 ? ['#1 seed chance', sd => sd[0]] : null;
    const root = !metric ? [] : games.map((g, gi) => ({ g, gi })).filter(x => x.g.week === D.week && String(x.g.home) !== me && String(x.g.away) !== me && !SC.picks[gkey(x.g)] && R.lev[x.gi].h > 50 && R.lev[x.gi].a > 50)
      .map(x => { const L = R.lev[x.gi], d = metric[1](L.hs[mi]) / L.h - metric[1](L.as[mi]) / L.a; return { win: d >= 0 ? x.g.home : x.g.away, lose: d >= 0 ? x.g.away : x.g.home, d: Math.abs(d) }; }).filter(x => x.d >= 0.004).sort((a, b) => b.d - a.d);
    const weeks = [...new Set(games.map(g => g.week))];
    const all = ids.map((id, i) => ({ id, i, po: po(i), bye: R.seed[i][0] / N, top: top(R.seed[i]), avgW: R.avgW[i] })).sort((a, b) => b.po - a.po || b.avgW - a.avgW);
    const heat = v => v < 0.005 ? '' : `background:color-mix(in srgb, var(--board) ${Math.round(8 + 72 * v)}%, transparent);${v > 0.45 ? 'color:var(--board-ink)' : ''}`;
    app.innerHTML = `<h1>Playoff picture</h1>
      <p class="lede">Pick winners for any of the remaining games and see what it does to the seeds. Games you leave alone are played out by the model. The top ${k} seeds make the playoffs and the #1 seed gets a bye.</p>
      <div class="wallet"><label for="sct">Show me</label><select class="pick" id="sct">${ids.map(t => `<option value="${t}" ${t === me ? 'selected' : ''}>${esc(T[t].name)}</option>`).join('')}</select>
        <div><b>${rec(cur)}</b><span>Record now</span></div><div><b>${pct(p, 0)}</b><span>Playoffs${nPicks ? ', with your picks' : ''}</span></div><div><b>${pct(R.seed[mi][0] / N, 0)}</b><span>#1 seed</span></div><div><b>#${top(R.seed[mi]) + 1}</b><span>Most likely seed</span></div></div>
      <p class="callout">${headline}</p>
      <h2>What each finish gets ${esc(T[me].name)}</h2>
      <div class="scroll"><table><thead><tr><th class="l">Final record</th><th>How likely</th><th>Playoffs</th><th>#1 seed</th><th>Most likely seed</th><th class="l">Possible seeds</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td class="l"><b>${recLabel(x.w)}</b> <span class="sub">${x.w - cur.w === left ? 'wins out' : x.w === cur.w ? 'loses out' : `${x.w - cur.w} of ${left}`}</span></td><td>${pct(x.r.n / N, 0)}</td><td><b>${pct(share(x.r.seeds, 0, k) / x.r.n, 0)}</b></td><td>${pct(x.r.seeds[0] / x.r.n, 0)}</td><td>#${top(x.r.seeds) + 1}</td><td class="l">${range(x.r.seeds)}</td></tr>`).join('')}
      </tbody></table></div>
      ${root.length ? `<h2>Who to root for in week ${D.week}</h2><ul class="feed">${root.slice(0, 5).map(x => `<li><b>${esc(T[x.win].name)}</b> over ${esc(T[x.lose].name)} <span class="sub">worth ${(100 * x.d).toFixed(1)} points of ${metric[0]}</span></li>`).join('')}</ul>` : ''}
      <h2>Pick the games</h2>
      <div class="row"><button class="chipbtn" data-q="win">${esc(T[me].name)} wins out</button><button class="chipbtn" data-q="lose">${esc(T[me].name)} loses out</button><button class="chipbtn" data-q="fav">Favorites win every game</button><button class="chipbtn" data-q="clear" ${nPicks ? '' : 'disabled'}>Clear ${nPicks || ''} pick${nPicks === 1 ? '' : 's'}</button></div>
      <div class="weeks">${weeks.map(wk => `<div class="wkcol"><h3>Week ${wk}</h3>${games.filter(g => g.week === wk).map(g => { const pk = SC.picks[gkey(g)], mine = String(g.home) === me || String(g.away) === me;
        const b = (id, side, pr) => `<button class="gpick ${mine && String(id) === me ? 'me' : ''}" data-g="${gkey(g)}" data-s="${side}" aria-pressed="${pk === side}"><span class="dot" style="background:${T[id].color}"></span>${esc(T[id].name)}<i>${pct(pr, 0)}</i></button>`;
        return `<div class="gm ${mine ? 'mine' : ''}">${b(g.away, 'a', 1 - g.p_home)}${b(g.home, 'h', g.p_home)}</div>`; }).join('')}</div>`).join('')}</div>
      <p class="sub">Tap a team to make it the winner; tap again to hand the game back to the model. Percentages are the model's win chances.</p>
      <h2>Seeds for everyone${nPicks ? ' with your picks' : ''}</h2>
      <div class="scroll"><table class="seedgrid"><thead><tr><th class="l">Team</th><th>Wins</th><th>Playoffs</th>${ids.map((_, i) => `<th class="${i === k - 1 ? 'cut' : ''}">#${i + 1}</th>`).join('')}</tr></thead><tbody>
        ${all.map(x => `<tr class="${x.id === me ? 'is-on' : ''}"><td class="l">${teamLink(x.id)}</td><td>${x.avgW.toFixed(1)}</td><td><b>${pct(x.po, 0)}</b></td>${R.seed[x.i].map((c, i) => `<td class="${i === k - 1 ? 'cut' : ''}" style="${heat(c / N)}">${c / N >= 0.005 ? Math.round(100 * c / N) : ''}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="sub">Each cell is the percent of simulated finishes with that seed. Ties in record are broken by total points scored, so close races also depend on how much each team scores.</p>`;
    $('#sct').addEventListener('change', e => { SC.team = e.target.value; viewScenarios(); });
    const keep = fn => { const y = scrollY; fn(); viewScenarios(); scrollTo(0, y); };
    app.querySelector('.weeks').addEventListener('click', e => { const b = e.target.closest('.gpick'); if (!b) return; keep(() => { if (SC.picks[b.dataset.g] === b.dataset.s) delete SC.picks[b.dataset.g]; else SC.picks[b.dataset.g] = b.dataset.s; }); });
    app.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => keep(() => {
      const q = b.dataset.q;
      if (q === 'clear') SC.picks = {};
      else if (q === 'fav') games.forEach(g => { SC.picks[gkey(g)] = g.p_home >= 0.5 ? 'h' : 'a'; });
      else myGames.forEach(g => { SC.picks[gkey(g)] = (String(g.home) === me) === (q === 'win') ? 'h' : 'a'; });
    })));
  }

  // ---------- league history ----------
  let AT = null, atErr = false;
  async function viewHistory() {
    if (!AT && !atErr) {
      app.innerHTML = '<h1>History</h1><p class="loading">Loading league history…</p>';
      try { AT = await fetch('data/alltime.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error(); return r.json(); }); }
      catch (e) { atErr = true; }
    }
    if (!AT) { app.innerHTML = '<h1>History</h1><p class="empty">All-time history has not been published yet. Run the "Update history" workflow in the repository\'s Actions tab, then reload.</p>'; return; }
    const champBy = {}; AT.champions.forEach(c => { (champBy[c.owner] = champBy[c.owner] || []).push(c.y); });
    const span = `${AT.seasons[0]}–${AT.seasons[AT.seasons.length - 1]}`;
    app.innerHTML = `<h1>League history</h1>
      <p class="lede">${esc(D.league.name)}, ${span}: ${AT.seasons.length} seasons on the books.</p>
      <h2>Champions</h2>
      <div class="scroll"><table><thead><tr><th>Year</th><th class="l">Champion</th><th class="l">Owner</th><th>Seed</th><th>Record</th></tr></thead><tbody>
      ${AT.champions.slice().reverse().map(c => `<tr><td><b>${c.y}</b></td><td class="l">${esc(c.team)}</td><td class="l">${esc(c.owner)}</td><td>#${c.seed ?? '–'}</td><td>${c.w}-${c.l}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Top 10 single-week scores</h2>
      <div class="scroll"><table><thead><tr><th class="l">Team</th><th>Year</th><th>Week</th><th>Points</th></tr></thead><tbody>
      ${AT.top_weeks.map((r, i) => `<tr><td class="l">${i + 1}. ${esc(r.team)}</td><td>${r.y}</td><td>${r.wk}</td><td><b>${r.p.toFixed(2)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <h2>Top 10 single-season point totals</h2>
      <div class="scroll"><table><thead><tr><th class="l">Team</th><th class="l">Owner</th><th>Year</th><th>Points for</th></tr></thead><tbody>
      ${AT.top_seasons.map((r, i) => `<tr><td class="l">${i + 1}. ${esc(r.team)}</td><td class="l">${esc(r.owner || '–')}</td><td>${r.y}</td><td><b>${r.pf.toFixed(1)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <h2>All-time records</h2>
      <p class="lede">By owner, across every team and season they have run, best winning percentage first.</p>
      <div class="scroll"><table><thead><tr><th class="l">Owner</th><th>Record</th><th>Win %</th><th>Seasons</th><th>Titles</th><th>Points for</th></tr></thead><tbody>
      ${AT.records.map(r => { const gp = r.w + r.l + r.t, wp = gp ? (r.w + 0.5 * r.t) / gp : 0; return `<tr><td class="l">${esc(r.owner)}${champBy[r.owner] ? ` <span class="sub">${champBy[r.owner].length}x champ</span>` : ''}</td><td>${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td><td><b>${(100 * wp).toFixed(1)}%</b></td><td>${r.seasons}</td><td>${r.titles || '–'}</td><td>${r.pf.toFixed(0)}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="sub">Records are aggregated by the ESPN account that owned each team each season; a renamed or re-founded team under the same owner still counts.</p>`;
  }

  // ---------- shell ----------
  $('#league-name').textContent = D.league.name + ' Odds';
  document.title = D.league.name + ' Odds Board';
  const stamp = () => { $('#stamp').textContent = `Updated ${new Date(D.updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. ${D.sims.toLocaleString('en-US')} simulated seasons. Sources: ${D.sources.join(', ')}.`; };
  stamp();
  async function refresh() {         // pick up a newer odds file without a reload; true when the data changed
    try { const j = await fetch('data/latest.json?t=' + Date.now()).then(r => r.ok ? r.json() : null); if (j && j.updated !== D.updated) { D = j; stamp(); return true; } } catch (e) {}
    return false;
  }
  const lockSig = () => { const n = nflNow(); return n ? n.kicked + ':' + n.playing.length : ''; };
  let lastSig = lockSig();
  async function tick() {
    if (document.hidden) return;
    const changed = await refresh(), sig = lockSig();
    if (!changed && sig === lastSig) return;
    lastSig = sig;
    const sec = (location.hash || '#/').split('/')[1] || '';
    if (!['', 'week'].includes(sec) || document.querySelector('dialog[open]')) return;
    const y = scrollY; await route(); scrollTo(0, y);
  }
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', tick);
  if (D.sample) { const b = $('#banner'); b.hidden = false; b.textContent = 'Sample data: team names and early results are real, but players and current odds are placeholders until the first live update runs.'; }
  function route() {
    const [, sec, arg] = (location.hash || '#/').split('/');
    const name = sec === 'team' ? 'teams' : (sec || 'board');
    document.querySelectorAll('nav a').forEach(a => a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    return ({ week: viewWeek, teams: viewTeams, team: () => viewTeam(arg), players: viewPlayers, about: viewAbout, history: viewHistory, scenarios: viewScenarios }[sec] || viewBoard)();
  }
  addEventListener('hashchange', () => { route(); scrollTo(0, 0); });
  route();
})();
