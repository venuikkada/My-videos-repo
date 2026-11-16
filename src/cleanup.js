// Deletes old files automatically.
// Runs every 2 minutes. Any file older than FILE_TTL_MINUTES is removed.

const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const jobs = require('./jobs');
const infoCache = require('./infoCache');

// On start, empty the temp folder (old jobs are gone after a restart anyway).
async function resetTempDir() {
  await fs.rm(config.tempDir, { recursive: true, force: true });
  await fs.mkdir(config.tempDir, { recursive: true });
}

// Safety net: delete any folder in temp that is older than the limit,
// even if it is not linked to a job (for example after a crash).
async function sweepTempDir() {
  // A job may run up to JOB_TIMEOUT, then its file lives for FILE_TTL.
  const maxAgeMs = (config.fileTtlMinutes + config.jobTimeoutMinutes + 5) * 60 * 1000;
  let entries = [];
  try {
    entries = await fs.readdir(config.tempDir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    const full = path.join(config.tempDir, name);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > maxAgeMs) await fs.rm(full, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
}

function startCleanup() {
  const run = async () => {
    try {
      await jobs.cleanupOldJobs();
      await sweepTempDir();
      infoCache.prune();
    } catch (err) {
      logger.error('cleanup failed', { error: err.message });
    }
  };
  setInterval(run, 2 * 60 * 1000).unref();
}

module.exports = { resetTempDir, startCleanup };
