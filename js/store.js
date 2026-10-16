import { COURSE, FORMAT, DEMO_PLAYERS } from './preset.js';
import { createDb, scoreKey } from './db.js';
import * as E from './engine.js';
import { EVENT_ID, FIREBASE } from '../config.js';

export const store = {
  db: null, event: null, scores: {}, status: { state: 'local' }, me: null, ready: false, listeners: new Set(),
  _byContest: null
};

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

export function subscribe(f) { store.listeners.add(f); return () => store.listeners.delete(f); }
function notify() { store._byContest = null; store.listeners.forEach((f) => f()); }

export function newEvent() {
  return {
    name: 'The Crucible', year: new Date().getFullYear(), course: COURSE, format: FORMAT,
    players: {}, stage: 'setup', matches: [], overrides: { finalWinner: {} }, pin: '1234', version: 1
  };
}

export async function init() {
  store.db = await createDb(EVENT_ID, FIREBASE);
  store.me = lsGet('crucible:me');
  store.db.onEvent((e) => { store.event = e; store.ready = true; notify(); });
  store.db.onScores((s) => { store.scores = s || {}; notify(); });
  store.db.onStatus((s) => { store.status = s; notify(); });
  store.db.start();
  // Firestore can take a moment to answer; in local mode the first emit is immediate.
  setTimeout(async () => {
    if (store.event === null && store.db.mode === 'local') { await store.db.saveEvent(newEvent()); }
  }, 0);
}

export function setMe(id) { store.me = id; lsSet('crucible:me', id); notify(); }

export function ctx() {
  const e = store.event;
  return { course: e.course, format: e.format, players: e.players, overrides: e.overrides || {} };
}

export function getScores(cid) {
  if (!store._byContest) {
    const m = {};
    Object.keys(store.scores).forEach((k) => {
      const [c, h] = k.split('~');
      if (!h) return;
      (m[c] = m[c] || {})[h] = store.scores[k].s;
    });
    store._byContest = m;
  }
  return store._byContest[cid] || {};
}
export const scoreMeta = (cid, h) => store.scores[scoreKey(cid, h)] || null;

export async function enterScore(cid, hole, arr) {
  const by = store.me ? (store.event.players[store.me] || {}).name || 'unknown' : 'guest';
  await store.db.setScore(scoreKey(cid, hole), { s: arr, by, at: Date.now() });
}

export async function mutate(fn) {
  const e = JSON.parse(JSON.stringify(store.event));
  fn(e);
  store.event = e; notify();
  await store.db.saveEvent(e);
}

export const players = () => Object.values(store.event.players);
export const contest = (id) => store.event.matches.find((m) => m.id === id);

export function evalContest(c) {
  const x = ctx();
  if (c.stage === 'pool') return E.evalPoolMatch(c, getScores(c.id), x);
  if (c.stage === 'semis') return E.evalSemis(c, getScores(c.id), x);
  return E.evalFinal(c, getScores(c.id), x);
}

export function standings() {
  return E.poolStandings(ctx(), store.event.matches.filter((m) => m.stage === 'pool'), getScores);
}

// ----- admin actions -----
export function addPlayer(name, index) {
  const id = 'u' + Math.random().toString(36).slice(2, 7);
  return mutate((e) => { e.players[id] = { id, name: name.trim(), index: Number(index), tieBreak: 0 }; });
}
export const loadDemoPlayers = () => mutate((e) => {
  e.players = {};
  DEMO_PLAYERS.forEach((p, i) => { const id = 'u' + (i + 1); e.players[id] = { id, name: p.name, index: p.index, tieBreak: 0 }; });
});
export function drawPool() {
  return mutate((e) => {
    const rank = E.rankPlayers(e.players);
    e.rank = rank;
    e.matches = E.generatePoolMatches(rank, e.format);
    e.stage = 'pool';
  });
}
export function startSemis() {
  return mutate((e) => {
    const x = { course: e.course, format: e.format, players: e.players, overrides: e.overrides };
    const pool = e.matches.filter((m) => m.stage === 'pool');
    const st = E.poolStandings(x, pool, getScores);
    e.matches = pool.concat(E.generateSemis(st, e.format));
    e.stage = 'semis';
  });
}
export function startFinals() {
  return mutate((e) => {
    const x = { course: e.course, format: e.format, players: e.players, overrides: e.overrides };
    const keep = e.matches.filter((m) => m.stage !== 'finals');
    const evs = keep.filter((m) => m.stage === 'semis').map((m) => E.evalSemis(m, getScores(m.id), x));
    e.matches = keep.concat(E.generateFinals(evs, e.format));
    e.stage = 'finals';
  });
}
export const setStage = (stage) => mutate((e) => { e.stage = stage; });
