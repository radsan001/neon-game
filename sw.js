const CACHE_NAME = 'cosmic-gem-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './icon.svg',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Best effort caching so it doesn't fail if matter.js is blocked by CORS/offline
      return Promise.allSettled(
        ASSETS.map(asset => cache.add(asset).catch(e => console.warn('Cache add failed', asset, e)))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
