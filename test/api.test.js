// End-to-end test of the 4 API routes with a fake yt-dlp and REAL ffmpeg.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Settings must be set BEFORE the app is loaded.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-test-'));
process.env.YTDLP_PATH = path.join(__dirname, 'fake-ytdlp.js');
process.env.TEMP_DIR = path.join(tmp, 'tmp');
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.JOBS_PER_HOUR = '6';
process.env.YTDLP_JS_RUNTIME = '';
fs.chmodSync(process.env.YTDLP_PATH, 0o755);

const { app } = require('../src/server');
const { resetTempDir } = require('../src/cleanup');

let base;
let server;

test.before(async () => {
  await resetTempDir();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const post = (p, body) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function waitForJob(id) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${base}/api/jobs/${id}`);
    const job = await res.json();
    if (job.status === 'ready' || job.status === 'failed') return job;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('job did not finish');
}

const URL1 = 'https://youtu.be/dQw4w9WgXcQ';

test('POST /api/info returns title, duration and choices', async () => {
  const res = await post('/api/info', { url: URL1 });
  assert.strictEqual(res.status, 200);
  const info = await res.json();
  assert.strictEqual(info.platform, 'youtube');
  assert.strictEqual(info.durationText, '0:03');
  assert.ok(info.thumbnail.startsWith('/api/thumb/'));
  assert.deepStrictEqual(info.video.map((v) => v.quality), ['360', '480', '720', '1080']);
  assert.deepStrictEqual(info.audio.map((v) => v.quality), ['mp3-128', 'mp3-192', 'mp3-320', 'm4a']);
  assert.ok(!('plans' in info), 'private plans must not be sent');
});

test('Errors are clear', async () => {
  let res = await post('/api/info', { url: 'https://example.com/video.mp4' });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /not supported/);

  res = await post('/api/info', { url: 'https://www.youtube.com/watch?v=private1234' });
  assert.strictEqual(res.status, 422);
  assert.strictEqual((await res.json()).code, 'PRIVATE');

  res = await post('/api/info', { url: 'https://www.youtube.com/watch?v=LongVideo1x' });
  assert.strictEqual((await res.json()).code, 'TOO_LONG');

  res = await post('/api/jobs', { url: URL1, type: 'video', quality: '4320' });
  assert.strictEqual(res.status, 400);

  res = await fetch(`${base}/api/jobs/00000000-0000-0000-0000-000000000000`);
  assert.strictEqual(res.status, 404);
});

test('1080p job merges video + audio into one MP4 and serves it', async () => {
  const res = await post('/api/jobs', { url: URL1, type: 'video', quality: '1080' });
  assert.strictEqual(res.status, 202);
  const { jobId } = await res.json();
  const job = await waitForJob(jobId);
  assert.strictEqual(job.status, 'ready', job.error);
  assert.strictEqual(job.progress, 100);
  assert.match(job.fileName, /\(1080p\)\.mp4$/);

  const file = await fetch(base + job.downloadUrl);
  assert.strictEqual(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /attachment/);
  const buf = Buffer.from(await file.arrayBuffer());
  assert.ok(buf.length > 1000);
  assert.strictEqual(buf.subarray(4, 8).toString(), 'ftyp'); // it is an MP4

  // Check the MP4 really has both video and audio.
  const out = path.join(tmp, 'check.mp4');
  fs.writeFileSync(out, buf);
  const { execFileSync } = require('child_process');
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]).toString();
  assert.match(probe, /video/);
  assert.match(probe, /audio/);
});

test('MP3 and M4A jobs', async () => {
  for (const quality of ['mp3-192', 'm4a']) {
    const res = await post('/api/jobs', { url: URL1, type: 'audio', quality });
    const job = await waitForJob((await res.json()).jobId);
    assert.strictEqual(job.status, 'ready', job.error);
    assert.ok(job.fileName.endsWith(quality === 'm4a' ? '.m4a' : '.mp3'));
  }
});

test('Rate limit: failed requests do not count, extra jobs are refused', async () => {
  // 3 jobs used above (limit 6). Use the rest, then expect 429.
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const res = await post('/api/jobs', { url: URL1, type: 'video', quality: '360' });
    statuses.push(res.status);
    if (res.status === 202) await waitForJob((await res.json()).jobId);
  }
  assert.deepStrictEqual(statuses, [202, 202, 202, 429, 429]);
});

test('Pages render with the copyright note', async () => {
  for (const p of ['/', '/faq', '/privacy', '/terms', '/contact', '/report', '/how-it-works', '/youtube-to-mp3', '/instagram-reel-downloader']) {
    const res = await fetch(base + p);
    assert.strictEqual(res.status, 200, p);
    const html = await res.text();
    assert.match(html, /Download only content you own or have permission to download\. Respect copyright\./, p);
  }
  assert.strictEqual((await fetch(base + '/nope')).status, 404);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /youtube-to-mp3/);
});

test('Report form saves a report', async () => {
  const res = await post('/api/report', {
    name: 'A Owner', email: 'a@example.com', contentUrl: URL1, goodFaith: true, accurate: true, signature: 'A Owner',
  });
  assert.strictEqual(res.status, 200);
  const saved = fs.readFileSync(path.join(tmp, 'data', 'reports.jsonl'), 'utf8');
  assert.match(saved, /youtube:dQw4w9WgXcQ/);
});
