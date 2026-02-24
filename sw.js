const CACHE_VERSION = 'tilt-sensor-v6';
const CACHE_PREFIX = 'tilt-sensor-';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SCOPE_URL = new URL(self.registration.scope);
const SCOPE_PATH = SCOPE_URL.pathname.endsWith('/') ? SCOPE_URL.pathname : `${SCOPE_URL.pathname}/`;
const INDEX_URL = new URL('./index.html', SCOPE_URL).toString();
const APP_SHELL = [
    './',
    './index.html',
    './assets/css/style.css',
    './assets/js/app.js',
    './assets/js/modules/SensorEngine.js',
    './assets/js/modules/AudioEngine.js',
    './assets/js/modules/UIManager.js',
    './assets/js/modules/DataLogger.js',
    './assets/js/modules/KalmanFilter1D.js',
    './assets/js/modules/HybridStaticUtils.js',
    './shared/js/KalmanFilter1D.js',
    './shared/js/HybridStaticUtils.js',
    './assets/js/modules/SettingsManager.js',
    './assets/js/modules/ToastManager.js',
    './assets/js/modules/LifecycleManager.js',
    './assets/js/modules/AppEventBinder.js',
    './assets/js/modules/SoundSettingsVisibility.js',
    './assets/icons/icon-192.svg',
    './assets/icons/icon-512.svg',
    './manifest.json'
];
const CACHEABLE_EXACT_PATHS = new Set([
    SCOPE_PATH,
    new URL('./index.html', SCOPE_URL).pathname,
    new URL('./manifest.json', SCOPE_URL).pathname
]);
const CACHEABLE_PREFIX_PATHS = [
    new URL('./assets/', SCOPE_URL).pathname,
    new URL('./shared/', SCOPE_URL).pathname
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    // 同一アプリの旧バージョンのみ削除する
                    .filter(key => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
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

    if (!isCacheableAssetPath(url.pathname)) {
        return;
    }

    event.respondWith(cacheFirstAsset(request));
});

function isCacheableAssetPath(pathname) {
    if (CACHEABLE_EXACT_PATHS.has(pathname)) return true;
    return CACHEABLE_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function isTopLevelHtmlPath(pathname) {
    if (SCOPE_PATH === '/') {
        return pathname === '/' || pathname === '/index.html';
    }
    return pathname === SCOPE_PATH || pathname === `${SCOPE_PATH}index.html`;
}

async function networkFirstHtml(request, url) {
    try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic' && isTopLevelHtmlPath(url.pathname)) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cacheHit = await caches.match(request, { ignoreSearch: true });
        if (cacheHit) return cacheHit;
        if (isTopLevelHtmlPath(url.pathname)) {
            const indexFallback = await caches.match(INDEX_URL);
            if (indexFallback) return indexFallback;
        }
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
