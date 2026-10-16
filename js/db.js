// Data layer. Two interchangeable adapters: local (this phone only) and Firestore (shared, live).
// Shape: event doc = one object; scores = { [key]: { s:[numbers], by, at } } with key `${contestId}~${hole}`.
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';

export const scoreKey = (cid, hole) => cid + '~' + hole;

function emitter() {
  const subs = new Set();
  return { on(f) { subs.add(f); return () => subs.delete(f); }, emit(v) { subs.forEach((f) => f(v)); } };
}

function createLocal(eventId) {
  const kE = 'crucible:' + eventId + ':event', kS = 'crucible:' + eventId + ':scores';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } };
  const ev = emitter(), sc = emitter(), st = emitter();
  let event = load(kE, null), scores = load(kS, {});
  window.addEventListener('storage', (e) => {
    if (e.key === kE) { event = load(kE, null); ev.emit(event); }
    if (e.key === kS) { scores = load(kS, {}); sc.emit(scores); }
  });
  return {
    mode: 'local',
    start() { ev.emit(event); sc.emit(scores); st.emit({ state: 'local' }); },
    onEvent: ev.on, onScores: sc.on, onStatus: st.on,
    async saveEvent(e) { event = e; save(kE, e); ev.emit(e); },
    async setScore(key, val) { scores = { ...scores, [key]: val }; save(kS, scores); sc.emit(scores); },
    async clearScores() { scores = {}; save(kS, scores); sc.emit(scores); },
    async test() { return { ok: true, msg: 'Demo mode: data is stored on this phone only.' }; }
  };
}

async function createFirestore(eventId, cfg) {
  const [appM, fsM] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js')]);
  const app = appM.initializeApp(cfg);
  let fs;
  try {
    fs = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
  } catch (e) { fs = fsM.getFirestore(app); }
  const ev = emitter(), sc = emitter(), st = emitter();
  const evRef = fsM.doc(fs, 'events', eventId);
  const scCol = fsM.collection(fs, 'events', eventId, 'scores');
  let pending = false, err = null, cached = true;
  const push = () => st.emit({ state: err ? 'error' : (!navigator.onLine ? 'offline' : (pending ? 'syncing' : (cached ? 'connecting' : 'live'))), error: err });
  window.addEventListener('online', push); window.addEventListener('offline', push);
  return {
    mode: 'firestore',
    start() {
      fsM.onSnapshot(evRef, { includeMetadataChanges: true }, (snap) => {
        err = null; cached = snap.metadata.fromCache && navigator.onLine === false ? true : snap.metadata.fromCache;
        pending = snap.metadata.hasPendingWrites; ev.emit(snap.exists() ? snap.data() : null); push();
      }, (e) => { err = e.message; push(); });
      fsM.onSnapshot(scCol, { includeMetadataChanges: true }, (snap) => {
        const out = {}; snap.forEach((d) => { out[d.id] = d.data(); });
        pending = snap.metadata.hasPendingWrites; cached = snap.metadata.fromCache; sc.emit(out); push();
      }, (e) => { err = e.message; push(); });
    },
    onEvent: ev.on, onScores: sc.on, onStatus: st.on,
    async saveEvent(e) { await fsM.setDoc(evRef, JSON.parse(JSON.stringify(e))); },
    async setScore(key, val) { fsM.setDoc(fsM.doc(scCol, key), val).catch((e) => { err = e.message; push(); }); },
    async clearScores() { throw new Error('Clearing shared scores is not supported from the app.'); },
    async test() {
      try {
        const probe = fsM.doc(fs, 'events', eventId, 'scores', '_probe');
        await Promise.race([fsM.setDoc(probe, { at: Date.now() }), new Promise((_, r) => setTimeout(() => r(new Error('Timed out. Check Wi-Fi, project id, and Firestore rules.')), 8000))]);
        return { ok: true, msg: 'Connected. Writes reach the server.' };
      } catch (e) { return { ok: false, msg: e.message }; }
    }
  };
}

export async function createDb(eventId, firebaseCfg) {
  if (!firebaseCfg) return createLocal(eventId);
  try { return await createFirestore(eventId, firebaseCfg); }
  catch (e) { const d = createLocal(eventId); d.fallbackReason = e.message; return d; }
}
