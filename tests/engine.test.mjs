import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE, FORMAT, DEFAULT_PLAYERS, DEMO_INDEXES } from '../js/preset.js';
import * as E from '../js/engine.js';

const players = {};
DEFAULT_PLAYERS.forEach((n, i) => { const id = 'u' + (i + 1); players[id] = { id, name: n, index: DEMO_INDEXES[i] }; });
const ctx = { course: COURSE, format: FORMAT, players, overrides: {} };
const rank = E.rankPlayers(players);

test('strokes on holes: 5 strokes hit SI 1-5', () => {
  const holes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const got = E.strokeHoles(5, holes, COURSE).map((x) => x.hole).sort((a, b) => a - b);
  assert.deepEqual(got, [1, 3, 4, 7, 9]);
});

test('strokes wrap past 9 and plus handicaps give back', () => {
  assert.equal(E.strokesOnHole(10, 1), 2);
  assert.equal(E.strokesOnHole(10, 2), 1);
  assert.equal(E.strokesOnHole(-1, 9), -1);
  assert.equal(E.strokesOnHole(-1, 1), 0);
});

test('course handicap 9-hole', () => {
  // 12.0 on Green: 6 * 127/113 + (34.2-36) = 6.743 - 1.8 = 4.94 -> 5
  assert.equal(E.courseHcp9(12.0, 'Green', COURSE), 5);
});

test('stableford table', () => {
  const t = FORMAT.semis.table;
  assert.equal(E.stablefordPoints(4, 4, t), 2);
  assert.equal(E.stablefordPoints(3, 4, t), 4);
  assert.equal(E.stablefordPoints(2, 4, t), 8);
  assert.equal(E.stablefordPoints(1, 5, t), 12);
  assert.equal(E.stablefordPoints(8, 4, t), -1);
  assert.equal(E.stablefordPoints(6, 4, t), 0);
});

test('draw: 12 pool matches, each player in six, valid pairings', () => {
  const ms = E.generatePoolMatches(rank, FORMAT);
  assert.equal(ms.length, 12);
  assert.deepEqual(E.validatePool(ms), []);
  for (const id of rank) assert.equal(ms.filter((m) => m.t1.includes(id) || m.t2.includes(id)).length, 6);
  const m1 = ms.find((m) => m.n === 1 && m.letter === 'A');
  assert.deepEqual(m1.holes, [1, 2, 3]);
  assert.deepEqual(m1.tholes, [1, 2, 3]);
  const m4 = ms.find((m) => m.n === 4 && m.letter === 'A');
  assert.deepEqual(m4.tholes, [10, 11, 12]);
  assert.deepEqual(m4.holes, [1, 2, 3]);
});

test('match play 2&1 closeout and points', () => {
  const ms = E.generatePoolMatches(rank, FORMAT);
  const m = ms.find((x) => x.id === 'p1A');
  // scramble: team1 beats team2 on holes 1 and 2 by a lot
  const sc = { 1: [3, 6], 2: [3, 6] };
  const e = E.evalPoolMatch(m, sc, ctx);
  assert.equal(e.done, true);
  assert.equal(e.result, 't1');
  assert.equal(e.margin, 2.5);
  assert.match(e.status, /2&1/);
});

test('incomplete hole is not counted', () => {
  const ms = E.generatePoolMatches(rank, FORMAT);
  const m = ms.find((x) => x.id === 'p5A'); // best ball needs 4 scores
  const e = E.evalPoolMatch(m, { 1: [4, 4, 4] }, ctx);
  assert.equal(e.played, 0);
});

test('standings: win gives 1 point and margin; tie 0.5', () => {
  const ms = E.generatePoolMatches(rank, FORMAT);
  const all = { p1A: { 1: [3, 6], 2: [3, 6] } };
  const st = E.poolStandings(ctx, ms, (id) => all[id] || {});
  const winner = ms.find((x) => x.id === 'p1A').t1[0];
  const row = st.find((r) => r.id === winner);
  assert.equal(row.pts, 1);
  assert.equal(row.margin, 2.5);
  assert.equal(row.thru, 1);
  assert.equal(st[0].id === winner || st[0].pts === 1, true);
});

