// The downloader box (paste link -> choices -> progress -> Download).
// Used on the Home page and on every platform (SEO) page.
// All behaviour is in public/js/app.js.

const config = require('../config');

function toolHtml(placeholder) {
  const ph = placeholder || 'Paste a YouTube, Instagram, Facebook or Snapchat link';
  return `
<section class="tool" id="tool" aria-label="Downloader" data-ttl="${config.fileTtlMinutes}">
  <form id="link-form" novalidate>
    <label for="link" class="label" data-i18n="pasteLabel">Paste the video link</label>
    <input id="link" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="${ph}" data-i18n-ph="placeholder" required>
    <div class="row">
      <button type="button" id="paste-btn" class="btn btn-light" data-i18n="paste">📋 Paste link</button>
      <button type="submit" id="get-btn" class="btn btn-primary" data-i18n="getOptions">Get options</button>
    </div>
  </form>

  <div id="message" class="message" role="alert" hidden></div>

  <div id="loading" class="loading" hidden><span class="spinner" aria-hidden="true"></span> <span data-i18n="checking">Checking the link…</span></div>

  <div id="result" hidden>
    <div class="media">
      <img id="thumb" alt="" width="160" height="90" decoding="async" hidden>
      <div class="media-text">
        <h2 id="title" class="media-title"></h2>
        <p id="meta" class="small"></p>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-video" aria-controls="panel-video" aria-selected="true" data-tab="video" data-i18n="video">🎬 Video (MP4)</button>
      <button type="button" role="tab" id="tab-audio" aria-controls="panel-audio" aria-selected="false" data-tab="audio" data-i18n="audio">🎵 Audio (MP3)</button>
    </div>
    <div id="panel-video" role="tabpanel" aria-labelledby="tab-video"><div class="options" id="video-options"></div></div>
    <div id="panel-audio" role="tabpanel" aria-labelledby="tab-audio" hidden><div class="options" id="audio-options"></div></div>
    <p class="small" data-i18n="tapHint">Tap a quality to prepare your file.</p>
  </div>

  <div id="job" class="job" hidden>
    <p id="job-stage" class="job-stage"></p>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress">
      <div class="bar" id="bar"></div>
    </div>
    <p id="job-pct" class="small">0%</p>
    <a id="download-btn" class="btn btn-success btn-block" href="#" hidden data-i18n="download">⬇ Download</a>
    <p id="file-info" class="small" hidden></p>
    <button type="button" id="again-btn" class="btn btn-light btn-block" hidden data-i18n="another">Download another</button>
  </div>
</section>`;
}

module.exports = { toolHtml };
