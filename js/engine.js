// Pure rules engine for The Crucible. No DOM, no storage, no network.
// ctx = { course, format, players, overrides }, players = { [id]: { id, name, index, tieBreak } }
// A "getScores(contestId)" function returns { [courseHole]: number[] } for that contest.

export const roundHalfUp = (x) => Math.floor(x + 0.5);
export const par9 = (course) => course.par.reduce((a, b) => a + b, 0);

// ---------- Handicaps ----------

// WHS 9-hole course handicap: (Index / 2) x (Slope / 113) + (9-hole rating - 9-hole par), rounded.
export function courseHcp9(index, teeName, course) {
  const t = course.tees[teeName];
  if (!t) throw new Error('Unknown tee: ' + teeName);
  return roundHalfUp((index / 2) * (t.slope / 113) + (t.rating - par9(course)));
}

// Strokes received on a hole (stroke index si, 1 = hardest) when a player gets n strokes over nine holes.
// More than 9 wraps around; a plus handicap (negative n) gives strokes back on the easiest holes.
export function strokesOnHole(n, si) {
  if (n >= 0) {
    const base = Math.floor(n / 9), extra = n % 9;
    return base + (si <= extra ? 1 : 0);
  }
  const k = -n, base = Math.floor(k / 9), extra = k % 9;
  return 0 - (base + (si > 9 - extra ? 1 : 0)) || 0;
}

// Holes (from a list) on which n strokes fall: [{ hole, n }]
export function strokeHoles(n, holes, course) {
  return holes
    .map((h) => ({ hole: h, n: strokesOnHole(n, course.si[h - 1]) }))
    .filter((x) => x.n !== 0);
}

const nameOf = (ctx, id) => (ctx.players[id] ? ctx.players[id].name : '?');
const teamName = (ctx, ids) => ids.map((id) => nameOf(ctx, id)).join(' & ');

// ---------- Generic match play ----------

// nets(k) -> { a, b } (lower is better) or null if hole k has no complete score yet.
function runMatchPlay(n, nets) {
  let up = 0, played = 0, decided = false, stop = false;
  const rows = [];
  for (let k = 0; k < n; k++) {
    const row = { idx: k, state: 'open', win: 0 };
    if (decided) { row.state = 'over'; rows.push(row); continue; }
    const sd = stop ? null : nets(k);
    if (!sd) { stop = true; rows.push(row); continue; }
    row.win = sd.a < sd.b ? 1 : (sd.b < sd.a ? 2 : 0);
    row.state = 'played';
    up += row.win === 1 ? 1 : (row.win === 2 ? -1 : 0);
    played++;
    if (Math.abs(up) > n - (k + 1)) decided = true;
    rows.push(row);
  }
  const done = decided || played === n;
  return { rows, up, played, decided, done, lead: up > 0 ? 1 : (up < 0 ? 2 : 0), remaining: n - played };
}

function matchStatus(mp, n, names, halvedText) {
  const a = Math.abs(mp.up);
  if (mp.played === 0) return 'Not started';
  if (!mp.done) return a === 0 ? 'All square thru ' + mp.played : names[mp.lead - 1] + ' ' + a + ' UP thru ' + mp.played;
  if (a === 0) return halvedText;
  return names[mp.lead - 1] + ' win ' + (mp.remaining > 0 ? a + '&' + mp.remaining : a + ' UP');
}

const complete = (arr, len) => Array.isArray(arr) && arr.length === len && arr.every((v) => Number.isFinite(v));

// ---------- Pool play (team match play) ----------

export function poolUnits(match, ctx) {
  const { course, format, players } = ctx;
  const g = format.games[match.game];
  const ch = (id) => courseHcp9(players[id].index, g.tee, course);
  if (match.game === 'bestball') {
    const ids = [...match.t1, ...match.t2];
    const allow = ids.map((id) => roundHalfUp(g.pct * ch(id)));
    const lo = Math.min(...allow);
    return ids.map((id, k) => ({
      team: k < 2 ? 1 : 2, ids: [id], label: nameOf(ctx, id), hcp: allow[k], strokes: allow[k] - lo
    }));
  }
  const teamHcp = (t) => {
    const a = ch(t[0]), b = ch(t[1]);
    return match.game === 'scramble'
      ? roundHalfUp(g.lowPct * Math.min(a, b) + g.highPct * Math.max(a, b))
      : roundHalfUp(g.pct * (a + b));
  };
  const h1 = teamHcp(match.t1), h2 = teamHcp(match.t2), d = Math.abs(h1 - h2);
  return [
    { team: 1, ids: match.t1, label: teamName(ctx, match.t1), hcp: h1, strokes: h1 > h2 ? d : 0 },
    { team: 2, ids: match.t2, label: teamName(ctx, match.t2), hcp: h2, strokes: h2 > h1 ? d : 0 }
  ];
}

