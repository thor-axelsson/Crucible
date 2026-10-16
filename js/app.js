import { init, store, subscribe, ctx, getScores, scoreMeta, enterScore, mutate, players, contest, evalContest, standings,
  fillSampleHandicaps, handicapsReady, drawPool, finalizeGroup, reopenGroup, startFinals, setStage, setMe, forfeit, unforfeit } from './store.js';
import { holeSvg, teeYards } from './holes.js';
import * as E from './engine.js';
import { rulesSections } from './rules.js';
import { EVENT_ID } from '../config.js';

const ui = { tab: 'match', viewId: null, entry: null, adminOk: false, msg: '', pinErr: false, testMsg: null, review: false, hole: null, confirm: null, lastStage: null };
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
  if (!store.ready || !store.event) { $app.innerHTML = '<main><p class="muted">Loading… (the first load needs a connection)</p></main>'; return; }
  const ev = store.event;
  // when the stage changes (finalize, semis, finals) everyone's screen goes back to their current match
  if (ui.lastStage !== ev.stage) { if (ui.lastStage !== null) { ui.viewId = null; if (ui.tab !== 'admin') ui.tab = 'match'; } ui.lastStage = ev.stage; }
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
    (ui.login ? loginSheet() : '') + (ui.entry ? entrySheet() : '') + (ui.hole ? holeSheet() : '') + (ui.confirm ? confirmSheet() : '');
}

// ---------- login ----------
function loginSheet() {
  const ps = players().sort((a, b) => a.name.localeCompare(b.name));
  return '<div class="sheet" data-act="closeLogin"><div class="login"><h2>Who are you?</h2><p class="muted small">Pick your name and the app always opens your current match.</p>' +
    (ps.length ? ps.map((p) => '<button class="pl" data-act="setMe" data-id="' + p.id + '">' + esc(p.name) + '</button>').join('') : '<p>No players yet. Add them in the Admin tab.</p>') +
    '<button class="btn ghost block" data-act="setMe" data-id="">Just watching</button></div></div>';
}

// ---------- match view ----------
function myContests() {
  const ev = store.event;
  if (!store.me) return [];
  const mine = ev.matches.filter((m) => (m.t1 && (m.t1.includes(store.me) || m.t2.includes(store.me))) || (m.players && m.players.includes(store.me)));
  const rank = { pool: 0, semis: 1, finals: 2 };
  return mine.sort((a, b) => (rank[a.stage] - rank[b.stage]) || ((a.n || 0) - (b.n || 0)));
}
function navLabel(m, list) {
  if (m.stage === 'pool') return 'Match ' + m.n + ' of ' + list.filter((x) => x.stage === 'pool').length;
  if (m.stage === 'semis') return 'Semifinal';
  return m.kind === 'champ' ? 'Championship' : '3rd place';
}
function viewMatch() {
  const ev = store.event;
  if (!ev.matches.length) {
    return '<div class="card"><h2>Welcome</h2><p class="muted">' + (handicapsReady()
      ? 'The draw has not been made yet. The admin does that in the Admin tab.'
      : 'The draw is not ready yet. The admin sets handicaps and makes the draw in the Admin tab (PIN 1234 until changed).') + '</p></div>';
  }
  const cur = myContestId();
  const id = ui.viewId || cur;
  const c = id && contest(id);
  if (!c) return '<div class="card"><h2>Pick your name</h2><p class="muted">Tap the name button at the top to see your match, or browse every match in the All tab.</p><button class="btn" data-act="login">Pick my name</button></div>';
  const list = myContests();
  const idx = list.findIndex((m) => m.id === c.id);
  let nav = '';
  if (idx >= 0 && list.length > 1) {
    nav = '<div class="mnav"><button class="btn ghost sm" data-act="navTo" data-id="' + (idx > 0 ? list[idx - 1].id : '') + '" ' + (idx > 0 ? '' : 'disabled') + ' aria-label="Previous match">‹</button>' +
      '<div class="mnav-t"><b>' + esc(navLabel(c, list)) + '</b>' + (c.id === cur ? '<span class="pill now">current</span>' : '<button class="pill jump" data-act="clearView">go to current ▸</button>') + '</div>' +
      '<button class="btn ghost sm" data-act="navTo" data-id="' + (idx < list.length - 1 ? list[idx + 1].id : '') + '" ' + (idx < list.length - 1 ? '' : 'disabled') + ' aria-label="Next match">›</button></div>';
  } else if (ui.viewId && c.id !== cur) {
    nav = '<button class="btn ghost sm" data-act="clearView">← ' + (store.me ? 'Back to my match' : 'Back') + '</button><div style="height:10px"></div>';
  }
  return nav + contestCard(c, !ui.viewId);
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
    const res = r.state === 'played' ? (r.win === 0 ? '–' : (r.win === 1 ? ARR_L : ARR_R)) : '';
    h += '<tr class="hole ' + (r.state === 'over' ? 'over' : '') + '" data-act="enter" data-cid="' + c.id + '" data-hole="' + r.hole + '">' +
      '<td>' + holeCell(r) + '</td><td>' + r.par + '</td><td>' + r.si + '</td>' +
      e.units.map((u, j) => '<td class="sc">' + (r.scores ? r.scores[j] : '·') + (r.strokes[j] > 0 ? '<span class="dot">' + '•'.repeat(Math.min(r.strokes[j], 3)) + '</span>' : '') + '</td>').join('') +
      '<td class="mono">' + res + '</td></tr>';
  });
  h += '</table><p class="small muted" style="margin:8px 0 0">Tap a hole row to enter or fix a score. Tap a hole number for the hole map. <span class="dot">•</span> = stroke received. ← left side won the hole, → right side won it, – halved.</p>';
  const last = e.rows.filter((r) => r.entered).map((r) => scoreMeta(c.id, r.hole)).filter(Boolean).sort((a, b) => b.at - a.at)[0];
  if (last) h += '<p class="small muted" style="margin:4px 0 0">Last score by ' + esc(last.by) + ' at ' + fmtTime(last.at) + '</p>';
  h += '</div>';
  if (e.kind === 'final' && e.needsPlayoff) h += '<div class="card"><b>Tied after nine.</b> Play it off, then the admin records the playoff winner in the Admin tab.</div>';
  return h;
}

