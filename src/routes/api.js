// The API used by the website:
//   POST /api/info       -> title, thumbnail, duration, choices
//   POST /api/jobs       -> start a download job, returns job ID
//   GET  /api/jobs/:id   -> job status and progress
//   GET  /api/files/:id  -> the finished file
// Plus two helpers: GET /api/thumb/:token and POST /api/report

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const config = require('../config');
const logger = require('../logger');
const { AppError } = require('../errors');
const { normalizeLink, PLATFORM_NAMES } = require('../platforms');
const ytdlp = require('../ytdlp');
const { buildOptions, formatDuration } = require('../formats');
const infoCache = require('../infoCache');
const blocklist = require('../blocklist');
const jobs = require('../jobs');
const tools = require('../tools');

const router = express.Router();

// ---------- Rate limits ----------
// We never store raw IPs. The limiter only keeps a scrambled (hashed) form
// in RAM, and the secret "salt" changes every time the server restarts.
const salt = crypto.randomBytes(16).toString('hex');
const hashedIp = (req) =>
  crypto.createHash('sha256').update(salt + ipKeyGenerator(req.ip || '')).digest('hex').slice(0, 32);

function limiter(max, windowMs, message, extra = {}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: hashedIp,
    handler: (req, res) => res.status(429).json({ error: message, code: 'RATE_LIMIT' }),
    ...extra,
  });
}

const HOUR = 60 * 60 * 1000;
const infoLimiter = limiter(config.infoPerHour, HOUR, 'Too many links checked. Please wait a while and try again.');
const jobLimiter = limiter(
  config.jobsPerHour,
  HOUR,
  `You can make ${config.jobsPerHour} downloads per hour. Please try again later.`,
  { skipFailedRequests: true } // errors (like a bad link) don't use up your limit
);
const pollLimiter = limiter(1200, HOUR, 'Too many requests. Please slow down.');
const reportLimiter = limiter(5, HOUR, 'Too many reports sent. Please email us instead.');

// ---------- Helpers ----------

// Get (or reuse) the info for a link and check our rules.
async function loadVideo(rawUrl) {
  if (typeof rawUrl !== 'string') throw new AppError(400, 'EMPTY', 'Please paste a link first.');
  const link = await normalizeLink(rawUrl);

  if (tools.status.ytdlp === 'starting') {
    throw new AppError(503, 'STARTING', 'The server is just starting. Please try again in one minute.');
  }
  if (tools.status.ytdlp === 'failed') {
    throw new AppError(503, 'SERVER_SETUP', 'Downloads are not working right now. We are fixing it, please try again later.');
  }

  if (blocklist.isBlocked(link.platform, link.id)) {
    throw new AppError(451, 'BLOCKED', 'This content has been removed from our service after a request from the copyright owner.');
  }

  let data = infoCache.getInfo(link.url);
  if (!data) {
    const info = await ytdlp.getInfo(link.url);

    if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
      throw new AppError(422, 'LIVE', 'Live streams cannot be downloaded. Please try after the stream ends.');
    }
    if (info.duration && info.duration > config.maxDurationSeconds) {
      throw new AppError(422, 'TOO_LONG', `This video is longer than ${config.maxDurationMinutes} minutes. We only support shorter videos.`);
    }
    // The video's own ID might differ from the one in the link (e.g. short links).
    if (info.id && blocklist.isBlocked(link.platform, info.id)) {
      throw new AppError(451, 'BLOCKED', 'This content has been removed from our service after a request from the copyright owner.');
    }

    const { video, audio, plans } = buildOptions(info);
    if (video.length === 0 && audio.length === 0) {
      throw new AppError(422, 'NO_FORMATS', 'We could not find any downloadable formats for this video.');
    }

    data = {
      url: link.url,
      platform: link.platform,
      title: String(info.title || 'Untitled video').slice(0, 200),
      uploader: info.uploader || info.channel || null,
      duration: info.duration || null,
      thumbToken: infoCache.addThumb(info.thumbnail),
      playlistItem: info._playlistItem || null,
      video,
      audio,
      plans,
    };
    infoCache.setInfo(link.url, data);
  }
  return data;
}

// Wrap async route handlers so errors go to the error handler.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Routes ----------

// POST /api/info  { url }
router.post(
  '/info',
  infoLimiter,
  wrap(async (req, res) => {
    const data = await loadVideo(req.body && req.body.url);
    logger.info('info ok', { platform: data.platform });
    res.json({
      platform: data.platform,
      platformName: PLATFORM_NAMES[data.platform],
      title: data.title,
      uploader: data.uploader,
      thumbnail: data.thumbToken ? `/api/thumb/${data.thumbToken}` : null,
      duration: data.duration,
      durationText: formatDuration(data.duration),
      video: data.video,
      audio: data.audio,
      limits: { maxFileSizeMb: config.maxFileSizeMb, maxDurationMinutes: config.maxDurationMinutes },
    });
  })
);

