// Detects which platform a link belongs to, and rebuilds a clean link.
//
// Why rebuild the link? Security. We never pass the user's raw text to
// yt-dlp. We only pass a link that WE built from a known pattern
// (like https://www.youtube.com/watch?v=VIDEO_ID). This blocks tricks such as
// links to other websites, our own server, or strange characters.

const { AppError } = require('./errors');

// Only these exact host names are allowed (the "whitelist").
const ALLOWED_HOSTS = {
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'instagram.com': 'instagram',
  'www.instagram.com': 'instagram',
  'm.instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'www.facebook.com': 'facebook',
  'm.facebook.com': 'facebook',
  'web.facebook.com': 'facebook',
  'fb.watch': 'facebook',
  'snapchat.com': 'snapchat',
  'www.snapchat.com': 'snapchat',
  't.snapchat.com': 'snapchat',
};

// Names shown to users.
const PLATFORM_NAMES = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  snapchat: 'Snapchat',
};

// yt-dlp is told to use ONLY these extractors, so it can never fall back
// to its "generic" mode that would download from any website.
const YTDLP_EXTRACTORS = ['youtube', 'Instagram', 'facebook', 'facebook:reel', 'SnapchatSpotlight'];

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,64}$/;
const FB_ID = /^(?:\d{5,25}|pfbid[A-Za-z0-9]{10,80})$/;
const FB_NAME = /^[A-Za-z0-9.\-_]{1,80}$/;
const SNAP_ID = /^\w{5,200}$/;

const unsupported = (msg) => new AppError(400, 'UNSUPPORTED', msg);
const GENERIC_HELP =
  'Please paste a link to a public YouTube video, Instagram Reel or post, Facebook video, or Snapchat Spotlight.';