const ARR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>';
const ARR_L = '<span class="arr" title="left side won">' + ARR + '</span>';
const ARR_R = '<span class="arr flip" title="right side won">' + ARR + '</span>';
function holeCell(r) {
  return '<button class="hnb" data-act="holemap" data-hole="' + r.hole + '" data-th="' + r.th + '" aria-label="View map of hole ' + r.th + '">' + r.th + '</button>';
}

function semisBody(c, e) {
  let h = '<div class="card"><div class="eyebrow">Standings · modified stableford</div><table class="lb">';
  e.order.forEach((p) => {
    h += '<tr><td class="rk">' + (p.tied && e.done ? 'T' : '') + p.pos + '</td><td><b>' + esc(p.name) + '</b>' + (p.wd ? ' <span class="wdtag">WD</span>' : '') + '<div class="small muted">allowance ' + p.allowance + (p.goes !== 'out' ? ' · ' + (p.goes === 'champ' ? 'to Championship' : 'to 3rd-place match') : '') + '</div></td><td class="pts">' + p.total + '</td></tr>';
  });
  h += '</table></div><div class="card"><div class="eyebrow">Strokes · ' + esc(store.event.format.semis.tee) + ' tees</div>';
  e.players.forEach((p) => {
    h += '<div class="strokebox"><div>' + esc(p.name) + '</div><div class="small">' + strokeText({ strokes: p.allowance }, null, []) + '</div></div>';
  });
  h += '</div><div class="card"><table class="holes"><tr><th>Hole</th><th>Par</th><th>SI</th>' + e.players.map((p) => '<th>' + esc(p.name.slice(0, 6)) + '</th>').join('') + '</tr>';
  e.rows.forEach((r) => {
    h += '<tr class="hole" data-act="enter" data-cid="' + c.id + '" data-hole="' + r.hole + '"><td>' + holeCell(r) + '</td><td>' + r.par + '</td><td>' + r.si + '</td>' +
      e.players.map((p, j) => '<td class="sc">' + (r.gone && r.gone[j] ? '<span class="wdtag">WD</span>' : (r.scores ? (r.scores[j] == null ? '<span class="nstag">NS</span>' : r.scores[j]) : '·')) + (r.strokes[j] > 0 ? '<span class="dot">' + '•'.repeat(Math.min(r.strokes[j], 3)) + '</span>' : '') + (r.pts ? '<div class="small muted">' + r.pts[j] + ' pt</div>' : '') + '</td>').join('') + '</tr>';
  });
  return h + '</table><p class="small muted" style="margin:8px 0 0">Tap a hole row to enter or fix scores. Tap a hole number for the hole map. Points shown are net stableford.</p></div>';
}

