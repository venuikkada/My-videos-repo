// Download jobs: a simple in-memory queue.
//
// - Only MAX_CONCURRENT_JOBS run at the same time (protects the server CPU).
// - Each job gets its own folder in the temp directory.
// - Each job has a time limit (JOB_TIMEOUT_MINUTES). Stuck jobs are killed.
// - Job IDs are random UUIDs, so nobody can guess another person's file.
//
// Note: jobs live in RAM. If the server restarts, running jobs are lost
// (the temp folder is emptied on start). This is fine for a single server.

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { AppError } = require('./errors');
const ytdlp = require('./ytdlp');
const ffmpeg = require('./ffmpeg');

const jobs = new Map(); // id -> job
const queue = []; // ids waiting to start
let running = 0;

// Turn a video title into a safe file name.
function safeFileName(title, suffix, ext) {
  let name = String(title || 'video')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*#%]+/g, ' ') // remove illegal characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  if (!name || /^\.+$/.test(name)) name = 'video';
  return `${name} (${suffix}).${ext}`;
}

/**
 * Create a job. "details" comes from our info cache (never from the browser):
 * { url, platform, title, duration, playlistItem, plan, quality }
 */
function createJob(details) {
  if (queue.length >= config.maxQueuedJobs) {
    throw new AppError(503, 'BUSY', 'Our server is very busy right now. Please try again in a few minutes.');
  }
  const id = crypto.randomUUID();
  const job = {
    id,
    status: 'queued', // queued -> processing -> ready | failed
    stage: 'queued',
    progress: 0,
    error: null,
    errorCode: null,
    createdAt: Date.now(),
    finishedAt: null,
    filePath: null,
    fileName: null,
    fileSize: null,
    dir: path.join(config.tempDir, id),
    details,
  };
  jobs.set(id, job);
  queue.push(id);
  logger.info('job queued', { platform: details.platform, type: details.plan.type, quality: details.quality });
  pump();
  return job;
}

// Start waiting jobs while we have free slots.
function pump() {
  while (running < config.maxConcurrentJobs && queue.length > 0) {
    const job = jobs.get(queue.shift());
    if (!job) continue;
    running++;
    runJob(job).finally(() => {
      running--;
      pump();
    });
  }
}

