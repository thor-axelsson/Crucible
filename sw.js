const V = 'crucible-v1';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/store.js', 'js/db.js', 'js/engine.js', 'js/preset.js', 'js/rules.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const cdn = /(^|\.)(gstatic\.com|googleapis\.com)$/.test(u.hostname);
  if (u.hostname.endsWith('firestore.googleapis.com') || u.pathname.includes('/google.firestore')) return;
  if (cdn) {
    // fonts and Firebase SDK: cache-first, refresh in background
    e.respondWith(caches.open(V).then(async (c) => {
      const hit = await c.match(r);
      const net = fetch(r).then((res) => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  } else if (u.origin === location.origin) {
    // app files: network first so updates arrive, cache when offline
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('index.html'))));
  }
});
