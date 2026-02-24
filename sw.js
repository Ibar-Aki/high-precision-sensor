const CACHE_VERSION = 'tilt-sensor-v6';
const CACHE_PREFIX = 'tilt-sensor-';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
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
    '/shared/js/KalmanFilter1D.js',
    '/shared/js/HybridStaticUtils.js',
    './assets/js/modules/SettingsManager.js',
    './assets/js/modules/ToastManager.js',
    './assets/js/modules/LifecycleManager.js',
    './assets/js/modules/AppEventBinder.js',
    './assets/js/modules/SoundSettingsVisibility.js',
    './assets/icons/icon-192.svg',
    './assets/icons/icon-512.svg',
    './manifest.json'
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

    const isHtml = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
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
        return caches.match('./index.html');
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