// ---------- score entry ----------
function entrySheet() {
  const { cid, hole, vals } = ui.entry;
  const c = contest(cid), e = evalContest(c);
  const row = e.rows.find((r) => r.hole === hole);
  const semis = e.kind === 'semis';
  const labels = semis ? e.players.map((p) => p.name) : e.units.map((u) => u.label);
  let h = '<div class="sheet" data-act="closeEntry"><div><div class="eyebrow">' + esc(contestTitle(c)) + '</div>' +
    '<h2>Hole ' + row.th + ' <span class="muted small mono">course hole ' + hole + ' · par ' + row.par + ' · SI ' + row.si + '</span></h2>';
  labels.forEach((l, j) => {
    const gone = semis && row.gone[j];
    const dots = row.strokes[j] > 0 ? ' <span class="dot">' + '•'.repeat(Math.min(row.strokes[j], 3)) + '</span>' : '';
    if (gone) {
      h += '<div class="stepper"><div class="nm">' + esc(l) + ' <span class="wdtag">WD</span></div><div class="muted small">withdrawn</div></div>';
      return;
    }
    const v = vals[j];
    h += '<div class="stepper"><div class="nm">' + esc(l) + dots + '</div>' +
      '<button data-act="step" data-j="' + j + '" data-d="-1">−</button><div class="v ' + (v == null ? 'ns' : '') + '">' + (v == null ? 'NS' : v) + '</div><button data-act="step" data-j="' + j + '" data-d="1">+</button></div>';
    if (semis) {
      h += '<div class="pacts"><button class="btn ghost sm" data-act="toggleNS" data-j="' + j + '">' + (v == null ? 'Enter a score' : 'No score') + '</button>' +
        '<button class="btn ghost sm warn" data-act="askForfeit" data-j="' + j + '">Forfeit remaining holes</button></div>';
    }
  });
  return h + '<div class="row" style="margin-top:14px"><button class="btn ghost sp" data-act="closeEntry">Cancel</button><button class="btn sp" data-act="saveEntry">Save</button></div></div></div>';
}
function openEntry(cid, hole) {
  const c = contest(cid), e = evalContest(c);
  const row = e.rows.find((r) => r.hole === hole);
  const n = e.kind === 'semis' ? e.players.length : e.units.length;
  const base = row.scores ? row.scores.slice() : Array(n).fill(row.par);
  ui.entry = { cid, hole, vals: base.map((v, j) => (e.kind === 'semis' && row.gone[j] ? null : v)) };
  render();
}

// ---------- hole map ----------
function holeSheet() {
  const { hole, th } = ui.hole;
  const course = store.event.course;
  const ty = teeYards(course, hole);
  return '<div class="sheet full"><div class="hs">' +
    '<div class="hs-top"><div><div class="eyebrow" style="color:#F58A70">COURSE HOLE</div><div class="hs-n">' + hole + '</div></div>' +
    '<div class="hs-stat"><span>PAR</span><b>' + course.par[hole - 1] + '</b></div><div class="hs-stat"><span>SI</span><b>' + course.si[hole - 1] + '</b></div>' +
    '<button class="btn ghost sm hs-x" data-act="closeHole" aria-label="Close">✕</button></div>' +
    '<div class="hm-wrap">' + holeSvg(hole) +
    '<div class="yd"><div class="yd-h">FROM THE TEES</div>' + ty.map((t) => '<div class="yd-r"><i style="background:' + t.color + '"></i><span>' + esc(t.tee) + '</span><b>' + (t.yds == null ? '–' : t.yds + 'y') + '</b></div>').join('') + '</div></div>' +
    '<div class="hs-foot">Tournament hole ' + esc(th) + ' · traced from the course map, not to scale</div></div></div>';
}