// POST /api/jobs  { url, type: "video"|"audio", quality: "720"|"best"|"mp3-192"|"m4a" }
router.post(
  '/jobs',
  jobLimiter,
  wrap(async (req, res) => {
    const { url, type, quality } = req.body || {};
    if (type !== 'video' && type !== 'audio') throw new AppError(400, 'BAD_TYPE', 'Please choose Video or Audio.');
    if (typeof quality !== 'string' || quality.length > 20) throw new AppError(400, 'BAD_QUALITY', 'Please choose a quality.');

    const data = await loadVideo(url);
    const plan = Object.prototype.hasOwnProperty.call(data.plans, quality) ? data.plans[quality] : null;
    if (!plan || plan.type !== type) {
      throw new AppError(400, 'BAD_QUALITY', 'This quality is not available for this video. Please choose another one.');
    }
    if (plan.size && plan.size > config.maxFileSizeBytes) {
      throw new AppError(413, 'TOO_LARGE', `This file is bigger than our ${config.maxFileSizeMb} MB limit. Please choose a lower quality.`);
    }

    const job = jobs.createJob({
      url: data.url,
      platform: data.platform,
      title: data.title,
      duration: data.duration,
      playlistItem: data.playlistItem,
      plan,
      quality,
    });
    res.status(202).json({ jobId: job.id, status: job.status });
  })
);

// GET /api/jobs/:id
router.get('/jobs/:id', pollLimiter, (req, res) => {
  const job = UUID.test(req.params.id) ? jobs.getJob(req.params.id) : null;
  if (!job) {
    return res.status(404).json({ error: 'This download was not found or has expired. Please start again.', code: 'NOT_FOUND' });
  }
  res.set('Cache-Control', 'no-store');
  res.json(jobs.publicView(job));
});

// GET /api/files/:id  -> sends the finished file from our server.
router.get(
  '/files/:id',
  pollLimiter,
  wrap(async (req, res) => {
    const job = UUID.test(req.params.id) ? jobs.getJob(req.params.id) : null;
    if (!job || job.status !== 'ready') {
      throw new AppError(404, 'NOT_FOUND', 'This file was not found or has expired. Files are deleted after ' + config.fileTtlMinutes + ' minutes.');
    }
    try {
      await fs.access(job.filePath);
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'This file has expired. Please start again.');
    }
    // res.download sets "Content-Disposition: attachment" with a safe file
    // name, and supports resuming (Range requests) on slow connections.
    res.download(job.filePath, job.fileName, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
      dotfiles: 'deny',
    });
  })
);

// GET /api/thumb/:token -> thumbnail image, loaded through our server.
const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/i;
router.get(
  '/thumb/:token',
  wrap(async (req, res) => {
    const url = /^[0-9a-f]{24}$/.test(req.params.token) ? infoCache.getThumb(req.params.token) : null;
    if (!url) return res.status(404).end();

    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' }).catch(() => null);
    const type = upstream && (upstream.headers.get('content-type') || '').split(';')[0].trim();
    if (!upstream || !upstream.ok || !ALLOWED_IMAGE_TYPES.test(type)) return res.status(404).end();

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) return res.status(404).end();
    res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=900' });
    res.send(buf);
  })
);

// POST /api/report -> copyright / takedown report.
// Saved to data/reports.jsonl for the site owner to review.
router.post(
  '/report',
  reportLimiter,
  wrap(async (req, res) => {
    const b = req.body || {};
    const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const report = {
      receivedAt: new Date().toISOString(),
      name: clean(b.name, 120),
      email: clean(b.email, 200),
      role: clean(b.role, 60),
      contentUrl: clean(b.contentUrl, 2048),
      originalWork: clean(b.originalWork, 2000),
      details: clean(b.details, 4000),
      goodFaith: b.goodFaith === true || b.goodFaith === 'on',
      accurate: b.accurate === true || b.accurate === 'on',
      signature: clean(b.signature, 120),
    };
    if (!report.name || !report.signature) throw new AppError(400, 'MISSING', 'Please enter your name and signature.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(report.email)) throw new AppError(400, 'MISSING', 'Please enter a valid email address.');
    if (!/^https?:\/\//i.test(report.contentUrl)) throw new AppError(400, 'MISSING', 'Please enter the link of the content.');
    if (!report.goodFaith || !report.accurate) throw new AppError(400, 'MISSING', 'Please tick both statements.');

    // Try to find the platform + video ID so the owner can block it quickly.
    try {
      const link = await normalizeLink(report.contentUrl);
      report.blocklistLine = link.id ? `${link.platform}:${link.id}` : null;
    } catch {
      report.blocklistLine = null;
    }

    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.appendFile(path.join(config.dataDir, 'reports.jsonl'), JSON.stringify(report) + '\n');
    logger.info('content report received');
    res.json({ ok: true, message: 'Thank you. We have received your report and will review it within 72 hours.' });
  })
);

// Unknown API path
router.use((req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

module.exports = router;
