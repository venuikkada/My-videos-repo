// Short-term memory (RAM only, never written to disk):
// 1. Video info per link, so "Get options" and "Download" don't both
//    have to ask the video site. Kept for 15 minutes.
// 2. Thumbnail tokens, so the browser loads thumbnails through us
//    (Instagram/Facebook images often refuse to load on other sites).

const crypto = require('crypto');

const INFO_TTL_MS = 15 * 60 * 1000;
const MAX_ITEMS = 2000; // safety cap so memory can't grow forever

const infoByUrl = new Map(); // url -> { data, expires }
const thumbs = new Map(); // token -> { url, expires }

function getInfo(url) {
  const item = infoByUrl.get(url);
  if (!item || item.expires < Date.now()) return null;
  return item.data;
}

function setInfo(url, data) {
  if (infoByUrl.size >= MAX_ITEMS) infoByUrl.delete(infoByUrl.keys().next().value);
  infoByUrl.set(url, { data, expires: Date.now() + INFO_TTL_MS });
}

// Thumbnails may only come from the image servers of our 4 platforms.
const THUMB_HOSTS = ['ytimg.com', 'cdninstagram.com', 'fbcdn.net', 'sc-cdn.net', 'snapchat.com'];

function isAllowedThumb(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.port || u.username) return false;
    const host = u.hostname.toLowerCase();
    return THUMB_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

// Save a thumbnail link and return a random token for it.
function addThumb(url) {
  if (!url || !isAllowedThumb(url)) return null;
  if (thumbs.size >= MAX_ITEMS) thumbs.delete(thumbs.keys().next().value);
  const token = crypto.randomBytes(12).toString('hex');
  thumbs.set(token, { url, expires: Date.now() + INFO_TTL_MS });
  return token;
}

function getThumb(token) {
  const item = thumbs.get(token);
  if (!item || item.expires < Date.now()) return null;
  return item.url;
}

// Remove old entries (called by the cleanup timer).
function prune() {
  const now = Date.now();
  for (const [k, v] of infoByUrl) if (v.expires < now) infoByUrl.delete(k);
  for (const [k, v] of thumbs) if (v.expires < now) thumbs.delete(k);
}

module.exports = { getInfo, setInfo, addThumb, getThumb, prune, isAllowedThumb };
