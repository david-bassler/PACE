const CACHE = 'pace-v53';
const ASSETS = [
  './', './index.html', './style.css', './shell-v2.css', './manifest.webmanifest', './icon.svg', './icon-maskable.svg',
  './assets/tool-states/01_zu_viel_kommt_rein.png', './assets/tool-states/02_koerper_ist_hochgefahren.png', './assets/tool-states/03_wut_eskalation.png', './assets/tool-states/04_zu_viel_im_kopf.png', './assets/tool-states/05_alles_wirkt_riesig.png', './assets/tool-states/06_zu_viele_moeglichkeiten.png', './assets/tool-states/07_ich_bin_leer.png', './assets/tool-states/08_zu_viel_energie_im_koerper.png', './assets/tool-states/09_unsicher_oder_allein.png', './assets/tool-states/10_blick_verengt.png',
  './vendor/qrcodejs/qrcode.min.js',
  './js/main.js', './js/core/storage.js', './js/core/ui.js', './js/core/google.js', './js/core/google-picker.js', './js/core/sync.js', './js/core/collections.js',
  './js/features/day.js', './js/features/settings.js',
  './js/features/progress.js', './js/features/progress-data.js', './js/features/progress-domain.js',
  './js/features/wellbeing.js', './js/features/wellbeing-data.js', './js/features/wellbeing-domain.js',
  './js/features/space.js', './js/features/share.js',
  './js/features/tracking.js', './js/features/tracking-data.js', './js/features/tracking-domain.js', './js/features/tracking-sheet.js', './js/features/tracking-journal-domain.js', './js/features/tracking-integrity-v2.js', './js/features/tracking-operation-store.js', './js/features/tracking-entry-drafts.js', './js/features/tracking-entry-draft-domain.js',
  './js/features/quick-capture.js', './js/features/quick-capture-domain.js', './js/features/quick-capture-toolbar.js', './js/features/journey-ux.js', './js/features/capture-integrity.js', './js/features/capture-integrity-domain.js',
  './js/features/sun-times.js', './js/features/sun-times-domain.js',
  './js/features/breath.js',
  './js/features/holding.js', './js/features/holding-data.js', './js/features/holding-domain.js',
  './js/features/horizon.js', './js/features/navigation.js',
  './js/features/setup-transfer.js', './js/features/setup-transfer-domain.js'
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