// ---------- confirm dialog ----------
function confirmSheet() {
  const c = ui.confirm;
  return '<div class="sheet center" data-act="confirmNo"><div class="dlg"><h2>' + esc(c.title) + '</h2><p>' + c.body + '</p>' +
    '<div class="row" style="margin-top:14px"><button class="btn ghost sp" data-act="confirmNo">Cancel</button><button class="btn ' + (c.danger ? 'coral' : '') + ' sp" data-act="confirmYes">' + esc(c.yes) + '</button></div></div></div>';
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
        e.order.map((p) => '<tr data-act="view" data-id="' + m.id + '" class="' + (p.id === store.me ? 'me' : '') + '"><td class="rk">' + (p.tied && e.done ? 'T' : '') + p.pos + '</td><td><b>' + esc(p.name) + '</b>' + (p.wd ? ' <span class="wdtag">WD</span>' : '') + '<div class="small muted">' + (p.goes === 'champ' ? 'Championship' : p.goes === 'third' ? '3rd-place match' : 'Out') + (e.thru ? ' · thru hole ' + e.thru : '') + '</div></td><td class="pts">' + p.total + '</td></tr>').join('') + '</table></div>';
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
function reviewMatch(m) {
  const e = evalContest(m);
  let h = '<div class="card"><div class="eyebrow">Match ' + m.n + ' · ' + GAME[m.game] + ' · Group ' + m.letter + ' · holes ' + m.tholes[0] + '–' + m.tholes[m.tholes.length - 1] + '</div>' +
    '<div><b>' + esc(e.names[0]) + '</b> <span class="muted small">vs</span> <b>' + esc(e.names[1]) + '</b></div>' +
    '<div class="status ' + (!e.done && e.played ? 'live' : '') + '">' + esc(e.status) + (e.done ? ' · ' + (e.lead === 0 ? '½–½' : (e.lead === 1 ? '1–0' : '0–1')) : '') + '</div>' +
    '<table class="holes rv"><tr><th>Hole</th><th>' + (e.units.length > 2 ? 'Scores (team 1 | team 2)' : 'Scores (team 1 | team 2)') + '</th><th></th></tr>';
  e.rows.forEach((r) => {
    const sc = r.scores ? (e.units.length > 2 ? r.scores.slice(0, 2).join(' ') + ' | ' + r.scores.slice(2).join(' ') : r.scores.join(' | ')) : (r.state === 'over' ? 'not needed' : '–');
    h += '<tr class="hole ' + (r.state === 'over' ? 'over' : '') + '" data-act="enter" data-cid="' + m.id + '" data-hole="' + r.hole + '"><td><span class="hn">' + r.th + '</span></td><td class="sc">' + esc(sc) + '</td><td><span class="pill">edit</span></td></tr>';
  });
  return h + '</table></div>';
}
function viewReview() {
  const ev = store.event;
  const probs = E.poolProblems(ev.matches, ctx(), getScores);
  let h = '<button class="btn ghost sm" data-act="closeReview">← Admin</button><div style="height:10px"></div><div class="hero"><div class="eyebrow">Group stage</div><h2>Review &amp; finalize</h2>' +
    '<p style="margin:6px 0 0">Compare each match with the paper scorecards. Tap any hole to fix a score.</p></div>';
  h += probs.length
    ? '<div class="card"><b class="err">' + probs.length + ' match' + (probs.length === 1 ? '' : 'es') + ' not finished</b><div class="small">' + probs.map((x) => 'Match ' + x.n + x.letter + (x.missing.length ? ' (missing hole' + (x.missing.length > 1 ? 's ' : ' ') + x.missing.join(', ') + ')' : '')).join(' · ') + '</div></div>'
    : '<div class="card"><b class="ok">All 12 matches are complete.</b></div>';
  const rows = standings();
  h += '<div class="card"><div class="eyebrow">Standings if finalized now</div><table class="lb">' + rows.map((r) =>
    '<tr style="cursor:default"><td class="rk">' + (r.tied ? 'T' : '') + r.rank + '</td><td><b>' + esc(r.name) + '</b><div class="small muted">' + (r.rank <= ev.format.semis.upperSize ? 'Upper semis' : 'Lower semis') + '</div></td><td class="pts">' + fmt(r.pts) + '<div class="small muted mono" style="font-weight:400">' + (r.margin >= 0 ? '+' : '') + fmt(r.margin) + '</div></td></tr>').join('') + '</table>';
  const k = ev.format.semis.upperSize;
  if (rows[k - 1] && rows[k] && rows[k - 1].pts === rows[k].pts && rows[k - 1].margin === rows[k].margin && rows[k - 1].tieBreak === rows[k].tieBreak) {
    h += '<p class="err small">Tie at the cut line (' + esc(rows[k - 1].name) + ' and ' + esc(rows[k].name) + '). Settle it with a chip-off and enter the result under Tiebreaks before finalizing.</p>';
  }
  h += '</div>';
  for (let n = 1; n <= 6; n++) h += ev.matches.filter((m) => m.stage === 'pool' && m.n === n).map(reviewMatch).join('');
  h += '<button class="btn block" data-act="askFinalize">Finalize group stage &amp; start semis</button>';
  return h;
}

function viewAdmin() {
  const ev = store.event;
  if (!ui.adminOk) {
    return '<div class="card"><h2>Admin</h2><label class="f"><span>PIN</span><input id="pin" inputmode="numeric" type="password" placeholder="PIN"></label>' +
      (ui.pinErr ? '<p class="err">Wrong PIN</p>' : '') + '<button class="btn" data-act="pin">Unlock</button><p class="small muted">This is a light lock to prevent accidents, not real security.</p></div>';
  }
  if (ui.review && ev.stage === 'pool') return viewReview();
  const ps = players();
  const course = ev.course, tees = Object.keys(course.tees);
  const ready = handicapsReady();
  let h = '<div class="card"><h3>Players &amp; handicaps</h3><p class="small muted">The usual eight. Rename someone to swap them out. Enter each handicap index; the draw unlocks when all eight are set.</p><div class="plist">';
  ps.forEach((p) => {
    h += '<div class="pl2"><input class="nm" data-path="players.' + p.id + '.name" value="' + esc(p.name) + '" aria-label="Name"><input class="ix" type="number" step="0.1" inputmode="decimal" placeholder="Index" data-path="players.' + p.id + '.index" value="' + (p.index == null ? '' : p.index) + '" aria-label="Handicap index">' +
      '<div class="hc small muted mono">' + (Number.isFinite(p.index) ? tees.map((t) => t + ' ' + E.courseHcp9(p.index, t, course)).join(' · ') : 'set handicap') + '</div></div>';
  });
  h += '</div><p class="small muted" style="margin:8px 0 0">Course handicaps shown are 9-hole, per tee.</p>' +
    '<button class="btn ghost sm" data-act="sample" style="margin-top:8px">Fill sample handicaps (practice)</button></div>';

  h += '<div class="card"><h3>Draw &amp; stages</h3><p class="small">Stage: <b>' + esc(ev.stage) + '</b></p>';
  if (ev.stage === 'setup') h += '<button class="btn block" data-act="draw" ' + (ready ? '' : 'disabled') + '>Make the pool draw</button>' + (ready ? '' : '<p class="small err">Set all eight handicaps first.</p>');
  else {
    h += '<div class="row" style="flex-wrap:wrap">';
    if (ev.stage === 'pool') h += '<button class="btn" data-act="review">Review &amp; finalize group stage</button><button class="btn ghost sm" data-act="redraw">Redo draw</button>';
    if (ev.stage === 'semis') h += '<button class="btn sm" data-act="finals">Start finals from semis</button><button class="btn ghost sm" data-act="askReopen">Reopen group stage</button><button class="btn ghost sm" data-act="review2">Review group scores</button>';
    if (ev.stage === 'finals') h += '<button class="btn ghost sm" data-act="toStage" data-v="semis">Back to semis view</button>';
    h += '</div>';
    h += E.validatePool(ev.matches).map((x) => '<p class="err small">' + esc(x) + '</p>').join('');
  }
  h += '</div>';

  const wds = [];
  ev.matches.filter((m) => m.stage === 'semis' && m.wd).forEach((m) => Object.keys(m.wd).forEach((pid) => wds.push({ m, pid, from: m.wd[pid] })));
  if (wds.length) {
    h += '<div class="card"><h3>Withdrawn players</h3><p class="small muted">Unforfeit puts the player back in. Holes entered while withdrawn show as No score and can be edited.</p>' +
      wds.map((w) => '<div class="row" style="margin:6px 0"><span class="sp"><b>' + esc(pname(w.pid)) + '</b> <span class="wdtag">WD</span> <span class="small muted">from hole ' + (w.m.tholes ? w.m.tholes[w.from] : w.from + 1) + ' · ' + esc(w.m.title) + '</span></span><button class="btn ghost sm" data-act="unforfeit" data-cid="' + w.m.id + '" data-id="' + w.pid + '">Unforfeit</button></div>').join('') + '</div>';
  }

  const pool = ev.matches.filter((m) => m.stage === 'pool');
  if (pool.length) {
    h += '<details class="card"><summary>Edit pool teams</summary><p class="small muted">Change who plays with whom. Applies to that match only; scores already entered stay.</p>';
    const opt = (sel) => ps.map((p) => '<option value="' + p.id + '" ' + (p.id === sel ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('');
    pool.forEach((m) => {
      h += '<div style="margin:10px 0"><b class="small">Match ' + m.n + m.letter + ' · ' + GAME[m.game] + '</b><div class="row tsel">' +
        ['t1.0', 't1.1', 't2.0', 't2.1'].map((s2, k) => '<select data-team="' + m.id + '.' + s2 + '">' + opt(m[s2.slice(0, 2)][+s2[3]]) + '</select>' + (k === 1 ? '<span class="muted">vs</span>' : '')).join('') + '</div></div>';
    });
    h += '</details>';
  }

  h += '<details class="card"><summary>Tiebreaks &amp; playoffs</summary><p class="small muted">Chip-off or manual tiebreak: a higher number ranks higher among players who are otherwise tied.</p>' +
    ps.map((p) => '<div class="row" style="margin:5px 0"><span class="sp">' + esc(p.name) + '</span><input type="number" step="1" data-path="players.' + p.id + '.tieBreak" value="' + (p.tieBreak || 0) + '"></div>').join('');
  ev.matches.filter((m) => m.stage === 'finals').forEach((m) => {
    const w = (ev.overrides.finalWinner || {})[m.id] || '';
    h += '<label class="f"><span>Playoff winner · ' + esc(m.title) + '</span><select data-path="overrides.finalWinner.' + m.id + '"><option value="">—</option>' + m.players.map((id) => '<option value="' + id + '" ' + (w === id ? 'selected' : '') + '>' + esc(pname(id)) + '</option>').join('') + '</select></label>';
  });
  h += '</details>';

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
  h += '<details class="card"><summary>Course data</summary><p class="small muted">Par and stroke index for the nine holes, tee ratings (9-hole rating / slope) and yardages.</p>' +
    '<div class="g9"><span></span>' + course.par.map((_, i) => '<b class="gh">' + (i + 1) + '</b>').join('') +
    '<span class="small">Par</span>' + course.par.map((v, i) => '<input type="number" inputmode="numeric" data-path="course.par.' + i + '" value="' + v + '">').join('') +
    '<span class="small">SI</span>' + course.si.map((v, i) => '<input type="number" inputmode="numeric" data-path="course.si.' + i + '" value="' + v + '">').join('') +
    tees.map((t) => '<span class="small">' + esc(t.slice(0, 3)) + '</span>' + (course.tees[t].yards || Array(9).fill(0)).map((v, i) => '<input type="number" inputmode="numeric" data-path="course.tees.' + t + '.yards.' + i + '" value="' + v + '">').join('')).join('') + '</div>' +
    '<p class="small muted" style="margin:6px 0">Rows under SI are yardages per tee.</p>' +
    tees.map((t) => '<div class="row" style="margin:6px 0"><b class="sp">' + esc(t) + '</b><input type="number" step="0.1" data-path="course.tees.' + t + '.rating" value="' + course.tees[t].rating + '"><input type="number" step="1" data-path="course.tees.' + t + '.slope" value="' + course.tees[t].slope + '"></div>').join('') + '</details>';

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
    case 'navTo': if (d.id) ui.viewId = d.id; window.scrollTo(0, 0); break;
    case 'holemap': ui.hole = { hole: +d.hole, th: d.th }; break;
    case 'closeHole': ui.hole = null; break;
    case 'view': ui.viewId = d.id; ui.tab = 'match'; window.scrollTo(0, 0); break;
    case 'viewPlayer': {
      const id = E.currentContestFor(d.id, store.event.matches, store.event.stage, ctx(), getScores);
      ui.viewId = id; ui.tab = 'match'; window.scrollTo(0, 0); break;
    }
    case 'enter': openEntry(d.cid, +d.hole); return;
    case 'closeEntry': ui.entry = null; break;
    case 'step': {
      const v = ui.entry.vals, j = +d.j;
      if (v[j] == null) { const e0 = evalContest(contest(ui.entry.cid)); v[j] = e0.rows.find((r) => r.hole === ui.entry.hole).par; }
      else v[j] = Math.max(1, Math.min(15, v[j] + +d.d));
      break;
    }
    case 'toggleNS': {
      const v = ui.entry.vals, j = +d.j;
      const e0 = evalContest(contest(ui.entry.cid));
      v[j] = v[j] == null ? e0.rows.find((r) => r.hole === ui.entry.hole).par : null;
      break;
    }
    case 'askForfeit': {
      const c0 = contest(ui.entry.cid), e0 = evalContest(c0), j = +d.j;
      const row = e0.rows.find((r) => r.hole === ui.entry.hole);
      ui.confirm = { kind: 'forfeit', cid: c0.id, pid: c0.players[j], idx: row.idx, j, danger: true, yes: 'Yes, forfeit', title: 'Forfeit ' + pname(c0.players[j]) + '?',
        body: esc(pname(c0.players[j])) + ' will be marked <b>WD</b> (withdrawn) and get no score on hole ' + row.th + ' and every hole after it. Points already earned stay. An admin can undo this.' };
      break;
    }
    case 'confirmNo': ui.confirm = null; break;
    case 'confirmYes': {
      const c1 = ui.confirm; ui.confirm = null;
      if (c1.kind === 'forfeit') { if (ui.entry) ui.entry.vals[c1.j] = null; render(); await forfeit(c1.cid, c1.pid, c1.idx); return; }
      if (c1.kind === 'finalize') { try { await finalizeGroup(); ui.review = false; ui.viewId = null; ui.tab = 'board'; } catch (err) { alert(err.message); } break; }
      if (c1.kind === 'reopen') { await reopenGroup(); ui.review = false; return; }
      break;
    }
    case 'unforfeit': await unforfeit(d.cid, d.id); return;
    case 'review': case 'review2': if (store.event.stage === 'pool') { ui.review = true; window.scrollTo(0, 0); } else { alert('The group stage is finalized. Reopen it first to review and edit.'); } break;
    case 'closeReview': ui.review = false; break;
    case 'askFinalize': {
      const probs = E.poolProblems(store.event.matches, ctx(), getScores);
      ui.confirm = { kind: 'finalize', danger: false, yes: 'Finalize', title: 'Finalize group stage?',
        body: (probs.length ? '<b class="err">' + probs.length + ' match' + (probs.length === 1 ? ' is' : 'es are') + ' not finished.</b> ' : '') +
          'This locks in the pool standings, seeds the upper and lower semis, and moves everyone\'s match screen to their semifinal.' };
      break;
    }
    case 'askReopen':
      ui.confirm = { kind: 'reopen', danger: true, yes: 'Reopen', title: 'Reopen group stage?', body: 'This removes the semifinal groups. Semi scores already entered are kept but will not show until you finalize again.' };
      break;
    case 'sample': await fillSampleHandicaps(); return;
    case 'saveEntry': { const { cid, hole, vals } = ui.entry; ui.entry = null; render(); await enterScore(cid, hole, vals); return; }
    case 'pin': {
      const v = document.getElementById('pin').value;
      if (v === store.event.pin) { ui.adminOk = true; ui.pinErr = false; } else ui.pinErr = true;
      break;
    }
    case 'lock': ui.adminOk = false; break;
    case 'draw': try { await drawPool(); } catch (e) { alert(e.message); } return;
    case 'redraw': if (confirm('Redo the draw from current handicaps? Existing match teams are replaced; entered scores stay in the database but may not match.')) { try { await drawPool(); } catch (e) { alert(e.message); } } return;
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
    const val = t.type === 'number' ? (raw === '' ? (/\.index$/.test(t.dataset.path) ? null : 0) : Number(raw)) : raw;
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
