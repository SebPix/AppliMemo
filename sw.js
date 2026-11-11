// Service worker : fonctionnement hors-ligne (cache d'abord, mise à jour en arrière-plan).
const CACHE = 'applimemo-v75';
const ASSETS = ['./', 'index.html', 'styles.css', 'core.js', 'vault.js', 'app.js', 'rich.js', 'journee.js', 'lists.js', 'notes.js', 'voice.js', 'quickadd.js', 'library.js', 'gcal.js', 'settings.js', 'main.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