export function evalPoolMatch(match, scores, ctx) {
  const { course, format } = ctx;
  scores = scores || {};
  const units = poolUnits(match, ctx);
  const bb = match.game === 'bestball';
  const len = units.length;
  const n = match.holes.length;
  const strokesAt = (h) => units.map((u) => strokesOnHole(u.strokes, course.si[h - 1]));
  const mp = runMatchPlay(n, (k) => {
    const h = match.holes[k], s = scores[h];
    if (!complete(s, len)) return null;
    const st = strokesAt(h), net = s.map((v, j) => v - st[j]);
    return bb ? { a: Math.min(net[0], net[1]), b: Math.min(net[2], net[3]) }
              : { a: net[0], b: net[1] };
  });
  const names = [teamName(ctx, match.t1), teamName(ctx, match.t2)];
  const rows = mp.rows.map((r, k) => {
    const h = match.holes[k];
    return Object.assign(r, {
      hole: h, th: match.tholes ? match.tholes[k] : h, par: course.par[h - 1], si: course.si[h - 1],
      scores: scores[h] || null, strokes: strokesAt(h), entered: complete(scores[h], len)
    });
  });
  const m = format.margin;
  const margin = mp.done && mp.lead !== 0 ? (mp.remaining > 0 ? m.closeout : (Math.abs(mp.up) === 1 ? m.up1 : m.up2)) : 0;
  return {
    kind: 'pool', id: match.id, units, rows, names, up: mp.up, played: mp.played, done: mp.done, lead: mp.lead,
    result: mp.done ? (mp.lead === 0 ? 'half' : (mp.lead === 1 ? 't1' : 't2')) : null,
    margin, status: matchStatus(mp, n, names, 'Match halved')
  };
}

// One player's six pool results: 'W' | 'H' | 'L' | 'live' | 'up' (to play)
export function poolResultsFor(pid, matches, ctx, getScores) {
  return matches
    .filter((m) => m.stage === 'pool' && (m.t1.includes(pid) || m.t2.includes(pid)))
    .sort((a, b) => a.n - b.n)
    .map((m) => {
      const e = evalPoolMatch(m, getScores(m.id), ctx);
      const side = m.t1.includes(pid) ? 1 : 2;
      let res = 'up';
      if (e.done) res = e.lead === 0 ? 'H' : (e.lead === side ? 'W' : 'L');
      else if (e.played > 0) res = 'live';
      return { match: m, e, side, res };
    });
}

export function poolStandings(ctx, matches, getScores) {
  const mode = ctx.format.margin.mode;
  const rows = Object.keys(ctx.players).map((pid) => {
    const results = poolResultsFor(pid, matches, ctx, getScores);
    let pts = 0, won = 0, lost = 0, thru, live = '';
    results.forEach((r) => {
      if (r.res === 'W') { pts += ctx.format.points.win; won += r.e.margin; }
      else if (r.res === 'H') { pts += ctx.format.points.tie; }
      else if (r.res === 'L') { lost += r.e.margin; }
      else if (r.res === 'live') {
        const e = r.e, a = Math.abs(e.up);
        live = 'Live: ' + (a === 0 ? 'All square' : a + (e.lead === r.side ? ' UP' : ' DOWN')) + ' thru ' + e.played;
      }
    });
    thru = results.filter((r) => r.res === 'W' || r.res === 'H' || r.res === 'L').length;
    const margin = mode === 'net' ? won - lost : won;
    const p = ctx.players[pid];
    return { id: pid, name: p.name, index: p.index, tieBreak: p.tieBreak || 0, pts, margin, thru, live, results };
  });
  rows.sort((a, b) =>
    (b.pts - a.pts) || (b.margin - a.margin) || (b.tieBreak - a.tieBreak) ||
    (a.index - b.index) || a.name.localeCompare(b.name));
  const same = (a, b) => a.pts === b.pts && a.margin === b.margin && a.tieBreak === b.tieBreak;
  rows.forEach((r, i) => {
    let k = i;
    while (k > 0 && same(rows[k - 1], r)) k--;
    r.rank = k + 1;
    r.tied = (i > 0 && same(rows[i - 1], r)) || (i < rows.length - 1 && same(rows[i + 1], r));
  });
  return rows;
}

export function poolComplete(matches, ctx, getScores) {
  const pool = matches.filter((m) => m.stage === 'pool');
  return pool.length > 0 && pool.every((m) => evalPoolMatch(m, getScores(m.id), ctx).done);
}

// ---------- Semis: modified stableford ----------

