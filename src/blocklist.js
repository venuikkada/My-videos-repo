// Blocklist for takedown requests.
// When a copyright owner reports content and you agree, add a line to
// data/blocklist.txt like:
//     youtube:dQw4w9WgXcQ
//     instagram:C1a2B3c4D5e
// The site will then refuse that video. The file is re-read every minute,
// so no restart is needed.

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const file = path.join(config.dataDir, 'blocklist.txt');
let blocked = new Set();
let lastMtime = 0;

function load() {
  try {
    const stat = fs.statSync(file);
    if (stat.mtimeMs === lastMtime) return;
    lastMtime = stat.mtimeMs;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    blocked = new Set(
      lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(normalize)
    );
    logger.info('blocklist loaded', { entries: blocked.size });
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn('could not read blocklist', { error: err.message });
  }
}

// "YouTube:AbC" -> "youtube:AbC" (platform lowercase, ID kept as-is
// because video IDs are case-sensitive).
function normalize(line) {
  const i = line.indexOf(':');
  return i === -1 ? line : line.slice(0, i).toLowerCase() + line.slice(i);
}

function isBlocked(platform, id) {
  if (!id) return false;
  return blocked.has(`${platform}:${id}`);
}

load();
setInterval(load, 60 * 1000).unref();

module.exports = { isBlocked, reload: load };
