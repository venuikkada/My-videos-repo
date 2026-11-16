// Talks to yt-dlp: reads video info and downloads single streams.

const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { runProcess } = require('./runProcess');
const { AppError, friendlyYtdlpError } = require('./errors');
const { YTDLP_EXTRACTORS } = require('./platforms');

// Options used for every yt-dlp call.
function baseArgs() {
  const args = [
    '--ignore-config', // never read config files from the server
    '--no-playlist', // one video only
    '--use-extractors', YTDLP_EXTRACTORS.join(','), // only our 4 platforms
    '--socket-timeout', '20',
    '--retries', '3',
  ];
  if (config.ytdlpJsRuntime) args.push('--js-runtimes', config.ytdlpJsRuntime);
  return args;
}

/**
 * Get title, thumbnail, duration and formats for a clean link.
 * Returns the parsed yt-dlp JSON (one video).
 */
async function getInfo(url) {
  const args = [...baseArgs(), '--dump-single-json', '--skip-download', '--', url];
  let result;
  try {
    result = await runProcess(config.ytdlpPath, args, {
      timeoutMs: config.infoTimeoutSeconds * 1000,
      collectStdout: true,
    });
  } catch (err) {
    if (err.startFailed) throw new AppError(500, 'SERVER_SETUP', 'The server is missing yt-dlp. Please tell the site owner.');
    throw err;
  }

  if (result.killedReason === 'timeout') {
    throw new AppError(504, 'TIMEOUT', 'The video site took too long to answer. Please try again.');
  }
  if (result.code !== 0) throw friendlyYtdlpError(result.stderr);

  let info;
  try {
    info = JSON.parse(result.stdout);
  } catch {
    throw new AppError(502, 'EXTRACT_FAILED', 'We could not read this video. Please try again.');
  }

  // Posts with many items (like an Instagram carousel) come back as a list.
  // We use the first item that is a video.
  if (info && info._type === 'playlist') {
    const entries = Array.isArray(info.entries) ? info.entries : [];
    const index = entries.findIndex((e) => e && Array.isArray(e.formats) && e.formats.some((f) => f.vcodec && f.vcodec !== 'none'));
    if (index === -1) throw new AppError(422, 'NO_VIDEO', 'We could not find a video in this post. It may be a photo post.');
    const entry = entries[index];
    entry.title = entry.title || info.title;
    entry.thumbnail = entry.thumbnail || info.thumbnail;
    entry._playlistItem = index + 1;
    info = entry;
  }

  if (!info || !Array.isArray(info.formats) || info.formats.length === 0) {
    throw new AppError(422, 'NO_VIDEO', 'We could not find a video at this link.');
  }
  return info;
}

/**
 * Download ONE stream (a video stream, an audio stream, or a combined one).
 * - selector: yt-dlp format selector, e.g. "137/bv*[height<=1080]"
 * - outBase: file path without extension; yt-dlp adds the real extension
 * - onProgress(fraction 0..1)
 * Returns the full path of the downloaded file.
 */
async function downloadStream({ url, selector, outBase, playlistItem, signal, onProgress }) {
  const args = [
    ...baseArgs(),
    '--format', selector,
    '--output', `${outBase}.%(ext)s`,
    '--no-part',
    '--no-mtime',
    '--max-filesize', String(config.maxFileSizeBytes),
    '--newline',
    '--progress-template',
    'download:DLPROG %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s',
  ];
  if (playlistItem) {
    // For multi-item posts, pick the same item we showed the user.
    args.splice(args.indexOf('--no-playlist'), 1);
    args.push('--yes-playlist', '--playlist-items', String(playlistItem));
  }
  args.push('--', url);

  let tooLarge = false;
  const result = await runProcess(config.ytdlpPath, args, {
    signal,
    onLine(line) {
      if (/larger than max-filesize/i.test(line)) tooLarge = true;
      const m = line.match(/^DLPROG (\d+) (\d+(?:\.\d+)?)/);
      if (m && onProgress) {
        const done = Number(m[1]);
        const total = Number(m[2]);
        if (total > 0) onProgress(Math.min(1, done / total));
      }
    },
  });

  if (result.killedReason) throw new AppError(504, 'TIMEOUT', 'The download took too long and was stopped.');
  if (result.code !== 0) throw friendlyYtdlpError(result.stderr);
  if (tooLarge) throw new AppError(413, 'TOO_LARGE', `This file is bigger than our ${config.maxFileSizeMb} MB limit.`);

  // Find the file yt-dlp created (we only know the extension now).
  const dir = path.dirname(outBase);
  const prefix = path.basename(outBase) + '.';
  const files = (await fs.readdir(dir)).filter((f) => f.startsWith(prefix));
  if (files.length === 0) {
    // yt-dlp skips files that are over --max-filesize without failing.
    if (tooLarge) {
      throw new AppError(413, 'TOO_LARGE', `This file is bigger than our ${config.maxFileSizeMb} MB limit.`);
    }
    throw new AppError(502, 'DOWNLOAD_FAILED', 'The download did not finish. Please try again.');
  }
  return path.join(dir, files[0]);
}

module.exports = { getInfo, downloadStream };