// People often paste text like "Watch this! https://...". Pull out the link.
function extractUrl(text) {
  const input = String(text || '').trim();
  if (!input) throw new AppError(400, 'EMPTY', 'Please paste a link first.');
  if (input.length > 2048) throw unsupported('This link is too long. ' + GENERIC_HELP);
  const found = input.match(/https?:\/\/[^\s<>"']+/i);
  if (found) return found[0];
  // Allow links without "https://", like "youtu.be/abc".
  const bare = input.match(/^(?:www\.|m\.)?[a-z0-9.-]+\.(?:com|be|watch)\/[^\s<>"']*/i);
  if (bare) return 'https://' + bare[0];
  throw unsupported('That does not look like a link. ' + GENERIC_HELP);
}

// Turn a URL into { platform, id, url } or throw a clear error.
function parseLink(text) {
  let u;
  try {
    u = new URL(extractUrl(text));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw unsupported('That link is not valid. ' + GENERIC_HELP);
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw unsupported(GENERIC_HELP);
  if (u.username || u.password || u.port) throw unsupported(GENERIC_HELP);

  const host = u.hostname.toLowerCase();
  const platform = ALLOWED_HOSTS[host];
  if (!platform) {
    throw unsupported('This website is not supported. ' + GENERIC_HELP);
  }

  // Split the path into clean parts: "/reel/ABC/" -> ["reel", "ABC"]
  const parts = u.pathname.split('/').filter(Boolean);

  if (platform === 'youtube') return parseYouTube(host, u, parts);
  if (platform === 'instagram') return parseInstagram(parts);
  if (platform === 'facebook') return parseFacebook(host, u, parts);
  return parseSnapchat(host, u, parts);
}

function parseYouTube(host, u, parts) {
  let id = null;
  if (host === 'youtu.be') id = parts[0];
  else if (parts[0] === 'watch') id = u.searchParams.get('v');
  else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) id = parts[1];

  if (parts[0] === 'playlist' || (!id && u.searchParams.get('list'))) {
    throw unsupported('Playlists are not supported. Please open one video and copy its link.');
  }
  if (parts[0] === 'channel' || parts[0] === 'c' || (parts[0] || '').startsWith('@')) {
    throw unsupported('This is a channel link. Please open one video and copy its link.');
  }
  if (!id || !YT_ID.test(id)) {
    throw unsupported('This YouTube link is not a video link. Please copy the link of a single video.');
  }
  return { platform: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
}

function parseInstagram(parts) {
  // Formats: /reel/CODE, /reels/CODE, /p/CODE, /tv/CODE, /username/reel/CODE
  if (parts[0] === 'stories') {
    throw unsupported('Instagram Stories need a login, so they are not supported. Reels and posts work.');
  }
  let kind = parts[0];
  let code = parts[1];
  if (!['reel', 'reels', 'p', 'tv'].includes(kind) && ['reel', 'p', 'tv'].includes(parts[1])) {
    kind = parts[1];
    code = parts[2];
  }
  if (!['reel', 'reels', 'p', 'tv'].includes(kind) || !code || !IG_CODE.test(code)) {
    throw unsupported('This Instagram link is not a Reel or post. Please open the Reel, tap ⋯ / Share, then "Copy link".');
  }
  const path = kind === 'p' ? 'p' : 'reel';
  return { platform: 'instagram', id: code, url: `https://www.instagram.com/${path}/${code}/` };
}

function parseFacebook(host, u, parts) {
  if (host === 'fb.watch' || parts[0] === 'share') {
    // Short/share links must be opened first to find the real video link.
    return { platform: 'facebook', needsResolve: true, url: u.toString() };
  }
  const fail = () =>
    unsupported('This Facebook link is not a video link. Open the video, tap Share, then "Copy link".');

  // /reel/ID
  if (parts[0] === 'reel' && FB_ID.test(parts[1] || '')) {
    return { platform: 'facebook', id: parts[1], url: `https://www.facebook.com/reel/${parts[1]}` };
  }
  // /watch?v=ID or /watch/?v=ID
  if (parts[0] === 'watch') {
    const v = u.searchParams.get('v');
    if (v && FB_ID.test(v)) return { platform: 'facebook', id: v, url: `https://www.facebook.com/watch/?v=${v}` };
    throw fail();
  }
  // /PAGE/videos/ID or /PAGE/videos/TITLE/ID
  if (parts[1] === 'videos') {
    const id = FB_ID.test(parts[2] || '') ? parts[2] : parts[3];
    if (id && FB_ID.test(id)) return { platform: 'facebook', id, url: `https://www.facebook.com/watch/?v=${id}` };
    throw fail();
  }
  // /PAGE/posts/ID (a post that contains a video)
  if (parts[1] === 'posts' && FB_NAME.test(parts[0]) && FB_ID.test(parts[2] || '')) {
    return { platform: 'facebook', id: parts[2], url: `https://www.facebook.com/${parts[0]}/posts/${parts[2]}` };
  }
  throw fail();
}

function parseSnapchat(host, u, parts) {
  if (host === 't.snapchat.com') {
    return { platform: 'snapchat', needsResolve: true, url: u.toString() };
  }
  if (parts[0] === 'spotlight' && SNAP_ID.test(parts[1] || '')) {
    return { platform: 'snapchat', id: parts[1], url: `https://www.snapchat.com/spotlight/${parts[1]}` };
  }
  throw unsupported('Only Snapchat Spotlight links are supported. Stories and private snaps cannot be downloaded.');
}

// Short links (fb.watch, facebook.com/share, t.snapchat.com) only redirect
// to the real page. We follow the redirects ourselves, one by one, and check
// that EVERY step stays on an allowed host. Then we parse the final link.
async function resolveShortLink(startUrl, maxHops = 4) {
  let current = startUrl;
  for (let hop = 0; hop < maxHops; hop++) {
    let res;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
          Accept: 'text/html',
        },
      });
    } catch {
      throw new AppError(422, 'NETWORK', 'We could not open this short link. Please try the full video link.');
    }
    const location = res.headers.get('location');
    res.body?.cancel().catch(() => {});
    if (!location) break;

    const next = new URL(location, current).toString();
    const parsed = parseLink(next); // throws if the redirect leaves our whitelist
    if (!parsed.needsResolve) return parsed;
    current = parsed.url;
  }
  throw unsupported('We could not find the video behind this short link. Please open it and copy the full link.');
}

// Main function used by the API.
async function normalizeLink(text) {
  const parsed = parseLink(text);
  if (parsed.needsResolve) return resolveShortLink(parsed.url);
  return parsed;
}

module.exports = {
  normalizeLink,
  parseLink,
  PLATFORM_NAMES,
  YTDLP_EXTRACTORS,
  ALLOWED_HOSTS,
};
