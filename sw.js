/**
 * Service Worker - 高精度傾斜角センサー PWA
 * オフラインキャッシュ（キャッシュファースト戦略）
 */

const CACHE_NAME = 'tilt-sensor-v4';
const CACHE_PREFIX = 'tilt-sensor-';
const ASSETS = [
    './',
    './index.html',
    './assets/css/style.css',
    './assets/js/app.js',
    './assets/js/modules/SensorEngine.js',
    './assets/js/modules/AudioEngine.js',
    './assets/js/modules/UIManager.js',
    './assets/js/modules/DataLogger.js',
    './assets/js/modules/KalmanFilter1D.js',
    './shared/js/KalmanFilter1D.js',
    './assets/js/modules/SettingsManager.js',
    './assets/js/modules/ToastManager.js',
    './assets/js/modules/LifecycleManager.js',
    './assets/js/modules/AppEventBinder.js',
    './assets/icons/icon-192.svg',
    './assets/icons/icon-512.svg',
    './manifest.json'
];

// インストール: 全アセットをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    // 同一アプリの旧バージョンのみ削除する
                    .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// フェッチ: キャッシュファースト → ネットワークフォールバック
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request))
    );
});
