// The shared page frame: <head>, header, copyright note, footer.
// Pages are plain HTML strings. No template engine = fast and simple.

const config = require('../config');

// Make text safe to put inside HTML.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Bump this when CSS/JS change, so phones load the new files.
const ASSET_VERSION = '1';

const NAV = [
  ['/', 'Home', 'navHome'],
  ['/how-it-works', 'How it works', 'navHow'],
  ['/faq', 'FAQ', 'navFaq'],
];

const FOOTER_LINKS = [
  ['/youtube-video-downloader', 'YouTube video downloader'],
  ['/youtube-to-mp3', 'YouTube to MP3'],
  ['/youtube-shorts-downloader', 'YouTube Shorts downloader'],
  ['/instagram-reel-downloader', 'Instagram Reel downloader'],
  ['/facebook-video-downloader', 'Facebook video downloader'],
  ['/snapchat-spotlight-downloader', 'Snapchat Spotlight downloader'],
];

const LEGAL_LINKS = [
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms'],
  ['/contact', 'Contact'],
  ['/report', 'Report content'],
];

/**
 * page = { path, title, description, body, schema (optional object), noindex }
 */
function layout(page) {
  const canonical = config.siteUrl + (page.path === '/' ? '/' : page.path);
  const fullTitle = page.path === '/' ? `${config.siteName} – ${page.title}` : `${page.title} | ${config.siteName}`;
  const schemas = (Array.isArray(page.schema) ? page.schema : page.schema ? [page.schema] : [])
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`)
    .join('\n');

  const nav = NAV.map(
    ([href, label, key]) =>
      `<a href="${href}" data-i18n="${key}"${href === page.path ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(canonical)}">
${page.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta name="theme-color" content="#1a56db">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/style.css?v=${ASSET_VERSION}">
<script src="/js/i18n.js?v=${ASSET_VERSION}" defer></script>
<script src="/js/app.js?v=${ASSET_VERSION}" defer></script>
${schemas}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="/">${esc(config.siteName)}</a>
    <div class="lang" role="group" aria-label="Language">
      <button type="button" data-lang="en" aria-pressed="true">EN</button>
      <button type="button" data-lang="hi" aria-pressed="false" lang="hi">हिंदी</button>
      <button type="button" data-lang="te" aria-pressed="false" lang="te">తెలుగు</button>
    </div>
  </div>
  <nav class="wrap nav" aria-label="Main">${nav}</nav>
</header>

<p class="notice wrap" role="note"><strong>⚠️</strong> <span data-i18n="copyrightNote">Download only content you own or have permission to download. Respect copyright.</span></p>

<main id="main" class="wrap">
${page.body}
</main>

<footer class="site-footer">
  <div class="wrap">
    <p class="notice-footer" data-i18n="copyrightNote">Download only content you own or have permission to download. Respect copyright.</p>
    <nav aria-label="Downloaders" class="footer-links">${FOOTER_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
    <nav aria-label="Legal" class="footer-links">${LEGAL_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
    <p class="small">© ${new Date().getFullYear()} ${esc(config.siteName)}. We are not connected with YouTube, Instagram, Facebook, Snapchat, Google, Meta or Snap Inc. All trademarks belong to their owners.</p>
  </div>
</footer>
</body>
</html>`;
}

module.exports = { layout, esc, FOOTER_LINKS };
