// Starts the website + API.
//   node src/server.js

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const logger = require('./logger');
const { AppError } = require('./errors');
const apiRouter = require('./routes/api');
const { router: pagesRouter, notFound } = require('./routes/pages');
const { resetTempDir, startCleanup } = require('./cleanup');
const jobs = require('./jobs');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// Security headers. Only our own scripts/styles can run (no ads, no trackers).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip pages, CSS and JS (not video files - they are already compressed).
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/files/') && compression.filter(req, res) }));
app.use(logger.requestLogger);
app.use(express.json({ limit: '20kb' }));

// Static files (CSS, JS, icon). Cached for 7 days; file names have ?v= to refresh.
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d', index: false }));

// Health check for monitoring tools / Docker.
app.get('/healthz', (req, res) => res.json({ ok: true, ...jobs.stats() }));

app.use('/api', apiRouter);
app.use(pagesRouter);

// 404 for everything else
app.use((req, res) => res.status(404).type('html').send(notFound));

// Error handler: clear messages for users, no stack traces leaked.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Bad request.', code: 'BAD_REQUEST' });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  logger.error('unexpected error', { error: err.message });
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'SERVER_ERROR' });
});

async function start() {
  await resetTempDir();
  startCleanup();
  app.listen(config.port, () => {
    logger.info('server started', {
      port: config.port,
      jobsPerHour: config.jobsPerHour,
      maxDurationMinutes: config.maxDurationMinutes,
      maxFileSizeMb: config.maxFileSizeMb,
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    logger.error('could not start', { error: err.message });
    process.exit(1);
  });
}

module.exports = { app, start };
