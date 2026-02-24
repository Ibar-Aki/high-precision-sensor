import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function createStaticServer(rootDir) {
  return createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(reqUrl.pathname);
      if (pathname === '/') pathname = '/index.html';

      const filePath = path.resolve(rootDir, `.${pathname}`);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const body = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function launchTestBrowser() {
  const requestedChannel = (process.env.PLAYWRIGHT_CHANNEL ?? '').trim();
  if (!requestedChannel) {
    return chromium.launch({ headless: true });
  }

  try {
    return await chromium.launch({
      headless: true,
      channel: requestedChannel
    });
  } catch (error) {
    console.warn(`PLAYWRIGHT_CHANNEL=${requestedChannel} の起動に失敗したため、デフォルトブラウザへフォールバックします。`);
    console.warn(error?.message ?? error);
    return chromium.launch({ headless: true });
  }
}

async function run() {
  const server = createStaticServer(projectRoot);
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(address.port);
    });
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await launchTestBrowser();

  const context = await browser.newContext();
  const externalFontRequests = [];
  context.on('request', (request) => {
    const url = request.url();
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      externalFontRequests.push(url);
    }
  });

  await context.addInitScript(() => {
    window.__deviceOrientationListenerCount = 0;
    const originalAddEventListener = window.addEventListener.bind(window);
    window.addEventListener = function patchedAddEventListener(type, listener, options) {
      if (type === 'deviceorientation') {
        window.__deviceOrientationListenerCount += 1;
      }
      return originalAddEventListener(type, listener, options);
    };

    class MockDeviceOrientationEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.beta = init.beta ?? null;
        this.gamma = init.gamma ?? null;
      }

      static async requestPermission() {
        await new Promise((resolve) => {
          setTimeout(resolve, 120);
        });
        return 'granted';
      }
    }

    Object.defineProperty(window, 'DeviceOrientationEvent', {
      value: MockDeviceOrientationEvent,
      configurable: true,
      writable: true
    });
  });

  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg);
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await fetch('/docs/INDEX.md');
    });

    const cachePaths = await page.evaluate(async () => {
      const cache = await caches.open('tilt-sensor-v6-static');
      const keys = await cache.keys();
      return keys.map((req) => new URL(req.url).pathname);
    });
    const requiredAssets = [
      '/index.html',
      '/assets/css/style.css',
      '/assets/js/app.js',
      '/assets/js/modules/SensorEngine.js',
      '/assets/js/modules/AudioEngine.js',
      '/assets/js/modules/UIManager.js',
      '/assets/js/modules/DataLogger.js',
      '/assets/js/modules/KalmanFilter1D.js',
      '/assets/js/modules/HybridStaticUtils.js',
      '/shared/js/KalmanFilter1D.js',
      '/shared/js/HybridStaticUtils.js',
      '/assets/js/modules/SettingsManager.js',
      '/assets/js/modules/SoundSettingsVisibility.js',
      '/assets/icons/icon-192.svg',
      '/assets/icons/icon-512.svg',
      '/manifest.json'
    ];
    requiredAssets.forEach((asset) => {
      assert(cachePaths.includes(asset), `ServiceWorkerキャッシュ不足: ${asset}`);
    });
    assert(!cachePaths.includes('/docs/INDEX.md'), '非対象ファイルがServiceWorkerキャッシュされています: /docs/INDEX.md');

    await page.click('#btn-start');
    await page.click('#btn-start');
    await page.waitForSelector('#main-screen.active', { timeout: 5000 });
    const twoPointButton = await page.$('#btn-calibrate-2pt');
    assert(Boolean(twoPointButton), '2点キャリブレーションボタンの描画に失敗しました');
    const deviceOrientationListenerCount = await page.evaluate(() => window.__deviceOrientationListenerCount || 0);
    assert(deviceOrientationListenerCount === 1, `start多重実行でdeviceorientation listenerが重複登録されました: ${deviceOrientationListenerCount}`);

    await page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0.4, gamma: 0.2 }));
    });
    await page.waitForTimeout(100);
    const activeStatus = await page.textContent('#sensor-status .status-text');
    assert(activeStatus?.includes('計測中'), '起動直後のステータスが計測中ではありません');

    await page.evaluate(() => {
      for (let i = 0; i < 120; i++) {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0.4, gamma: 0.2 }));
      }
    });
    await page.waitForTimeout(120);
    const staticStatus = await page.textContent('#sensor-status .status-text');
    assert(
      staticStatus?.includes('安定化中') || staticStatus?.includes('確定値'),
      `静止モード遷移を確認できません: ${staticStatus}`
    );

    await page.waitForTimeout(1200);
    const lostStatus = await page.textContent('#sensor-status .status-text');
    assert(lostStatus?.includes('センサー信号待ち'), 'センサー欠損時ステータス遷移に失敗しました');

    await page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0.1, gamma: -0.2 }));
    });
    await page.waitForTimeout(150);
    const recoveredStatus = await page.textContent('#sensor-status .status-text');
    assert(!recoveredStatus?.includes('センサー信号待ち'), 'センサー復帰時ステータス遷移に失敗しました');

    await page.evaluate(() => {
      const originalSetItem = Storage.prototype.setItem;
      window.__quotaSetItemCalls = 0;
      Storage.prototype.setItem = function setItemWithQuotaError(key, value) {
        if (key === 'tilt-sensor-settings') {
          window.__quotaSetItemCalls += 1;
          const err = new Error('quota');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await page.evaluate(() => {
      const slider = document.getElementById('deadzone');
      slider.value = '0.01';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    await page.waitForFunction(() => {
      const toast = document.getElementById('toast');
      return toast && toast.textContent.includes('設定の保存に失敗');
    }, null, { timeout: 5000 });
    const quotaSetItemCalls = await page.evaluate(() => window.__quotaSetItemCalls || 0);
    assert(quotaSetItemCalls > 0, '保存失敗テストで localStorage.setItem が呼ばれていません');

    await context.setOffline(true);
    const offlinePage = await context.newPage();
    await offlinePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const hasStartButton = await offlinePage.$('#btn-start');
    assert(Boolean(hasStartButton), 'オフライン起動時にメインHTMLの描画に失敗しました');
    await offlinePage.close();

    assert(externalFontRequests.length === 0, `外部フォントへのアクセスが発生: ${externalFontRequests.join(', ')}`);

    const results = {
      url: baseUrl,
      checks: {
        serviceWorkerCache: 'pass',
        startIdempotency: 'pass',
        sensorLossRecovery: 'pass',
        settingsSaveErrorToast: 'pass',
        offlineBoot: 'pass',
        externalFontsDisabled: 'pass'
      },
      externalFontRequests
    };
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