async function runJob(job) {
  const { details } = job;
  const { plan } = details;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.jobTimeoutMinutes * 60 * 1000);
  const started = Date.now();

  job.status = 'processing';
  job.progress = 1;

  // Each step fills a part of the progress bar, e.g. 0% -> 70%.
  const stepProgress = (from, to) => (fraction) => {
    job.progress = Math.max(job.progress, Math.round(from + (to - from) * fraction));
  };

  try {
    await fs.mkdir(job.dir, { recursive: true });
    const common = { url: details.url, playlistItem: details.playlistItem, signal: controller.signal };
    const duration = details.duration || 0;
    let outPath;
    let fileName;

    if (plan.type === 'video') {
      outPath = path.join(job.dir, 'output.mp4');
      const suffix = details.quality === 'best' ? 'best' : `${details.quality}p`;
      fileName = safeFileName(details.title, suffix, 'mp4');

      if (plan.audioFormat) {
        // The chosen video has NO sound: download video + audio, then merge.
        job.stage = 'downloading_video';
        const videoPath = await ytdlp.downloadStream({
          ...common, selector: plan.videoFormat, outBase: path.join(job.dir, 'video'), onProgress: stepProgress(1, 70),
        });
        job.stage = 'downloading_audio';
        const audioPath = await ytdlp.downloadStream({
          ...common, selector: plan.audioFormat, outBase: path.join(job.dir, 'audio'), onProgress: stepProgress(70, 85),
        });
        job.stage = 'merging';
        await ffmpeg.mergeToMp4({
          videoPath, audioPath, outPath, audioIsAac: plan.audioIsAac,
          durationSec: duration, onProgress: stepProgress(85, 99), signal: controller.signal,
        });
      } else {
        // The video already has sound.
        job.stage = 'downloading_video';
        const inPath = await ytdlp.downloadStream({
          ...common, selector: plan.videoFormat, outBase: path.join(job.dir, 'video'), onProgress: stepProgress(1, 90),
        });
        job.stage = 'finishing';
        // Re-pack to MP4 (fast, no quality loss). Also adds "faststart" for phones.
        await ffmpeg.remuxToMp4({
          inPath, outPath, audioIsAac: plan.audioIsAac,
          durationSec: duration, onProgress: stepProgress(90, 99), signal: controller.signal,
        });
      }
    } else {
      // Audio
      job.stage = 'downloading_audio';
      const inPath = await ytdlp.downloadStream({
        ...common, selector: plan.sourceFormat, outBase: path.join(job.dir, 'source'), onProgress: stepProgress(1, 60),
      });
      if (plan.format === 'mp3') {
        job.stage = 'converting';
        outPath = path.join(job.dir, 'output.mp3');
        fileName = safeFileName(details.title, `${plan.kbps}kbps`, 'mp3');
        await ffmpeg.toMp3({
          inPath, outPath, kbps: plan.kbps, durationSec: duration,
          onProgress: stepProgress(60, 99), signal: controller.signal,
        });
      } else {
        job.stage = 'converting';
        outPath = path.join(job.dir, 'output.m4a');
        fileName = safeFileName(details.title, 'audio', 'm4a');
        await ffmpeg.toM4a({
          inPath, outPath, copy: plan.copy, durationSec: duration,
          onProgress: stepProgress(60, 99), signal: controller.signal,
        });
      }
    }

    const stat = await fs.stat(outPath);
    if (stat.size > config.maxFileSizeBytes) {
      throw new AppError(413, 'TOO_LARGE', `This file is bigger than our ${config.maxFileSizeMb} MB limit. Try a lower quality.`);
    }

    // Delete the in-between files to free disk space right away.
    const files = await fs.readdir(job.dir);
    await Promise.all(
      files.filter((f) => !f.startsWith('output.')).map((f) => fs.rm(path.join(job.dir, f), { force: true }))
    );

    job.filePath = outPath;
    job.fileName = fileName;
    job.fileSize = stat.size;
    job.status = 'ready';
    job.stage = 'ready';
    job.progress = 100;
    logger.info('job ready', { platform: details.platform, type: plan.type, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    job.status = 'failed';
    job.stage = 'failed';
    job.errorCode = timedOut ? 'TIMEOUT' : err.code || 'FAILED';
    job.error = timedOut
      ? `This job took longer than ${config.jobTimeoutMinutes} minutes and was stopped. Please try a lower quality.`
      : err instanceof AppError
        ? err.message
        : 'Something went wrong while preparing your file. Please try again.';
    logger.warn('job failed', { platform: details.platform, type: plan.type, code: job.errorCode, reason: err instanceof AppError ? undefined : err.message });
    await fs.rm(job.dir, { recursive: true, force: true }).catch(() => {});
  } finally {
    clearTimeout(timer);
    job.finishedAt = Date.now();
    // The link is not needed any more. Forget it.
    job.details = { platform: details.platform, plan: { type: plan.type }, quality: details.quality };
  }
}

function getJob(id) {
  return jobs.get(id) || null;
}

// What the browser is allowed to see about a job.
function publicView(job) {
  const view = {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
  };
  if (job.status === 'queued') view.queuePosition = queue.indexOf(job.id) + 1;
  if (job.status === 'failed') {
    view.error = job.error;
    view.errorCode = job.errorCode;
  }
  if (job.status === 'ready') {
    view.fileName = job.fileName;
    view.fileSize = job.fileSize;
    view.downloadUrl = `/api/files/${job.id}`;
    view.expiresAt = new Date(job.finishedAt + config.fileTtlMinutes * 60 * 1000).toISOString();
  }
  return view;
}

// Remove jobs (and their files) older than the time limit.
async function cleanupOldJobs() {
  const now = Date.now();
  const ttl = config.fileTtlMinutes * 60 * 1000;
  for (const [id, job] of jobs) {
    const age = now - (job.finishedAt || job.createdAt);
    const finished = job.status === 'ready' || job.status === 'failed';
    // Finished jobs: delete after TTL. Unfinished ones are handled by the job timeout.
    if (finished && age > ttl) {
      jobs.delete(id);
      await fs.rm(job.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function stats() {
  return { running, queued: queue.length, total: jobs.size };
}

module.exports = { createJob, getJob, publicView, cleanupOldJobs, stats, safeFileName };
