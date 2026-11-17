// Finds (or downloads) the two programs we need: FFmpeg and yt-dlp.
//
// - On a VPS / Docker they are installed normally, so we just use them.
// - On managed hosting (like Hostinger Business/Cloud Node.js) we cannot
//   install programs. Then:
//     * FFmpeg comes from the "ffmpeg-static" npm package.
//     * yt-dlp is downloaded once as a single-file program into ./bin,
//       and updated once a day (sites change often).

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { runProcess } = require('./runProcess');

const ONE_DAY = 24 * 60 * 60 * 1000;

// Is a program available in the system PATH?
function findOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK);
      return path.join(dir, name);
    } catch {
      /* not here */
    }
  }
  return null;
}

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (findOnPath('ffmpeg')) return 'ffmpeg';
  try {
    const p = require('ffmpeg-static'); // optional package
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* not installed */
  }
  return 'ffmpeg';
}

// The single-file yt-dlp build for this computer type (no Python needed).
function ytdlpDownloadUrl() {
  const file = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${file}`;
}

async function downloadYtdlp(target) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const res = await fetch(ytdlpDownloadUrl(), { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const tmp = `${target}.part`;
  await fsp.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await fsp.chmod(tmp, 0o755);
  await fsp.rename(tmp, target); // swap in one step, so a running job is never broken
}

async function updateYtdlp(bin) {
  const r = await runProcess(bin, ['-U'], { timeoutMs: 180000, collectStdout: true });
  logger.info('yt-dlp update check', { ok: r.code === 0 });
}

// Called once when the server starts. Sets config.ffmpegPath / config.ytdlpPath.
async function setupTools() {
  config.ffmpegPath = resolveFfmpeg();

  if (process.env.YTDLP_PATH) {
    config.ytdlpPath = process.env.YTDLP_PATH;
  } else if (findOnPath('yt-dlp')) {
    config.ytdlpPath = 'yt-dlp';
  } else {
    // Managed hosting: use our own copy in ./bin
    const bin = path.join(config.toolsDir, 'yt-dlp');
    config.ytdlpPath = bin;
    let stat = null;
    try {
      stat = await fsp.stat(bin);
    } catch {
      /* not downloaded yet */
    }
    try {
      if (!stat) {
        logger.info('downloading yt-dlp');
        await downloadYtdlp(bin);
      } else if (Date.now() - stat.mtimeMs > ONE_DAY) {
        await updateYtdlp(bin);
      }
    } catch (err) {
      logger.error('could not get yt-dlp', { error: err.message });
    }
    // Check for a new version once a day.
    setInterval(() => updateYtdlp(bin).catch(() => {}), ONE_DAY).unref();
  }

  const version = await runProcess(config.ytdlpPath, ['--version'], { timeoutMs: 30000, collectStdout: true }).catch(() => null);
  logger.info('tools ready', {
    ytdlp: version && version.code === 0 ? version.stdout.trim() : 'MISSING',
    ffmpeg: config.ffmpegPath === 'ffmpeg' ? 'system' : 'bundled',
  });
}

module.exports = { setupTools, findOnPath };
