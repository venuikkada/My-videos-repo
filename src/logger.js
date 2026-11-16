// Very small logger. On purpose it NEVER prints visitor IP addresses or the
// links they paste. Only the time, the event and safe details (like platform).

function log(level, message, extra) {
  const line = { time: new Date().toISOString(), level, message };
  if (extra) Object.assign(line, extra);
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else console.log(text);
}

module.exports = {
  info: (msg, extra) => log('info', msg, extra),
  warn: (msg, extra) => log('warn', msg, extra),
  error: (msg, extra) => log('error', msg, extra),

  // Express middleware: logs method, path (without query string), status and time.
  // No IP, no user agent, no request body.
  requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      // Only log API calls, to keep logs short.
      if (!req.path.startsWith('/api/')) return;
      // Hide job IDs in paths so logs can't be used to fetch someone's file.
      const safePath = req.path.replace(/[0-9a-f-]{36}/gi, ':id');
      log('info', 'request', {
        method: req.method,
        path: safePath,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    });
    next();
  },
};
