import { COURSE, FORMAT, DEFAULT_PLAYERS, DEMO_INDEXES } from './preset.js';
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
  const players = {};
  DEFAULT_PLAYERS.forEach((name, i) => { const id = 'u' + (i + 1); players[id] = { id, name, index: null, tieBreak: 0 }; });
  return {
    name: 'The Crucible', year: new Date().getFullYear(), course: COURSE, format: FORMAT,
    players, stage: 'setup', matches: [], overrides: { finalWinner: {} }, pin: '1234', version: 2
  };
}

export async function init() {
  store.db = await createDb(EVENT_ID, FIREBASE);
  store.me = lsGet('crucible:me');
  let seeded = false;
  store.db.onEvent((e, meta) => {
    store.event = e; store.ready = true;
    // first run: create the default event once the server confirms there is none
    if (e === null && !seeded && !(meta && meta.fromCache)) { seeded = true; store.db.saveEvent(newEvent()); }
    notify();
  });
  store.db.onScores((s) => { store.scores = s || {}; notify(); });
  store.db.onStatus((s) => { store.status = s; notify(); });
  store.db.start();
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
export const fillSampleHandicaps = () => mutate((e) => {
  Object.keys(e.players).sort().forEach((id, i) => { e.players[id].index = DEMO_INDEXES[i]; });
});
export const handicapsReady = () => Object.values(store.event.players).every((p) => Number.isFinite(p.index));
export function drawPool() {
  return mutate((e) => {
    const rank = E.rankPlayers(e.players);
    e.rank = rank;
    e.matches = E.generatePoolMatches(rank, e.format);
    e.stage = 'pool';
  });
}
export function finalizeGroup() {
  return mutate((e) => {
    const x = { course: e.course, format: e.format, players: e.players, overrides: e.overrides };
    const pool = e.matches.filter((m) => m.stage === 'pool');
    const st = E.poolStandings(x, pool, getScores);
    e.matches = pool.concat(E.generateSemis(st, e.format));
    e.stage = 'semis';
    e.poolFinalizedAt = Date.now();
  });
}
export function reopenGroup() {
  return mutate((e) => {
    e.matches = e.matches.filter((m) => m.stage === 'pool');
    e.stage = 'pool';
    delete e.poolFinalizedAt;
  });
}
export function forfeit(cid, pid, fromIdx) {
  return mutate((e) => { const c = e.matches.find((m) => m.id === cid); c.wd = c.wd || {}; c.wd[pid] = fromIdx; });
}
export function unforfeit(cid, pid) {
  return mutate((e) => { const c = e.matches.find((m) => m.id === cid); if (c.wd) delete c.wd[pid]; });
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
