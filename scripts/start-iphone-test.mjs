import { spawn } from 'node:child_process';
import process from 'node:process';

function parseArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const port = parseArg('--port', '4173');

const server = spawn(
  process.execPath,
  ['scripts/serve-static-lan.mjs', '--host', '0.0.0.0', '--port', String(port)],
  { stdio: ['inherit', 'pipe', 'pipe'] }
);

const tunnel = spawn(
  'npx',
  ['--yes', 'localtunnel', '--port', String(port)],
  { shell: true, stdio: ['inherit', 'pipe', 'pipe'] }
);

server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));
tunnel.stderr.on('data', (d) => process.stderr.write(d));

let announced = false;
tunnel.stdout.on('data', (d) => {
  const text = d.toString();
  process.stdout.write(text);
  const m = text.match(/https?:\/\/[^\s]+/);
  if (m && !announced) {
    announced = true;
    console.log(`\n[iPhone Test URL] ${m[0]}\n`);
  }
});

function stopAll(code = 0) {
  if (!server.killed) server.kill('SIGINT');
  if (!tunnel.killed) tunnel.kill('SIGINT');
  setTimeout(() => process.exit(code), 150);
}

server.on('exit', () => stopAll(0));
tunnel.on('exit', () => stopAll(0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
