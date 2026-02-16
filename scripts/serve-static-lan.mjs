import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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

function parseArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function getLanIpv4() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const netName of Object.keys(nets)) {
    for (const info of nets[netName] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

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

const host = parseArg('--host', '0.0.0.0');
const port = Number.parseInt(parseArg('--port', '4173'), 10);

const server = createStaticServer(projectRoot);
server.listen(port, host, () => {
  console.log(`[serve:iphone] listening on http://${host}:${port}`);
  console.log(`[serve:iphone] local: http://localhost:${port}`);
  for (const ip of getLanIpv4()) {
    console.log(`[serve:iphone] lan: http://${ip}:${port}`);
  }
  console.log('[serve:iphone] iPhone実機テストは HTTPS が必要です。単体起動時は別ターミナルで `npm run tunnel:iphone` を実行してください。');
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
