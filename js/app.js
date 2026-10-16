import { init, store, subscribe, ctx, getScores, scoreMeta, enterScore, mutate, players, contest, evalContest, standings,
  addPlayer, loadDemoPlayers, drawPool, startSemis, startFinals, setStage, setMe } from './store.js';
import * as E from './engine.js';
import { rulesSections } from './rules.js';
import { EVENT_ID } from '../config.js';

const ui = { tab: 'match', viewId: null, entry: null, adminOk: false, msg: '', pinErr: false, testMsg: null };
const $app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const GAME = { scramble: 'Scramble', altshot: 'Alt-shot', bestball: 'Best ball' };
const pname = (id) => (store.event.players[id] ? store.event.players[id].name : '?');

// ---------- helpers ----------
function myContestId() {
  const ev = store.event;
  if (!store.me || !ev.matches.length) return null;
  return E.currentContestFor(store.me, ev.matches, ev.stage, ctx(), getScores);
}
function contestTitle(c) {
  if (c.stage === 'pool') return 'Match ' + c.n + ' · ' + GAME[c.game];
  if (c.stage === 'semis') return 'Semifinal · ' + c.title;
  return 'Final · ' + c.title;
}
function contestSub(c) {
  if (c.stage === 'pool') return 'Group ' + c.letter + ' · ' + (c.nine === 'front' ? 'Front' : 'Back') + ' nine · holes ' + c.tholes[0] + '–' + c.tholes[c.tholes.length - 1];
  if (c.stage === 'semis') return 'Holes 19–27 · ' + store.event.format.semis.tee + ' tees';
  return 'Holes 28–36 · ' + store.event.format.finals.tee + ' tees';
}
function strokeText(u, c, holeList) {
  const course = store.event.course;
  if (!u.strokes) return 'No strokes';
  const here = E.strokeHoles(u.strokes, holeList, course);
  const all = E.strokeHoles(u.strokes, [1, 2, 3, 4, 5, 6, 7, 8, 9], course).sort((a, b) => a.hole - b.hole);
  return '<b>' + u.strokes + ' stroke' + (u.strokes === 1 ? '' : 's') + '</b> · over the nine: hole' + (all.length > 1 ? 's ' : ' ') + all.map((x) => x.hole + (x.n > 1 ? '×' + x.n : '')).join(', ') +
    (c ? ' · <b>this match:</b> ' + (here.length ? here.map((x) => 'hole ' + x.hole).join(', ') : 'none') : '');
}

