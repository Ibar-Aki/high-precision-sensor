const CACHE_VERSION = 'table-level-v1.1.2';
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
  '/shared/js/KalmanFilter1D.js',
  '/shared/js/HybridStaticUtils.js',
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
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isHtml = request.headers.get('accept')?.includes('text/html');

  if (isHtml) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cacheHit = await caches.match(request);
    if (cacheHit) return cacheHit;
    return caches.match('./offline.html');
  }
}

async function cacheFirstAsset(request) {
  const cacheHit = await caches.match(request);
  if (cacheHit) return cacheHit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}
