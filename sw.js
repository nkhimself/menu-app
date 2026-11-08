// Offline cache. Bump VERSION when you replace the app files so phones fetch the new ones.
const VERSION = 'repricer-v11';
const FILES = ['./', './index.html', './style.css', './vazirmatn.woff2', './config.js', './sync.js', './logic.js', './templates.js', './card.js', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // never cache or intercept the database/login server: only this app's own files
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // network first so updates arrive; fall back to cache when offline
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});
