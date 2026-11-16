// Runs a program (yt-dlp or ffmpeg) safely.
//
// SAFETY: we use spawn() with an ARRAY of arguments and shell: false.
// That means user input is never read by a shell, so tricks like
// "; rm -rf /" inside a link can never run as a command.

const { spawn } = require('child_process');

const MAX_STDERR = 20 * 1024; // keep only the last 20 KB of error text
const MAX_STDOUT = 40 * 1024 * 1024; // 40 MB is far more than any info JSON

/**
 * @param {string} command  program to run
 * @param {string[]} args   each argument separately
 * @param {object} opts
 *   timeoutMs  - kill the program if it runs longer than this
 *   signal     - AbortSignal to stop it early (used for job timeouts)
 *   onLine     - called for every line the program prints (for progress)
 *   collectStdout - keep stdout text (needed for JSON output)
 */
function runProcess(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stdoutSize = 0;
    let stderr = '';
    let finished = false;
    let killedReason = null;
    let lineBuffer = '';

    const kill = (reason) => {
      if (finished) return;
      killedReason = reason;
      child.kill('SIGKILL');
    };

    const timer = opts.timeoutMs ? setTimeout(() => kill('timeout'), opts.timeoutMs) : null;
    const onAbort = () => kill('aborted');
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Split output into lines for progress parsing.
    const handleText = (text) => {
      if (!opts.onLine) return;
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n|\r/);
      lineBuffer = lines.pop();
      for (const line of lines) if (line) opts.onLine(line);
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (opts.collectStdout) {
        stdoutSize += chunk.length;
        if (stdoutSize > MAX_STDOUT) return kill('too much output');
        stdout += text;
      }
      handleText(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-MAX_STDERR);
      handleText(text);
    });

    const done = (fn) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      fn();
    };

    child.on('error', (err) =>
      done(() => {
        const e = new Error(`Could not start ${command}: ${err.message}`);
        e.startFailed = true;
        reject(e);
      })
    );

    child.on('close', (code) =>
      done(() => {
        if (lineBuffer && opts.onLine) opts.onLine(lineBuffer);
        resolve({ code, stdout, stderr, killedReason });
      })
    );
  });
}

module.exports = { runProcess };
