import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function toIsoUtcWithoutMillis(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toJstString(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} JST`;
}

function getShortCommit() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'unknown';
  }
}

async function main() {
  const now = new Date();
  const updatedAtUtc = toIsoUtcWithoutMillis(now);
  const updatedAtJst = toJstString(now);
  const commit = getShortCommit();

  const versionJson = {
    updatedAtUtc,
    updatedAtJst,
    commit
  };

  const buildInfoSource = `export const CURRENT_UPDATED_AT_UTC = '${updatedAtUtc}';
export const CURRENT_UPDATED_AT_JST = '${updatedAtJst}';
export const CURRENT_COMMIT = '${commit}';
`;

  await writeFile(
    path.join(projectRoot, 'version.json'),
    `${JSON.stringify(versionJson, null, 2)}\n`,
    'utf8'
  );

  await writeFile(
    path.join(projectRoot, 'shared', 'js', 'BuildInfo.js'),
    buildInfoSource,
    'utf8'
  );

  process.stdout.write(`Stamped version metadata: ${updatedAtJst} (${commit})\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
