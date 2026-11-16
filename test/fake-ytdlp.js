#!/usr/bin/env node
// A pretend yt-dlp used only in tests (the test machine has no internet).
// - With --dump-single-json it prints fake video info.
// - With --format ID it creates a small real media file using ffmpeg.

const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const url = args[args.length - 1];

if (url.includes('private')) {
  process.stderr.write('ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access to this video\n');
  process.exit(1);
}

const DURATION = 3;
const formats = [
  { format_id: '18', ext: 'mp4', width: 640, height: 360, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', tbr: 500, filesize: 200000 },
  { format_id: '135', ext: 'mp4', width: 854, height: 480, vcodec: 'avc1.4d401f', acodec: 'none', tbr: 700, filesize: 300000 },
  { format_id: '136', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1.4d401f', acodec: 'none', tbr: 1500, filesize: 600000 },
  { format_id: '247', ext: 'webm', width: 1280, height: 720, vcodec: 'vp9', acodec: 'none', tbr: 1400, filesize: 550000 },
  { format_id: '137', ext: 'mp4', width: 1920, height: 1080, vcodec: 'avc1.640028', acodec: 'none', tbr: 3000, filesize: 1200000 },
  { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129, filesize: 50000 },
  { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 140, filesize: 52000 },
  { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none', format_note: 'storyboard' },
];

if (args.includes('--dump-single-json')) {
  const long = url.includes('LongVideo1');
  process.stdout.write(
    JSON.stringify({
      id: 'dQw4w9WgXcQ',
      title: 'Test video: "hello" / world?',
      uploader: 'Test Channel',
      duration: long ? 4000 : DURATION,
      thumbnail: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
      formats,
    })
  );
  process.exit(0);
}

const fmt = get('--format').split('/')[0];
const out = get('--output');
const f = formats.find((x) => x.format_id === fmt);
if (!f) {
  process.stderr.write('ERROR: Requested format is not available\n');
  process.exit(1);
}
const file = out.replace('%(ext)s', f.ext);
const ff = ['-hide_banner', '-loglevel', 'error', '-y'];
const video = ['-f', 'lavfi', '-i', `testsrc=size=${f.width}x${f.height}:rate=25:duration=${DURATION}`];
const audio = ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${DURATION}`];

if (f.vcodec !== 'none' && f.acodec !== 'none') {
  ff.push(...video, ...audio, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', file);
} else if (f.vcodec !== 'none') {
  ff.push(...video, ...(f.ext === 'webm' ? ['-c:v', 'libvpx-vp9', '-deadline', 'realtime'] : ['-c:v', 'libx264', '-preset', 'ultrafast']), '-an', file);
} else {
  ff.push(...audio, ...(f.ext === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac']), '-vn', file);
}

process.stdout.write('DLPROG 0 1000\n');
execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ff);
process.stdout.write('DLPROG 500 1000\nDLPROG 1000 1000\n');
