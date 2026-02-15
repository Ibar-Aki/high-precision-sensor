/**
 * Service Worker - 高精度傾斜角センサー PWA
 * オフラインキャッシュ（キャッシュファースト戦略）
 */

const CACHE_NAME = 'tilt-sensor-v2';
const ASSETS = [
    './',
    './index.html',
    './assets/css/style.css',
    './assets/js/app.js',
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
                    .filter(key => key !== CACHE_NAME)
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

    // Google Fonts などの外部リソースはネットワーク優先
    if (!event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request))
    );
});