export function stablefordPoints(net, par, table) {
  const d = Math.max(-3, Math.min(3, net - par));
  return table[String(d)];
}

export function evalSemis(contest, scores, ctx) {
  const { course, format } = ctx;
  scores = scores || {};
  const f = format.semis;
  const ids = contest.players;
  const allow = ids.map((id) => roundHalfUp(f.pct * courseHcp9(ctx.players[id].index, f.tee, course)));
  const holes = contest.holes;
  const rows = holes.map((h, k) => {
    const s = scores[h], ok = complete(s, ids.length);
    const st = allow.map((a) => strokesOnHole(a, course.si[h - 1]));
    const net = ok ? s.map((v, j) => v - st[j]) : null;
    const pts = ok ? net.map((v) => stablefordPoints(v, course.par[h - 1], f.table)) : null;
    return {
      idx: k, hole: h, th: contest.tholes ? contest.tholes[k] : h, par: course.par[h - 1], si: course.si[h - 1],
      scores: s || null, strokes: st, net, pts, entered: ok
    };
  });
  // a hole only counts once every earlier hole is complete
  let thru = 0;
  while (thru < rows.length && rows[thru].entered) thru++;
  const counted = rows.slice(0, thru);
  const sum = (arr, j) => arr.reduce((t, r) => t + r.pts[j], 0);
  const players = ids.map((id, j) => ({
    id, name: nameOf(ctx, id), allowance: allow[j],
    total: sum(counted, j),
    back3: sum(counted.slice(-3), j),
    back6: sum(counted.slice(-6), j),
    birdies: counted.filter((r) => r.net[j] - r.par <= -1).length,
    tieBreak: ctx.players[id].tieBreak || 0, col: j
  }));
  const order = players.slice().sort((a, b) =>
    (b.total - a.total) || (b.back3 - a.back3) || (b.back6 - a.back6) ||
    (b.birdies - a.birdies) || (b.tieBreak - a.tieBreak) || (a.col - b.col));
  const same = (a, b) => a.total === b.total && a.back3 === b.back3 && a.back6 === b.back6 &&
    a.birdies === b.birdies && a.tieBreak === b.tieBreak;
  const adv = f.advance[contest.letter] || [];
  order.forEach((p, i) => {
    p.pos = i + 1;
    p.tied = (i > 0 && same(order[i - 1], p)) || (i < order.length - 1 && same(order[i + 1], p));
    p.goes = adv[i] || 'out';
  });
  const done = thru === rows.length;
  return { kind: 'semis', id: contest.id, rows, players, order, thru, done, total: rows.length };
}

// ---------- Finals: individual match play ----------

export function evalFinal(contest, scores, ctx) {
  const { course, format } = ctx;
  scores = scores || {};
  const f = format.finals;
  const [a, b] = contest.players;
  const allow = contest.players.map((id) => roundHalfUp(f.pct * courseHcp9(ctx.players[id].index, f.tee, course)));
  const diff = Math.abs(allow[0] - allow[1]);
  const strokes = [allow[0] > allow[1] ? diff : 0, allow[1] > allow[0] ? diff : 0];
  const route = contest.routing;
  const stAt = (h) => strokes.map((n) => strokesOnHole(n, course.si[h - 1]));
  const mp = runMatchPlay(route.length, (k) => {
    const h = route[k], s = scores[h];
    if (!complete(s, 2)) return null;
    const st = stAt(h);
    return { a: s[0] - st[0], b: s[1] - st[1] };
  });
  const names = [nameOf(ctx, a), nameOf(ctx, b)];
  const rows = mp.rows.map((r, k) => {
    const h = route[k];
    return Object.assign(r, {
      hole: h, th: contest.tholes ? contest.tholes[k] : k + 1, par: course.par[h - 1], si: course.si[h - 1],
      scores: scores[h] || null, strokes: stAt(h), entered: complete(scores[h], 2)
    });
  });
  const override = ctx.overrides && ctx.overrides.finalWinner ? ctx.overrides.finalWinner[contest.id] : null;
  let winner = null;
  if (mp.done) winner = mp.lead === 0 ? (override || null) : contest.players[mp.lead - 1];
  const needsPlayoff = mp.done && mp.lead === 0 && !override;
  const units = [
    { team: 1, ids: [a], label: names[0], hcp: allow[0], strokes: strokes[0] },
    { team: 2, ids: [b], label: names[1], hcp: allow[1], strokes: strokes[1] }
  ];
  const status = needsPlayoff ? 'All square after 9 · playoff needed'
    : (mp.done && mp.lead === 0 && override ? nameOf(ctx, override) + ' win playoff' : matchStatus(mp, route.length, names, ''));
  return {
    kind: 'final', id: contest.id, units, rows, names, up: mp.up, played: mp.played, done: mp.done, lead: mp.lead,
    winner, needsPlayoff, status
  };
}

