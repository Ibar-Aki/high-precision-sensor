const CACHE_VERSION = 'table-level-v1.1.1';
const CACHE_PREFIX = 'table-level-';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/sensor.js',
  './assets/js/kalman.js',
  './assets/js/hybrid-static-utils.js',
  '../shared/js/KalmanFilter1D.js',
  '../shared/js/HybridStaticUtils.js',
  './assets/js/calculator.js',
  './assets/js/voice.js',
  './assets/js/i18n.js',
  './assets/js/settings.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        // 同一アプリの旧バージョンのみ削除する
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isHtml = request.headers.get('accept')?.includes('text/html');

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const cloned = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(async () => {
          const cacheHit = await caches.match(request);
          if (cacheHit) return cacheHit;
          return caches.match('./offline.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cacheHit) => {
      if (cacheHit) return cacheHit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const cloned = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
        }
        return response;
      });
    })
  );
});
