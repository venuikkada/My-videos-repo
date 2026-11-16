// FFmpeg helpers: merge video + audio, convert to MP3 / M4A, fix MP4 files.
// All inputs are file paths inside our own temp folder (never user text).

const config = require('./config');
const { runProcess } = require('./runProcess');
const { AppError } = require('./errors');

// Run ffmpeg and report progress (0..1) using its "-progress" output.
async function runFfmpeg(args, { durationSec, onProgress, signal }) {
  const fullArgs = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', ...args];
  let result;
  try {
    result = await runProcess(config.ffmpegPath, fullArgs, {
      signal,
      onLine(line) {
        // ffmpeg prints lines like "out_time_us=12345678"
        const m = line.match(/^out_time_us=(\d+)/);
        if (m && durationSec > 0 && onProgress) {
          onProgress(Math.min(1, Number(m[1]) / 1e6 / durationSec));
        }
      },
    });
  } catch (err) {
    if (err.startFailed) throw new AppError(500, 'SERVER_SETUP', 'The server is missing FFmpeg. Please tell the site owner.');
    throw err;
  }
  if (result.killedReason) throw new AppError(504, 'TIMEOUT', 'Processing took too long and was stopped.');
  if (result.code !== 0) {
    throw new AppError(500, 'FFMPEG_FAILED', 'We could not process this file. Please try another quality.');
  }
}

// Put a video-only file and an audio-only file together into one MP4.
// The video is COPIED (no re-encoding = fast and cheap for the server).
// Audio is copied if it is already AAC, otherwise converted to AAC,
// because AAC plays everywhere (old Android phones, WhatsApp, etc.).
function mergeToMp4({ videoPath, audioPath, outPath, audioIsAac, durationSec, onProgress, signal }) {
  const args = [
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    ...(audioIsAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
    '-movflags', '+faststart', // lets phones start playing before the full file loads
    '-shortest',
    outPath,
  ];
  return runFfmpeg(args, { durationSec, onProgress, signal });
}

// Change the container of a file that already has video + audio to MP4.
function remuxToMp4({ inPath, outPath, audioIsAac, durationSec, onProgress, signal }) {
  const args = [
    '-i', inPath,
    '-map', '0:v:0',
    '-map', '0:a:0?', // "?" = only if the file has audio
    '-c:v', 'copy',
    ...(audioIsAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
    '-movflags', '+faststart',
    outPath,
  ];
  return runFfmpeg(args, { durationSec, onProgress, signal });
}

// Convert any audio (or video) file to MP3 at the chosen bitrate.
function toMp3({ inPath, outPath, kbps, durationSec, onProgress, signal }) {
  const args = ['-i', inPath, '-vn', '-map', '0:a:0', '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, outPath];
  return runFfmpeg(args, { durationSec, onProgress, signal });
}

// Convert or copy audio into an M4A (AAC) file.
function toM4a({ inPath, outPath, copy, durationSec, onProgress, signal }) {
  const args = [
    '-i', inPath,
    '-vn',
    '-map', '0:a:0',
    ...(copy ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
    '-movflags', '+faststart',
    outPath,
  ];
  return runFfmpeg(args, { durationSec, onProgress, signal });
}

module.exports = { mergeToMp4, remuxToMp4, toMp3, toM4a };