// ---------- Draw generation ----------

// Player ids ordered by handicap (lowest first); ties broken by name.
export function rankPlayers(players) {
  return Object.values(players)
    .sort((x, y) => (x.index - y.index) || x.name.localeCompare(y.name))
    .map((p) => p.id);
}

export function generatePoolMatches(rankIds, format) {
  if (rankIds.length !== 8) throw new Error('The pool draw needs exactly 8 players (found ' + rankIds.length + ').');
  const per = format.pool.holesPerMatch;
  const matches = [];
  const letters = ['A', 'B'];
  ['front', 'back'].forEach((nine, ni) => {
    format.pool.groups[nine].forEach((grp, gi) => {
      const g = grp.slice().sort((x, y) => x - y).map((r) => rankIds[r - 1]);
      format.pool.pairingOrder.forEach((pr, mi) => {
        const n = ni * 3 + mi + 1;
        const t1 = pr.map((p) => g[p]);
        const t2 = [0, 1, 2, 3].filter((p) => !pr.includes(p)).map((p) => g[p]);
        const start = mi * per;
        matches.push({
          id: 'p' + n + letters[gi], stage: 'pool', n, nine, letter: letters[gi], group: nine + letters[gi],
          game: format.pool.games[n - 1],
          holes: Array.from({ length: per }, (_, i) => start + i + 1),
          tholes: Array.from({ length: per }, (_, i) => (n - 1) * per + i + 1),
          t1, t2, foursome: g
        });
      });
    });
  });
  return matches.sort((x, y) => (x.n - y.n) || x.letter.localeCompare(y.letter));
}

export function generateSemis(standings, format) {
  const ids = standings.map((r) => r.id);
  const k = format.semis.upperSize;
  const hs = Array.from({ length: 9 }, (_, i) => i + 1);
  const th = (off) => hs.map((h) => off + h);
  return [
    { id: 'sU', stage: 'semis', letter: 'U', title: 'Upper half', players: ids.slice(0, k), holes: hs, tholes: th(18) },
    { id: 'sL', stage: 'semis', letter: 'L', title: 'Lower half', players: ids.slice(k), holes: hs, tholes: th(18) }
  ];
}

export function generateFinals(semiEvals, format) {
  const champ = [], third = [];
  ['U', 'L'].forEach((letter) => {
    const ev = semiEvals.find((e) => e.id === 's' + letter);
    ev.order.forEach((p) => {
      if (p.goes === 'champ') champ.push(p.id);
      if (p.goes === 'third') third.push(p.id);
    });
  });
  if (champ.length !== 2 || third.length !== 2) throw new Error('Semis results do not produce two finalists and two 3rd-place players.');
  const route = format.finals.routing;
  const tholes = route.map((_, i) => 28 + i);
  return [
    { id: 'fC', stage: 'finals', kind: 'champ', title: 'Championship', players: champ, routing: route, tholes },
    { id: 'f3', stage: 'finals', kind: 'third', title: '3rd place', players: third, routing: route, tholes }
  ];
}

// Each foursome's three matches must use three different pairings.
export function validatePool(matches) {
  const problems = [];
  const byGroup = {};
  matches.filter((m) => m.stage === 'pool').forEach((m) => { (byGroup[m.group] = byGroup[m.group] || []).push(m); });
  Object.keys(byGroup).forEach((g) => {
    const seen = new Set();
    byGroup[g].forEach((m) => {
      const key = [m.t1.slice().sort().join('+'), m.t2.slice().sort().join('+')].sort().join('|');
      if (seen.has(key)) problems.push('Group ' + g + ': the same pairing is used twice (match ' + m.n + ').');
      seen.add(key);
    });
  });
  return problems;
}

// ---------- Where should a player land? ----------

export function currentContestFor(pid, matches, stage, ctx, getScores) {
  const mine = matches.filter((m) => (m.t1 && (m.t1.includes(pid) || m.t2.includes(pid))) || (m.players && m.players.includes(pid)));
  const pool = mine.filter((m) => m.stage === 'pool').sort((a, b) => a.n - b.n);
  const semis = mine.filter((m) => m.stage === 'semis');
  const finals = mine.filter((m) => m.stage === 'finals');
  if (stage === 'finals' && finals.length) return finals[0].id;
  if ((stage === 'semis' || stage === 'finals') && semis.length) return semis[0].id;
  for (const m of pool) { if (!evalPoolMatch(m, getScores(m.id), ctx).done) return m.id; }
  return pool.length ? pool[pool.length - 1].id : null;
}
