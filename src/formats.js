// Turns yt-dlp's long format list into the simple choices we show:
//   Video: 360p, 480p, 720p, 1080p (only the ones that exist)
//   Audio: MP3 128 / 192 / 320 kbps and M4A
//
// For each choice we also make a private "plan" that the server keeps.
// The browser only sends back the choice name (like "720"), never a raw
// format code, so users cannot ask the server for anything unexpected.

const config = require('./config');

const VIDEO_QUALITIES = [360, 480, 720, 1080];
const MP3_BITRATES = [128, 192, 320];

// "p" value of a video = its short side. So a vertical 1080x1920 Reel is 1080p.
function shortSide(f) {
  if (f.width && f.height) return Math.min(f.width, f.height);
  return f.height || null;
}

// Put odd sizes into the nearest standard bucket (e.g. 406 -> 480p).
function bucketOf(p) {
  if (!p) return null;
  if (p >= 300 && p < 420) return 360;
  if (p >= 420 && p < 600) return 480;
  if (p >= 600 && p < 900) return 720;
  if (p >= 900 && p < 1300) return 1080;
  return null; // too small or bigger than 1080p
}

// Some sites (often Facebook) don't say the codec. A video file type is enough.
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'flv'];
const hasVideo = (f) => f.vcodec !== 'none' && Boolean(f.vcodec || f.height || f.width || VIDEO_EXTS.includes(f.ext));
// "undefined" acodec means "unknown" - we treat it as "probably has audio".
const hasAudio = (f) => f.acodec !== 'none';
const isAac = (codec) => /^mp4a|aac/i.test(codec || '');

// Rough size in bytes (exact if the site tells us, else an estimate).
function sizeOf(f, duration) {
  if (!f) return 0;
  if (f.filesize) return f.filesize;
  if (f.filesize_approx) return f.filesize_approx;
  if (f.tbr && duration) return Math.round((f.tbr * 1000 * duration) / 8);
  return 0;
}

// Higher score = better choice for cheap Android phones.
function videoScore(f) {
  let score = 0;
  const v = f.vcodec || '';
  if (/^avc1|h264/i.test(v)) score += 3000; // H.264 plays on every phone
  else if (/^vp0?9/i.test(v)) score += 2000;
  else if (/^av01/i.test(v)) score += 1000;
  if (f.ext === 'mp4') score += 500;
  if (!/m3u8/.test(f.protocol || '')) score += 200; // direct files are more reliable
  score += Math.min(f.tbr || 0, 199); // then higher bitrate
  return score;
}

const usable = (f) =>
  f && f.format_id && !f.has_drm && f.ext !== 'mhtml' && !/storyboard/i.test(f.format_note || '');

function pickBest(list, scoreFn) {
  let best = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const s = scoreFn(f);
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
  return best;
}

function formatBytes(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Build public choices + private plans from yt-dlp info.
 * Returns { video: [...], audio: [...], plans: { "720": {...}, "mp3-192": {...} } }
 */
function buildOptions(info) {
  const duration = info.duration || 0;
  const formats = (info.formats || []).filter(usable);

  const videoFormats = formats.filter(hasVideo);
  const audioOnly = formats.filter((f) => hasAudio(f) && f.vcodec === 'none' && f.acodec);

  // Best audio to put next to a silent video: AAC first (can be copied), then bitrate.
  const audioForMerge = pickBest(audioOnly, (f) => (isAac(f.acodec) ? 1000 : 0) + (f.abr || f.tbr || 0));
  // Best audio for MP3: simply the highest bitrate.
  const audioForMp3 = pickBest(audioOnly, (f) => f.abr || f.tbr || 0);
  // For M4A: an AAC stream if one exists (no quality loss), else the best one.
  const aacOnly = audioOnly.filter((f) => isAac(f.acodec));
  const audioForM4a = aacOnly.length ? pickBest(aacOnly, (f) => f.abr || f.tbr || 0) : audioForMp3;

  // If there is no audio-only stream, take audio from the smallest video that has sound.
  const combined = videoFormats.filter((f) => hasAudio(f));
  const combinedForAudio = pickBest(combined, (f) => -(sizeOf(f, duration) || f.tbr || 0));

  const plans = {};
  const video = [];

  for (const q of VIDEO_QUALITIES) {
    const candidates = videoFormats.filter((f) => bucketOf(shortSide(f)) === q);
    const chosen = pickBest(candidates, videoScore);
    if (!chosen) continue;

    const needsMerge = chosen.acodec === 'none';
    if (needsMerge && !audioForMerge) continue; // can't give a video without sound

    const size = sizeOf(chosen, duration) + (needsMerge ? sizeOf(audioForMerge, duration) : 0);
    plans[String(q)] = {
      type: 'video',
      videoFormat: chosen.format_id,
      videoExt: chosen.ext,
      audioFormat: needsMerge ? audioForMerge.format_id : null,
      audioIsAac: needsMerge ? isAac(audioForMerge.acodec) : isAac(chosen.acodec),
      size,
    };
    video.push({ quality: String(q), label: `${q}p`, size: size || null, sizeText: formatBytes(size) });
  }

  // Some posts (often Facebook) don't say their resolution. Offer one "Best" option.
  if (video.length === 0 && videoFormats.length > 0) {
    const best = pickBest(videoFormats, (f) => (hasAudio(f) ? 10000 : 0) + videoScore(f));
    const needsMerge = best.acodec === 'none' && audioForMerge;
    const size = sizeOf(best, duration) + (needsMerge ? sizeOf(audioForMerge, duration) : 0);
    plans.best = {
      type: 'video',
      videoFormat: best.format_id,
      videoExt: best.ext,
      audioFormat: needsMerge ? audioForMerge.format_id : null,
      audioIsAac: needsMerge ? isAac(audioForMerge.acodec) : isAac(best.acodec),
      size,
    };
    video.push({ quality: 'best', label: 'Best quality', size: size || null, sizeText: formatBytes(size) });
  }

  // Audio choices
  const audio = [];
  const mp3Source = audioForMp3 || combinedForAudio;
  if (mp3Source) {
    for (const kbps of MP3_BITRATES) {
      const size = duration ? Math.round((kbps * 1000 * duration) / 8) : 0;
      plans[`mp3-${kbps}`] = { type: 'audio', format: 'mp3', kbps, sourceFormat: mp3Source.format_id, size };
      audio.push({ quality: `mp3-${kbps}`, label: `MP3 · ${kbps} kbps`, size: size || null, sizeText: formatBytes(size) });
    }
  }
  const m4aSource = audioForM4a || combinedForAudio;
  if (m4aSource) {
    const copy = isAac(m4aSource.acodec) && m4aSource.vcodec === 'none';
    const size = copy ? sizeOf(m4aSource, duration) : duration ? Math.round((192 * 1000 * duration) / 8) : 0;
    plans.m4a = { type: 'audio', format: 'm4a', copy, sourceFormat: m4aSource.format_id, size };
    audio.push({ quality: 'm4a', label: 'M4A (AAC)', size: size || null, sizeText: formatBytes(size) });
  }

  // Mark choices that are over our size limit so the page can disable them.
  for (const list of [video, audio]) {
    for (const opt of list) {
      opt.tooLarge = Boolean(opt.size && opt.size > config.maxFileSizeBytes);
    }
  }

  return { video, audio, plans };
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

module.exports = { buildOptions, formatDuration, formatBytes, bucketOf, shortSide };
