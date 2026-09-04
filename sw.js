const CACHE = 'pace-v12';
const ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest', './icon.svg', './icon-maskable.svg',
  './js/main.js', './js/core/storage.js', './js/core/ui.js', './js/core/google.js',
  './js/features/day.js', './js/features/settings.js', './js/features/progress.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const asset of ASSETS) {
      const response = await fetch(new Request(asset, { cache: 'reload' }));
      if (response.ok) await cache.put(asset, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(new Request(event.request, { cache: 'no-store' }));
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    }
  })());
});
