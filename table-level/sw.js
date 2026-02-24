const CACHE_VERSION = 'table-level-v1.1.2';
const CACHE_PREFIX = 'table-level-';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SCOPE_URL = new URL(self.registration.scope);
const SCOPE_PATH = SCOPE_URL.pathname.endsWith('/') ? SCOPE_URL.pathname : `${SCOPE_URL.pathname}/`;
const OFFLINE_URL = new URL('./offline.html', SCOPE_URL).toString();

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
const CACHEABLE_EXACT_PATHS = new Set([
  SCOPE_PATH,
  new URL('./index.html', SCOPE_URL).pathname,
  new URL('./offline.html', SCOPE_URL).pathname,
  new URL('./manifest.json', SCOPE_URL).pathname
]);
const CACHEABLE_PREFIX_PATHS = [
  new URL('./assets/', SCOPE_URL).pathname,
  new URL('../shared/', SCOPE_URL).pathname
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

  const isHtml = request.mode === 'navigate' || request.destination === 'document' || request.headers.get('accept')?.includes('text/html');

  if (isHtml) {
    event.respondWith(networkFirstHtml(request, url));
    return;
  }

  if (!isCacheableAssetPath(url.pathname)) return;

  event.respondWith(cacheFirstAsset(request));
});

function isCacheableAssetPath(pathname) {
  if (CACHEABLE_EXACT_PATHS.has(pathname)) return true;
  return CACHEABLE_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));
}

async function networkFirstHtml(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && url.pathname.startsWith(SCOPE_PATH)) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cacheHit = await caches.match(request, { ignoreSearch: true });
    if (cacheHit) return cacheHit;
    const offlineFallback = await caches.match(OFFLINE_URL);
    if (offlineFallback) return offlineFallback;
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirstAsset(request) {
  const cacheHit = await caches.match(request, { ignoreSearch: true });
  if (cacheHit) return cacheHit;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw new Error('network_error');
  }
}
