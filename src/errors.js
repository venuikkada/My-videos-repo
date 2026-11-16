// One error type for "expected" problems (bad link, private video, etc.).
// "status" is the HTTP code; "code" is a short id the frontend can use.

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// yt-dlp prints technical errors. Turn the common ones into simple English.
// The first matching rule wins, so specific rules come first.
const YTDLP_ERROR_RULES = [
  [/private video|this video is private|is private/i, 'PRIVATE', 'This video is private. We can only download public videos.'],
  [/login required|log in|sign in to view|requested content is not available|rate-limit reached or login/i, 'LOGIN_REQUIRED',
    'This post needs a login to view, so it is private or restricted. We can only download public posts.'],
  [/confirm your age|age-restricted|inappropriate for some users/i, 'AGE_RESTRICTED', 'This video is age-restricted, so we cannot download it.'],
  [/not a bot|too many requests|http error 429/i, 'BUSY', 'The video site is limiting our requests right now. Please try again in a few minutes.'],
  [/not available in your country|geo.?restrict|blocked it in your country/i, 'GEO_BLOCKED', 'This video is blocked in our server\'s country.'],
  [/members.only|join this channel/i, 'MEMBERS_ONLY', 'This video is for channel members only.'],
  [/premieres in|live event will begin|is upcoming/i, 'NOT_STARTED', 'This video has not started yet. Try again after it is published.'],
  [/removed|terminated|no longer available|video unavailable|does not exist|has been deleted|http error 404|not found|expired/i, 'UNAVAILABLE',
    'This video is not available. It may be deleted, expired or private.'],
  [/no video formats|no video could be found|there is no video/i, 'NO_VIDEO', 'We could not find a video in this post. It may be a photo post.'],
  [/drm/i, 'DRM', 'This video is copy-protected (DRM), so it cannot be downloaded.'],
  [/unsupported url|no suitable extractor/i, 'UNSUPPORTED', 'This link is not supported.'],
  [/max-filesize|larger than max-filesize|file is larger/i, 'TOO_LARGE', 'This file is too big for our server.'],
  [/requested format is not available/i, 'FORMAT_GONE', 'This quality is no longer available. Please tap "Get options" again.'],
  [/timed out|timeout|connection reset|temporary failure|network is unreachable|unable to download|unable to connect/i, 'NETWORK', 'We could not reach the video site. Please try again.'],
];

function friendlyYtdlpError(stderr) {
  // Look only at the "ERROR:" lines if there are any. WARNING lines can
  // contain scary words that are not the real problem.
  const all = String(stderr || '');
  const errorLines = all.split('\n').filter((l) => l.startsWith('ERROR:'));
  const text = errorLines.length ? errorLines.join('\n') : all;
  for (const [pattern, code, message] of YTDLP_ERROR_RULES) {
    if (pattern.test(text)) return new AppError(422, code, message);
  }
  return new AppError(502, 'EXTRACT_FAILED', 'We could not read this video. Please check the link and try again.');
}

module.exports = { AppError, friendlyYtdlpError };
