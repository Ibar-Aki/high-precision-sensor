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
      if (pathname.endsWith('/')) pathname += 'index.html';

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
  const baseUrl = `http://127.0.0.1:${port}/table-level/`;

  const browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });

  await context.addInitScript(() => {
    class MockDeviceOrientationEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.beta = init.beta ?? null;
        this.gamma = init.gamma ?? null;
      }

      static async requestPermission() {
        return 'granted';
      }
    }

    Object.defineProperty(window, 'DeviceOrientationEvent', {
      value: MockDeviceOrientationEvent,
      configurable: true,
      writable: true
    });

    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        cancel() { },
        speak() { }
      },
      configurable: true,
      writable: true
    });

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class MockSpeechSynthesisUtterance {
        constructor(text) {
          this.text = text;
          this.lang = '';
          this.volume = 1;
          this.rate = 1;
          this.pitch = 1;
        }
      },
      configurable: true,
      writable: true
    });
  });

  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/table-level/');
      return Boolean(reg);
    });
    await page.reload({ waitUntil: 'networkidle' });

    const cacheInfo = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const activeName = cacheNames.find((name) => name.startsWith('table-level-') && name.endsWith('-static'));
      if (!activeName) {
        return { activeName: null, paths: [] };
      }
      const cache = await caches.open(activeName);
      const keys = await cache.keys();
      return {
        activeName,
        paths: keys.map((request) => new URL(request.url).pathname)
      };
    });

    assert(Boolean(cacheInfo.activeName), 'table-level ServiceWorker キャッシュが見つかりません');
    const requiredAssets = [
      '/table-level/index.html',
      '/table-level/offline.html',
      '/table-level/assets/css/style.css',
      '/table-level/assets/js/app.js',
      '/table-level/assets/js/sensor.js',
      '/table-level/assets/js/kalman.js',
      '/table-level/assets/js/hybrid-static-utils.js',
      '/shared/js/KalmanFilter1D.js',
      '/shared/js/HybridStaticUtils.js',
      '/table-level/assets/js/calculator.js',
      '/table-level/assets/js/voice.js',
      '/table-level/assets/js/i18n.js',
      '/table-level/assets/js/settings.js'
    ];
    requiredAssets.forEach((asset) => {
      assert(cacheInfo.paths.includes(asset), `table-level ServiceWorkerキャッシュ不足: ${asset}`);
    });

    await page.click('#enable-sensor-btn');
    await page.waitForSelector('#app-screen.screen.active', { timeout: 5000 });

    await page.click('#start-measure-btn');
    await page.evaluate(() => {
      for (let i = 0; i < 220; i++) {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 1.0, gamma: -0.6 }));
      }
    });
    await page.waitForFunction(() => {
      const mode = document.getElementById('measurement-mode');
      return mode && mode.textContent === 'measuring';
    }, null, { timeout: 7000 });

    await page.waitForFunction(() => {
      const status = document.getElementById('status-text');
      return Boolean(status?.textContent?.includes('調整指示'));
    }, null, { timeout: 7000 });

    await page.fill('#measurement-timeout-sec', '1');
    await page.click('#save-settings-btn');
    await page.click('#remeasure-btn');
    await page.evaluate(() => {
      for (let i = 0; i < 40; i++) {
        const beta = i % 2 === 0 ? 2.0 : -2.0;
        const gamma = i % 3 === 0 ? 1.2 : -1.2;
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta, gamma }));
      }
    });
    await page.waitForTimeout(1300);
    await page.waitForFunction(() => {
      const button = document.getElementById('manual-confirm-btn');
      return button && getComputedStyle(button).display !== 'none';
    }, null, { timeout: 5000 });
    await page.click('#manual-confirm-btn');
    await page.waitForFunction(() => {
      const status = document.getElementById('status-text');
      return Boolean(status?.textContent?.includes('手動確定'));
    }, null, { timeout: 5000 });

    await context.setOffline(true);
    const offlinePage = await context.newPage();
    await offlinePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const hasEnableSensorButton = await offlinePage.$('#enable-sensor-btn');
    assert(Boolean(hasEnableSensorButton), 'table-level オフライン起動に失敗しました');
    await offlinePage.close();

    const results = {
      url: baseUrl,
      checks: {
        serviceWorkerCache: 'pass',
        autoFinalizeMeasurement: 'pass',
        manualFinalizeMeasurement: 'pass',
        offlineBoot: 'pass'
      }
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
