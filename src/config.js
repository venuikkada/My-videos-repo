// All settings live here. Each one can be changed with an environment
// variable (see .env.example), so you never need to edit code to tune limits.

const path = require('path');

// Read a whole number from the environment, or use the default.
function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Setting ${name} must be a positive number, got "${raw}"`);
  }
  return n;
}

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

const rootDir = path.join(__dirname, '..');

const config = {
  // Website details shown on pages
  siteName: str('SITE_NAME', 'MySiteName'),
  siteUrl: str('SITE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  contactEmail: str('CONTACT_EMAIL', 'contact@example.com'),

  // Server
  port: num('PORT', 3000),
  // Which proxies we trust for the visitor IP (needed for rate limiting
  // behind Nginx). "loopback, uniquelocal" = only local / private networks.
  trustProxy: str('TRUST_PROXY', 'loopback, uniquelocal'),

  // Folders
  tempDir: path.resolve(str('TEMP_DIR', path.join(rootDir, 'tmp'))),
  dataDir: path.resolve(str('DATA_DIR', path.join(rootDir, 'data'))),
  // Where we keep our own copy of yt-dlp on managed hosting (see src/tools.js)
  toolsDir: path.resolve(str('TOOLS_DIR', path.join(rootDir, 'bin'))),

  // Tools (full path or just the command name). If not set, src/tools.js
  // finds them at start-up (or downloads yt-dlp on managed hosting).
  ytdlpPath: str('YTDLP_PATH', 'yt-dlp'),
  ffmpegPath: str('FFMPEG_PATH', 'ffmpeg'),
  // JavaScript runtime that yt-dlp uses for YouTube. Node is already
  // installed, so we use it. Set to "" to let yt-dlp decide.
  ytdlpJsRuntime: str('YTDLP_JS_RUNTIME', 'node'),

  // Limits
  jobsPerHour: num('JOBS_PER_HOUR', 10), // per visitor IP
  infoPerHour: num('INFO_PER_HOUR', 60), // per visitor IP
  maxDurationMinutes: num('MAX_DURATION_MINUTES', 60),
  maxFileSizeMb: num('MAX_FILE_SIZE_MB', 500),
  maxConcurrentJobs: num('MAX_CONCURRENT_JOBS', 2),
  maxQueuedJobs: num('MAX_QUEUED_JOBS', 50),
  jobTimeoutMinutes: num('JOB_TIMEOUT_MINUTES', 15),
  infoTimeoutSeconds: num('INFO_TIMEOUT_SECONDS', 45),
  fileTtlMinutes: num('FILE_TTL_MINUTES', 30),
};

config.maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;
config.maxDurationSeconds = config.maxDurationMinutes * 60;

module.exports = config;
