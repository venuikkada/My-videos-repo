// Unit tests: link detection and format choices.  Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { parseLink } = require('../src/platforms');
const { buildOptions } = require('../src/formats');
const { safeFileName } = require('../src/jobs');
const { isAllowedThumb } = require('../src/infoCache');

test('YouTube links are cleaned', () => {
  const cases = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'Look at this https://youtu.be/dQw4w9WgXcQ wow',
  ];
  for (const c of cases) {
    const r = parseLink(c);
    assert.strictEqual(r.platform, 'youtube');
    assert.strictEqual(r.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  }
});

test('Instagram, Facebook, Snapchat links', () => {
  assert.strictEqual(parseLink('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz').url, 'https://www.instagram.com/reel/C1a2B3c4D5e/');
  assert.strictEqual(parseLink('https://instagram.com/someone/p/C1a2B3c4D5e/').url, 'https://www.instagram.com/p/C1a2B3c4D5e/');
  assert.strictEqual(parseLink('https://m.facebook.com/watch/?v=123456789012').url, 'https://www.facebook.com/watch/?v=123456789012');
  assert.strictEqual(parseLink('https://www.facebook.com/somepage/videos/123456789012/').url, 'https://www.facebook.com/watch/?v=123456789012');
  assert.strictEqual(parseLink('https://www.facebook.com/reel/123456789012').url, 'https://www.facebook.com/reel/123456789012');
  assert.strictEqual(parseLink('https://fb.watch/abcDEF/').needsResolve, true);
  assert.strictEqual(parseLink('https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtid').platform, 'snapchat');
});

test('Bad and unsupported links are rejected', () => {
  const bad = [
    '',
    'hello',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com:8080/watch?v=dQw4w9WgXcQ',
    'file:///etc/passwd',
    'https://127.0.0.1/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/watch?v=short',
    'https://www.instagram.com/stories/someone/123/',
    'https://www.snapchat.com/add/someone',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ;rm -rf',
  ];
  for (const b of bad) {
    assert.throws(() => parseLink(b), (e) => e.status === 400, `should reject: ${b}`);
  }
});

test('Format choices: only available qualities, merge when needed', () => {
  const info = {
    duration: 100,
    formats: [
      { format_id: '18', ext: 'mp4', width: 640, height: 360, vcodec: 'avc1', acodec: 'mp4a.40.2', tbr: 500 },
      { format_id: '136', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1', acodec: 'none', tbr: 1500 },
      { format_id: '247', ext: 'webm', width: 1280, height: 720, vcodec: 'vp9', acodec: 'none', tbr: 1600 },
      { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },
      { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 150 },
    ],
  };
  const { video, audio, plans } = buildOptions(info);
  assert.deepStrictEqual(video.map((v) => v.quality), ['360', '720']);
  assert.strictEqual(plans['360'].audioFormat, null); // already has sound
  assert.strictEqual(plans['720'].videoFormat, '136'); // H.264 preferred
  assert.strictEqual(plans['720'].audioFormat, '140'); // AAC preferred for merge
  assert.deepStrictEqual(audio.map((a) => a.quality), ['mp3-128', 'mp3-192', 'mp3-320', 'm4a']);
  assert.strictEqual(plans['mp3-320'].sourceFormat, '251'); // best bitrate for MP3
  assert.strictEqual(plans.m4a.copy, true);
});

test('Vertical video: 1080x1920 counts as 1080p', () => {
  const { video } = buildOptions({
    duration: 10,
    formats: [{ format_id: 'a', ext: 'mp4', width: 1080, height: 1920, vcodec: 'avc1', acodec: 'mp4a' }],
  });
  assert.deepStrictEqual(video.map((v) => v.quality), ['1080']);
});

test('Formats without resolution get a "best" option', () => {
  const { video } = buildOptions({ duration: 10, formats: [{ format_id: 'hd', ext: 'mp4' }] });
  assert.deepStrictEqual(video.map((v) => v.quality), ['best']);
});

test('Safe file names', () => {
  assert.strictEqual(safeFileName('a/b\\c:d*?"<>|', '720p', 'mp4'), 'a b c d (720p).mp4');
  assert.strictEqual(safeFileName('', '720p', 'mp4'), 'video (720p).mp4');
  assert.strictEqual(safeFileName('..', 'x', 'mp3'), 'video (x).mp3');
});

test('Thumbnails only from platform image servers', () => {
  assert.ok(isAllowedThumb('https://i.ytimg.com/vi/x/hq.jpg'));
  assert.ok(isAllowedThumb('https://scontent-bom1-1.cdninstagram.com/v/x.jpg'));
  assert.ok(!isAllowedThumb('https://evil.com/x.jpg'));
  assert.ok(!isAllowedThumb('http://i.ytimg.com/x.jpg'));
  assert.ok(!isAllowedThumb('https://ytimg.com.evil.com/x.jpg'));
});