test('finals routing and playoff need', () => {
  const c = { id: 'fC', stage: 'finals', players: ['u1', 'u2'], routing: FORMAT.finals.routing, tholes: [28, 29, 30, 31, 32, 33, 34, 35, 36] };
  const sc = {};
  FORMAT.finals.routing.forEach((h) => { sc[h] = [4, 4]; });
  const e = E.evalFinal(c, sc, { ...ctx });
  // handicap differences give strokes, so use equal-handicap players for a true tie
  const eq = { ...ctx, players: { a: { id: 'a', name: 'A', index: 10 }, b: { id: 'b', name: 'B', index: 10 } } };
  const c2 = { ...c, players: ['a', 'b'] };
  const e2 = E.evalFinal(c2, sc, eq);
  assert.equal(e2.done, true);
  assert.equal(e2.needsPlayoff, true);
  eq.overrides = { finalWinner: { fC: 'a' } };
  assert.equal(E.evalFinal(c2, sc, eq).winner, 'a');
  assert.ok(e);
});

test('semis: ranking and advancement', () => {
  const st = E.poolStandings(ctx, E.generatePoolMatches(rank, FORMAT), () => ({}));
  const semis = E.generateSemis(st, FORMAT);
  assert.equal(semis[0].players.length, 4);
  assert.equal(semis[1].players.length, 4);
  const sc = {};
  for (let h = 1; h <= 9; h++) sc[h] = [4, 5, 6, 7];
  const ev = E.evalSemis(semis[0], sc, ctx);
  assert.equal(ev.done, true);
  assert.equal(ev.order.length, 4);
  assert.deepEqual(ev.order.map((p) => p.goes), ['champ', 'champ', 'third', 'out']);
});

test('semis: no score counts zero points and still completes the hole', () => {
  const st = E.poolStandings(ctx, E.generatePoolMatches(rank, FORMAT), () => ({}));
  const semi = E.generateSemis(st, FORMAT)[0];
  const sc = {};
  for (let h = 1; h <= 9; h++) sc[h] = [4, 5, 6, 7];
  sc[3] = [4, null, 6, 7];
  const ev = E.evalSemis(semi, sc, ctx);
  assert.equal(ev.done, true);
  const p = ev.players[1];
  assert.equal(p.noScores, 1);
  assert.equal(ev.rows[2].pts[1], 0);
});

test('semis: withdrawn player is ranked last, never advances, later holes not required', () => {
  const st = E.poolStandings(ctx, E.generatePoolMatches(rank, FORMAT), () => ({}));
  const semi = { ...E.generateSemis(st, FORMAT)[0], wd: {} };
  const best = semi.players[0];
  semi.wd[best] = 4; // forfeits from the 5th hole on
  const sc = {};
  for (let h = 1; h <= 9; h++) sc[h] = [3, 5, 6, 7].map((v, j) => (j === 0 && h > 4 ? null : v));
  // holes after the withdrawal only need the other three players
  const ev = E.evalSemis(semi, sc, ctx);
  assert.equal(ev.done, true);
  const w = ev.players.find((p) => p.id === best);
  assert.equal(w.wd, true);
  assert.equal(ev.order[ev.order.length - 1].id, best);
  assert.equal(w.goes, 'out');
  assert.deepEqual(ev.order.slice(0, 3).map((p) => p.goes), ['champ', 'champ', 'third']);
  // scores entered before withdrawal still count
  assert.ok(w.total > 0);
  // unforfeit: remove wd, later holes become incomplete? they were stored as no-score so still complete
  delete semi.wd[best];
  assert.equal(E.evalSemis(semi, sc, ctx).players.find((p) => p.id === best).wd, false);
});

test('poolProblems lists unfinished matches', () => {
  const ms = E.generatePoolMatches(rank, FORMAT);
  assert.equal(E.poolProblems(ms, ctx, () => ({})).length, 12);
});