// ---------- render ----------
function render() {
  const ae = document.activeElement;
  if (ae && /INPUT|SELECT/.test(ae.tagName) && ui.tab === 'admin' && !ui.entry) return;
  if (!store.ready || !store.event) { $app.innerHTML = '<main><p class="muted">Loading…</p></main>'; return; }
  const ev = store.event;
  const st = store.status.state;
  const stLabel = { local: 'Demo', live: 'Live', syncing: 'Saving…', connecting: 'Connecting…', offline: 'Offline · will sync', error: 'Sync error' }[st] || st;
  const me = store.me && ev.players[store.me];
  let body = '';
  if (ui.tab === 'match') body = viewMatch();
  else if (ui.tab === 'board') body = viewBoard();
  else if (ui.tab === 'all') body = viewAll();
  else if (ui.tab === 'rules') body = viewRules();
  else body = viewAdmin();
  const tabs = [['match', 'Match'], ['board', 'Board'], ['all', 'All'], ['rules', 'Rules'], ['admin', 'Admin']];
  $app.innerHTML =
    '<header class="top"><h1>The Crucible<span class="sub">' + esc(ev.name === 'The Crucible' ? 'Inness · ' + ev.year : ev.name) + '</span></h1>' +
    '<div class="sync ' + st + '"><i></i>' + esc(stLabel) + '</div>' +
    '<button class="chip" data-act="login">' + (me ? esc(me.name) : 'Pick name') + '</button></header>' +
    (store.db.fallbackReason ? '<div class="banner">Could not reach Firebase, running in demo mode.</div>' : '') +
    '<main>' + body + '</main>' +
    '<nav class="tabs">' + tabs.map((t) => '<button data-act="tab" data-v="' + t[0] + '" class="' + (ui.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</nav>' +
    (ui.login ? loginSheet() : '') + (ui.entry ? entrySheet() : '');
}

// ---------- login ----------
function loginSheet() {
  const ps = players().sort((a, b) => a.name.localeCompare(b.name));
  return '<div class="sheet" data-act="closeLogin"><div class="login"><h2>Who are you?</h2><p class="muted small">Pick your name and the app always opens your current match.</p>' +
    (ps.length ? ps.map((p) => '<button class="pl" data-act="setMe" data-id="' + p.id + '">' + esc(p.name) + '</button>').join('') : '<p>No players yet. Add them in the Admin tab.</p>') +
    '<button class="btn ghost block" data-act="setMe" data-id="">Just watching</button></div></div>';
}

// ---------- match view ----------
function viewMatch() {
  const ev = store.event;
  if (!ev.matches.length) {
    return '<div class="card"><h2>Welcome</h2><p class="muted">' + (Object.keys(ev.players).length
      ? 'The draw has not been made yet. The admin does that in the Admin tab.'
      : 'Nothing is set up yet. Open the Admin tab (PIN 1234 until you change it) to add players and make the draw.') + '</p></div>';
  }
  const id = ui.viewId || myContestId();
  const c = id && contest(id);
  if (!c) return '<div class="card"><h2>Pick your name</h2><p class="muted">Tap the name button at the top to see your match, or browse every match in the All tab.</p><button class="btn" data-act="login">Pick my name</button></div>';
  const mine = !ui.viewId;
  return (ui.viewId ? '<button class="btn ghost sm" data-act="clearView">← Back to my match</button><div style="height:10px"></div>' : '') + contestCard(c, mine);
}

function contestCard(c, mine) {
  const e = evalContest(c);
  const ev = store.event;
  let h = '<div class="hero"><div class="eyebrow">' + esc(contestSub(c)) + '</div><h2>' + esc(contestTitle(c)) + '</h2>';
  if (e.kind === 'semis') {
    h += '<div class="status">' + (e.done ? 'Final' : 'Through ' + e.thru + ' of ' + e.total) + '</div>';
  } else {
    h += '<div class="status ' + (!e.done && e.played ? 'live' : '') + '" style="color:#fff">' + esc(e.status) + '</div>';
    h += '<div style="margin-top:8px;font-size:15px">' + e.names.map((n, i) => '<div>' + (i ? 'vs ' : '') + '<b>' + esc(n) + '</b></div>').join('') + '</div>';
  }
  h += '</div>';
  if (e.kind === 'semis') return h + semisBody(c, e);
  // strokes
  h += '<div class="card"><div class="eyebrow">Strokes · ' + esc(c.stage === 'pool' ? ev.format.games[c.game].tee : (c.stage === 'semis' ? ev.format.semis.tee : ev.format.finals.tee)) + ' tees</div>';
  const holeList = c.holes || c.routing;
  e.units.forEach((u) => {
    h += '<div class="strokebox"><div>' + esc(u.label) + ' <span class="muted small">(handicap ' + u.hcp + ')</span></div><div class="small">' + strokeText(u, c, holeList) + '</div></div>';
  });
  h += '</div>';
  // holes table
  const cols = e.units.length;
  const short = (u) => (cols > 2 ? esc(u.label) : (u.team === 1 ? 'Team 1' : 'Team 2'));
  h += '<div class="card"><table class="holes"><tr><th>Hole</th><th>Par</th><th>SI</th>' + e.units.map((u) => '<th>' + (c.stage === 'finals' || cols > 2 ? esc(u.label.split(' ')[0]) : esc(u.label.split(' & ').map((x) => x.slice(0, 5)).join('/'))) + '</th>').join('') + '<th>Res</th></tr>';
  e.rows.forEach((r) => {
    const res = r.state === 'played' ? (r.win === 0 ? '–' : (r.win === 1 ? '◀' : '▶')) : '';
    h += '<tr class="hole ' + (r.state === 'over' ? 'over' : '') + '" data-act="enter" data-cid="' + c.id + '" data-hole="' + r.hole + '">' +
      '<td><span class="hn">' + r.th + '</span><div class="small muted mono">c' + r.hole + '</div></td><td>' + r.par + '</td><td>' + r.si + '</td>' +
      e.units.map((u, j) => '<td class="sc">' + (r.scores ? r.scores[j] : '·') + (r.strokes[j] > 0 ? '<span class="dot">' + '•'.repeat(Math.min(r.strokes[j], 3)) + '</span>' : '') + '</td>').join('') +
      '<td class="mono">' + res + '</td></tr>';
  });
  h += '</table><p class="small muted" style="margin:8px 0 0">Tap a hole to enter or fix a score. <span class="dot">•</span> = stroke received. ◀ Team 1 / first player wins hole.</p>';
  const last = e.rows.filter((r) => r.entered).map((r) => scoreMeta(c.id, r.hole)).filter(Boolean).sort((a, b) => b.at - a.at)[0];
  if (last) h += '<p class="small muted" style="margin:4px 0 0">Last score by ' + esc(last.by) + ' at ' + fmtTime(last.at) + '</p>';
  h += '</div>';
  if (e.kind === 'final' && e.needsPlayoff) h += '<div class="card"><b>Tied after nine.</b> Play it off, then the admin records the playoff winner in the Admin tab.</div>';
  return h;
}

function semisBody(c, e) {
  let h = '<div class="card"><div class="eyebrow">Standings · modified stableford</div><table class="lb">';
  e.order.forEach((p) => {
    h += '<tr><td class="rk">' + (p.tied && e.done ? 'T' : '') + p.pos + '</td><td><b>' + esc(p.name) + '</b><div class="small muted">allowance ' + p.allowance + (p.goes !== 'out' ? ' · ' + (p.goes === 'champ' ? 'to Championship' : 'to 3rd-place match') : '') + '</div></td><td class="pts">' + p.total + '</td></tr>';
  });
  h += '</table></div><div class="card"><div class="eyebrow">Strokes · ' + esc(store.event.format.semis.tee) + ' tees</div>';
  e.players.forEach((p) => {
    h += '<div class="strokebox"><div>' + esc(p.name) + '</div><div class="small">' + strokeText({ strokes: p.allowance }, null, []) + '</div></div>';
  });
  h += '</div><div class="card"><table class="holes"><tr><th>Hole</th><th>Par</th><th>SI</th>' + e.players.map((p) => '<th>' + esc(p.name.slice(0, 6)) + '</th>').join('') + '</tr>';
  e.rows.forEach((r) => {
    h += '<tr class="hole" data-act="enter" data-cid="' + c.id + '" data-hole="' + r.hole + '"><td><span class="hn">' + r.th + '</span><div class="small muted mono">c' + r.hole + '</div></td><td>' + r.par + '</td><td>' + r.si + '</td>' +
      e.players.map((p, j) => '<td class="sc">' + (r.scores ? r.scores[j] : '·') + (r.strokes[j] > 0 ? '<span class="dot">' + '•'.repeat(Math.min(r.strokes[j], 3)) + '</span>' : '') + (r.pts ? '<div class="small muted">' + r.pts[j] + ' pt</div>' : '') + '</td>').join('') + '</tr>';
  });
  return h + '</table><p class="small muted" style="margin:8px 0 0">Tap a hole to enter or fix scores. Points shown are net stableford.</p></div>';
}

// ---------- score entry ----------
function entrySheet() {
  const { cid, hole, vals } = ui.entry;
  const c = contest(cid), e = evalContest(c);
  const row = e.rows.find((r) => r.hole === hole);
  const labels = e.kind === 'semis' ? e.players.map((p) => p.name) : e.units.map((u) => u.label);
  const par = row.par;
  return '<div class="sheet" data-act="closeEntry"><div><div class="eyebrow">' + esc(contestTitle(c)) + '</div>' +
    '<h2>Hole ' + row.th + ' <span class="muted small mono">course hole ' + hole + ' · par ' + par + ' · SI ' + row.si + '</span></h2>' +
    labels.map((l, j) => '<div class="stepper"><div class="nm">' + esc(l) + (row.strokes[j] > 0 ? ' <span class="dot">' + '•'.repeat(Math.min(row.strokes[j], 3)) + '</span>' : '') + '</div>' +
      '<button data-act="step" data-j="' + j + '" data-d="-1">−</button><div class="v">' + vals[j] + '</div><button data-act="step" data-j="' + j + '" data-d="1">+</button></div>').join('') +
    '<div class="row" style="margin-top:12px"><button class="btn ghost sp" data-act="closeEntry">Cancel</button><button class="btn sp" data-act="saveEntry">Save</button></div></div></div>';
}
function openEntry(cid, hole) {
  const c = contest(cid), e = evalContest(c);
  const row = e.rows.find((r) => r.hole === hole);
  const n = e.kind === 'semis' ? e.players.length : e.units.length;
  ui.entry = { cid, hole, vals: row.scores ? row.scores.slice() : Array(n).fill(row.par) };
  render();
}

// ---------- leaderboard ----------
function viewBoard() {
  const ev = store.event;
  if (!ev.matches.length) return '<div class="card"><p class="muted">The leaderboard appears once the draw is made.</p></div>';
  let h = '';
  const x = ctx();
  if (ev.stage === 'finals') {
    ev.matches.filter((m) => m.stage === 'finals').forEach((m) => {
      const e = evalContest(m);
      h += '<div class="card" data-act="view" data-id="' + m.id + '" style="cursor:pointer"><div class="eyebrow">' + esc(m.title) + '</div><h3>' + esc(e.names[0]) + ' vs ' + esc(e.names[1]) + '</h3><div class="status">' + esc(e.status) + '</div>' +
        (e.winner ? '<div class="ok">' + (m.kind === 'champ' ? '🏆 Champion: ' : 'Third place: ') + esc(pname(e.winner)) + '</div>' : '') + '</div>';
    });
  }
  if (ev.stage === 'semis' || ev.stage === 'finals') {
    ev.matches.filter((m) => m.stage === 'semis').forEach((m) => {
      const e = evalContest(m);
      h += '<div class="card"><div class="eyebrow">' + esc(m.title) + ' · stableford · ' + (e.done ? 'final' : 'thru ' + e.thru + ' of ' + e.total) + '</div><table class="lb">' +
        e.order.map((p) => '<tr data-act="view" data-id="' + m.id + '" class="' + (p.id === store.me ? 'me' : '') + '"><td class="rk">' + (p.tied && e.done ? 'T' : '') + p.pos + '</td><td><b>' + esc(p.name) + '</b><div class="small muted">' + (p.goes === 'champ' ? 'Championship' : p.goes === 'third' ? '3rd-place match' : 'Out') + (e.thru ? ' · thru hole ' + e.thru : '') + '</div></td><td class="pts">' + p.total + '</td></tr>').join('') + '</table></div>';
    });
  }
  const rows = standings();
  const started = rows.some((r) => r.thru || r.live);
  h += '<div class="card"><div class="eyebrow">Pool play' + (ev.stage === 'pool' ? '' : ' · final') + '</div><table class="lb">';
  rows.forEach((r) => {
    h += '<tr data-act="viewPlayer" data-id="' + r.id + '" class="' + (r.id === store.me ? 'me' : '') + '"><td class="rk">' + (r.tied && started ? 'T' : '') + r.rank + '</td><td><b>' + esc(r.name) + '</b>' +
      '<div class="small muted">' + (r.thru ? 'through Match ' + r.thru : 'not started') + (r.live ? ' · <span class="err">' + esc(r.live.replace('Live: ', 'live ')) + '</span>' : '') + '</div>' +
      '<div class="pips">' + r.results.map((q) => '<span class="pip ' + (q.res === 'up' ? '' : q.res) + '">' + (q.res === 'W' || q.res === 'H' || q.res === 'L' ? q.res : '') + '</span>').join('') + '</div></td>' +
      '<td class="pts">' + fmt(r.pts) + '<div class="small muted mono" style="font-weight:400">' + (r.margin >= 0 ? '+' : '') + fmt(r.margin) + '</div></td></tr>';
  });
  h += '</table><p class="small muted" style="margin:8px 0 0">Points: win 1, tie ½. Small number is the margin tiebreaker. Tap a player to watch their match.</p></div>';
  return h;
}

// ---------- all matches ----------
function viewAll() {
  const ev = store.event;
  if (!ev.matches.length) return '<div class="card"><p class="muted">Matches appear once the draw is made.</p></div>';
  let h = '';
  const line = (m) => {
    const e = evalContest(m);
    if (e.kind === 'semis') return '<div class="card" data-act="view" data-id="' + m.id + '" style="cursor:pointer"><div class="eyebrow">Semifinal</div><b>' + esc(m.title) + '</b><div class="small muted">' + m.players.map(pname).join(', ') + '</div><div class="status">' + (e.done ? 'Final' : 'Through ' + e.thru + ' of ' + e.total) + '</div></div>';
    return '<div class="card" data-act="view" data-id="' + m.id + '" style="cursor:pointer"><div class="eyebrow">' + esc(m.stage === 'pool' ? 'Group ' + m.letter + ' · ' + (m.nine === 'front' ? 'Front' : 'Back') : m.title) + '</div><div><b>' + esc(e.names[0]) + '</b></div><div class="muted small">vs</div><div><b>' + esc(e.names[1]) + '</b></div><div class="status ' + (!e.done && e.played ? 'live' : '') + '">' + esc(e.status) + '</div></div>';
  };
  if (ev.stage === 'finals') { h += '<h2 style="margin:8px 0">Finals</h2>' + ev.matches.filter((m) => m.stage === 'finals').map(line).join(''); }
  if (ev.stage === 'semis' || ev.stage === 'finals') { h += '<h2 style="margin:8px 0">Semifinals</h2>' + ev.matches.filter((m) => m.stage === 'semis').map(line).join(''); }
  for (let n = 1; n <= 6; n++) {
    const ms = ev.matches.filter((m) => m.stage === 'pool' && m.n === n);
    if (!ms.length) continue;
    h += '<h2 style="margin:12px 0 8px">Match ' + n + ' · ' + GAME[ms[0].game] + ' <span class="muted small mono">holes ' + ms[0].tholes[0] + '–' + ms[0].tholes[2] + '</span></h2>' + ms.map(line).join('');
  }
  return h;
}

// ---------- rules ----------
function viewRules() {
  return rulesSections(store.event).map((s, i) => '<details class="card" ' + (i === 0 ? 'open' : '') + '><summary>' + esc(s.t) + '</summary><ul class="rules">' + s.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>').join('') +
    '<p class="small muted">Rules text lives in js/rules.js and builds from the format settings.</p>';
}

// ---------- admin ----------
function viewAdmin() {
  const ev = store.event;
  if (!ui.adminOk) {
    return '<div class="card"><h2>Admin</h2><label class="f"><span>PIN</span><input id="pin" inputmode="numeric" type="password" placeholder="PIN"></label>' +
      (ui.pinErr ? '<p class="err">Wrong PIN</p>' : '') + '<button class="btn" data-act="pin">Unlock</button><p class="small muted">This is a light lock to prevent accidents, not real security.</p></div>';
  }
  const ps = players().sort((a, b) => a.index - b.index);
  const course = ev.course, tees = Object.keys(course.tees);
  let h = '<div class="card"><h3>Players &amp; handicaps</h3><p class="small muted">Handicap index. Course handicaps are the 9-hole numbers per tee.</p>';
  h += '<table class="lb"><tr class="small muted"><td></td><td></td>' + tees.map((t) => '<td class="mono small">' + esc(t.slice(0, 3)) + '</td>').join('') + '<td></td></tr>';
  ps.forEach((p) => {
    h += '<tr style="cursor:default"><td><input data-path="players.' + p.id + '.name" value="' + esc(p.name) + '" style="width:84px"></td><td><input type="number" step="0.1" data-path="players.' + p.id + '.index" value="' + p.index + '" style="width:60px"></td>' +
      tees.map((t) => '<td class="mono small">' + E.courseHcp9(p.index, t, course) + '</td>').join('') + '<td><button class="btn ghost sm" data-act="delPlayer" data-id="' + p.id + '">✕</button></td></tr>';
  });
  h += '</table><div class="row" style="margin-top:10px"><input id="np-name" placeholder="Name" style="flex:1"><input id="np-idx" type="number" step="0.1" placeholder="Index"><button class="btn sm" data-act="addPlayer">Add</button></div>' +
    '<p class="small muted">' + ps.length + ' players (the pool draw needs 8).</p>' +
    (ps.length === 0 ? '<button class="btn ghost sm" data-act="demoPlayers">Load demo players</button>' : '') + '</div>';

  h += '<div class="card"><h3>Draw &amp; stages</h3><p class="small">Stage: <b>' + esc(ev.stage) + '</b></p>';
  if (ev.stage === 'setup') h += '<button class="btn block" data-act="draw" ' + (ps.length === 8 ? '' : 'disabled') + '>Make the pool draw</button>';
  else {
    h += '<div class="row" style="flex-wrap:wrap">';
    if (ev.stage === 'pool') h += '<button class="btn sm" data-act="semis">Start semis from pool standings</button><button class="btn ghost sm" data-act="redraw">Redo draw</button>';
    if (ev.stage === 'semis') h += '<button class="btn sm" data-act="finals">Start finals from semis</button><button class="btn ghost sm" data-act="toStage" data-v="pool">Back to pool view</button>';
    if (ev.stage === 'finals') h += '<button class="btn ghost sm" data-act="toStage" data-v="semis">Back to semis view</button>';
    h += '</div>';
    h += E.validatePool(ev.matches).map((x) => '<p class="err small">' + esc(x) + '</p>').join('');
  }
  h += '</div>';

  const pool = ev.matches.filter((m) => m.stage === 'pool');
  if (pool.length) {
    h += '<details class="card"><summary>Edit pool teams</summary><p class="small muted">Change who plays with whom. Applies to that match only; scores already entered stay.</p>';
    const opt = (sel) => ps.map((p) => '<option value="' + p.id + '" ' + (p.id === sel ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('');
    pool.forEach((m) => {
      h += '<div style="margin:10px 0"><b class="small">Match ' + m.n + m.letter + ' · ' + GAME[m.game] + '</b><div class="row" style="flex-wrap:wrap">' +
        ['t1.0', 't1.1', 't2.0', 't2.1'].map((s, k) => '<select data-team="' + m.id + '.' + s + '">' + opt(m[s.slice(0, 2)][+s[3]]) + '</select>' + (k === 1 ? '<span class="muted">vs</span>' : '')).join('') + '</div></div>';
    });
    h += '</details>';
  }

  // tie-breaks & finals override
  h += '<details class="card"><summary>Tiebreaks &amp; playoffs</summary><p class="small muted">Chip-off or manual tiebreak: a higher number ranks higher among players who are otherwise tied.</p>' +
    ps.map((p) => '<div class="row" style="margin:5px 0"><span class="sp">' + esc(p.name) + '</span><input type="number" step="1" data-path="players.' + p.id + '.tieBreak" value="' + (p.tieBreak || 0) + '"></div>').join('');
  ev.matches.filter((m) => m.stage === 'finals').forEach((m) => {
    const w = (ev.overrides.finalWinner || {})[m.id] || '';
    h += '<label class="f"><span>Playoff winner · ' + esc(m.title) + '</span><select data-path="overrides.finalWinner.' + m.id + '"><option value="">—</option>' + m.players.map((id) => '<option value="' + id + '" ' + (w === id ? 'selected' : '') + '>' + esc(pname(id)) + '</option>').join('') + '</select></label>';
  });
  h += '</details>';

  // format and course
  const F = ev.format;
  const num = (path, label, step) => '<label class="f"><span>' + label + '</span><input type="number" step="' + (step || 0.01) + '" data-path="' + path + '" value="' + path.split('.').reduce((o, k) => o[k], ev) + '"></label>';
  h += '<details class="card"><summary>Format settings</summary>' +
    '<label class="f"><span>Pool margin tiebreak</span><select data-path="format.margin.mode"><option value="net" ' + (F.margin.mode === 'net' ? 'selected' : '') + '>Net (won minus lost)</option><option value="wins" ' + (F.margin.mode === 'wins' ? 'selected' : '') + '>Margins won only</option></select></label>' +
    num('format.margin.up1', 'Margin: 1 UP', 0.5) + num('format.margin.up2', 'Margin: 2 UP', 0.5) + num('format.margin.closeout', 'Margin: 2&1 / early finish', 0.5) +
    num('format.points.win', 'Points for a win', 0.5) + num('format.points.tie', 'Points for a tie', 0.5) +
    num('format.games.scramble.lowPct', 'Scramble: % of low handicap') + num('format.games.scramble.highPct', 'Scramble: % of high handicap') +
    num('format.games.altshot.pct', 'Alt-shot: % of combined') + num('format.games.bestball.pct', 'Best ball: % of each') +
    num('format.semis.pct', 'Semis: % allowance') + num('format.finals.pct', 'Finals: % allowance') +
    '<p class="small muted">Changing these re-computes every match immediately. Do it before play starts.</p></details>';
  h += '<details class="card"><summary>Course data</summary><p class="small muted">Par and stroke index for the nine holes, and tee ratings (9-hole rating / slope).</p>' +
    '<table class="holes"><tr><th>Hole</th>' + course.par.map((_, i) => '<th>' + (i + 1) + '</th>').join('') + '</tr><tr><td class="small">Par</td>' +
    course.par.map((v, i) => '<td><input type="number" data-path="course.par.' + i + '" value="' + v + '" style="width:34px;padding:5px"></td>').join('') + '</tr><tr><td class="small">SI</td>' +
    course.si.map((v, i) => '<td><input type="number" data-path="course.si.' + i + '" value="' + v + '" style="width:34px;padding:5px"></td>').join('') + '</tr></table>' +
    tees.map((t) => '<div class="row" style="margin:6px 0"><b class="sp">' + esc(t) + '</b><input type="number" step="0.1" data-path="course.tees.' + t + '.rating" value="' + course.tees[t].rating + '"><input type="number" step="1" data-path="course.tees.' + t + '.slope" value="' + course.tees[t].slope + '"></div>').join('') + '</details>';

  // data tools
  h += '<details class="card"><summary>Data &amp; connection</summary>' +
    '<p class="small">Mode: <b>' + (store.db.mode === 'firestore' ? 'Shared (Firebase)' : 'Demo (this phone only)') + '</b> · event id ' + esc(EVENT_ID) + '</p>' +
    '<div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="test">Test connection</button><button class="btn ghost sm" data-act="export">Export backup</button><button class="btn ghost sm" data-act="import">Import backup</button></div>' +
    (ui.testMsg ? '<p class="' + (ui.testMsg.ok ? 'ok' : 'err') + '">' + esc(ui.testMsg.msg) + '</p>' : '') +
    '<label class="f"><span>Change PIN</span><input data-path="pin" value="' + esc(ev.pin) + '" inputmode="numeric"></label>' +
    '<label class="f"><span>Event name</span><input data-path="name" value="' + esc(ev.name) + '"></label>' +
    (store.db.mode === 'local' ? '<button class="btn coral sm" data-act="resetLocal">Erase everything on this phone</button>' : '') +
    '<input type="file" id="imp" accept="application/json" hidden></details>';
  h += '<button class="btn ghost block" data-act="lock">Lock admin</button>';
  return h;
}

// ---------- events ----------
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}

$app.addEventListener('click', async (ev0) => {
  const t = ev0.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act, d = t.dataset;
  if (t.classList.contains('sheet') && ev0.target !== t) return;
  const rerender = () => render();
  switch (a) {
    case 'tab': ui.tab = d.v; ui.viewId = d.v === 'match' ? ui.viewId : ui.viewId; break;
    case 'login': ui.login = true; break;
    case 'closeLogin': ui.login = false; break;
    case 'setMe': ui.login = false; ui.viewId = null; setMe(d.id || null); ui.tab = 'match'; return;
    case 'clearView': ui.viewId = null; break;
    case 'view': ui.viewId = d.id; ui.tab = 'match'; window.scrollTo(0, 0); break;
    case 'viewPlayer': {
      const id = E.currentContestFor(d.id, store.event.matches, store.event.stage, ctx(), getScores);
      ui.viewId = id; ui.tab = 'match'; window.scrollTo(0, 0); break;
    }
    case 'enter': openEntry(d.cid, +d.hole); return;
    case 'closeEntry': ui.entry = null; break;
    case 'step': { const v = ui.entry.vals; v[+d.j] = Math.max(1, Math.min(15, v[+d.j] + +d.d)); break; }
    case 'saveEntry': { const { cid, hole, vals } = ui.entry; ui.entry = null; render(); await enterScore(cid, hole, vals); return; }
    case 'pin': {
      const v = document.getElementById('pin').value;
      if (v === store.event.pin) { ui.adminOk = true; ui.pinErr = false; } else ui.pinErr = true;
      break;
    }
    case 'lock': ui.adminOk = false; break;
    case 'addPlayer': {
      const n = document.getElementById('np-name').value, i = document.getElementById('np-idx').value;
      if (!n.trim() || i === '' || isNaN(+i)) { alert('Enter a name and a handicap index.'); return; }
      await addPlayer(n, i); return;
    }
    case 'delPlayer': {
      if (store.event.matches.length && !confirm('Removing a player after the draw will break their matches. Continue?')) return;
      await mutate((e) => { delete e.players[d.id]; }); return;
    }
    case 'demoPlayers': await loadDemoPlayers(); return;
    case 'draw': try { await drawPool(); } catch (e) { alert(e.message); } return;
    case 'redraw': if (confirm('Redo the draw from current handicaps? Existing match teams are replaced; entered scores stay in the database but may not match.')) { try { await drawPool(); } catch (e) { alert(e.message); } } return;
    case 'semis': {
      const x = ctx();
      if (!E.poolComplete(store.event.matches, x, getScores) && !confirm('Not every pool match is finished. Seed the semis anyway?')) return;
      await startSemis(); ui.tab = 'board'; break;
    }
    case 'finals': {
      const evs = store.event.matches.filter((m) => m.stage === 'semis').map((m) => evalContest(m));
      if (!evs.every((x) => x.done) && !confirm('Semis are not finished. Make the finals anyway?')) return;
      try { await startFinals(); ui.tab = 'board'; } catch (e) { alert(e.message); }
      break;
    }
    case 'toStage': await setStage(d.v); return;
    case 'test': ui.testMsg = { ok: true, msg: 'Testing…' }; render(); ui.testMsg = await store.db.test(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify({ event: store.event, scores: store.scores }, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), el = document.createElement('a');
      el.href = url; el.download = 'crucible-backup-' + new Date().toISOString().slice(0, 10) + '.json'; el.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); return;
    }
    case 'import': document.getElementById('imp').click(); return;
    case 'resetLocal':
      if (confirm('Erase all players, draws and scores stored on this phone?')) {
        await store.db.clearScores(); const { newEvent } = await import('./store.js'); await store.db.saveEvent(newEvent());
      }
      return;
  }
  render();
});

$app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'imp' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (!data.event) throw new Error('Not a Crucible backup');
      await store.db.saveEvent(data.event);
      for (const k of Object.keys(data.scores || {})) await store.db.setScore(k, data.scores[k]);
      alert('Backup imported.');
    } catch (err) { alert('Import failed: ' + err.message); }
    return;
  }
  if (t.dataset.path) {
    const raw = t.value;
    const val = t.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
    t.blur();
    await mutate((ev) => setPath(ev, t.dataset.path, val));
    render();
  } else if (t.dataset.team) {
    const [id, side, k] = t.dataset.team.split('.');
    t.blur();
    await mutate((ev) => { const m = ev.matches.find((x) => x.id === id); m[side][+k] = t.value; });
    render();
  }
});

subscribe(() => { if (!ui.entry) render(); else render(); });
window.addEventListener('online', render);

init().then(() => {
  if (store.ready && store.event && !store.me && Object.keys(store.event.players).length && store.event.matches.length) { ui.login = true; }
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
