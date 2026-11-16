// Content of every page. Edit the text here.
// Each page: { path, title, description, body, schema? }

const config = require('../config');
const { esc } = require('./layout');
const { toolHtml } = require('./tool');

const site = esc(config.siteName);
const email = esc(config.contactEmail);
const maxMin = config.maxDurationMinutes;
const maxMb = config.maxFileSizeMb;
const ttl = config.fileTtlMinutes;

// Builds FAQ HTML + Google "FAQPage" data from one list.
function faqBlock(items, heading = 'Questions') {
  const html = `<h2>${heading}</h2>` +
    items.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${a}</p></details>`).join('');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
    })),
  };
  return { html, schema };
}

const steps = (platform, linkTip) => `
<ol class="steps">
  <li><strong>Copy the link.</strong> ${linkTip}</li>
  <li><strong>Paste it above</strong> and tap <em>Get options</em>.</li>
  <li><strong>Choose Video or Audio</strong> and a quality.</li>
  <li><strong>Tap Download</strong> when the file is ready. It is saved to your ${platform === 'any' ? 'phone or computer' : 'phone'}.</li>
</ol>`;

const platformLinks = `
<ul class="chips">
  <li><a href="/youtube-video-downloader">YouTube</a></li>
  <li><a href="/youtube-shorts-downloader">YouTube Shorts</a></li>
  <li><a href="/youtube-to-mp3">YouTube to MP3</a></li>
  <li><a href="/instagram-reel-downloader">Instagram Reels</a></li>
  <li><a href="/facebook-video-downloader">Facebook</a></li>
  <li><a href="/snapchat-spotlight-downloader">Snapchat Spotlight</a></li>
</ul>`;

// ---------------- Common FAQ (used on FAQ page) ----------------
const COMMON_FAQ = [
  ['Is it free?', `Yes. ${site} is free and needs no login or app. We do not show pop-ups or fake download buttons.`],
  ['Which links work?', 'Public YouTube videos and Shorts, Instagram Reels and video posts, Facebook videos and Reels, and Snapchat Spotlight videos.'],
  ['Why does my link not work?', 'The video may be private, deleted, age-restricted, a live stream, or need a login. We can only download public videos that anyone can watch without logging in.'],
  ['Is there a limit?', `Yes, to keep the service free for everyone: videos up to ${maxMin} minutes, files up to ${maxMb} MB, and ${config.jobsPerHour} downloads per hour per user.`],
  ['Where is the file saved?', 'On Android it is usually in the <em>Downloads</em> folder (open the Files app). On iPhone, open the <em>Files</em> app and look in <em>Downloads</em>. On a computer, check your browser’s Downloads folder.'],
  ['Why does 1080p take longer?', 'Many sites keep HD video and sound as two separate files. We download both and join them into one MP4, so it takes a little longer.'],
  ['Will 320 kbps MP3 sound better?', 'Only if the original sound was high quality. We cannot add quality that was not there. 128 kbps is fine for most phones and saves data.'],
  ['Do you keep my files or links?', `No. Files are deleted automatically after ${ttl} minutes. We do not save the links you paste or your IP address. See our <a href="/privacy">Privacy Policy</a>.`],
  ['Is it legal to download videos?', 'It depends on the content and where you live. Only download videos you own, that are free to use, or that you have permission to download. Do not re-upload or sell other people’s videos. Many sites’ terms do not allow downloading.'],
  ['How do I report my copyrighted content?', 'Use our <a href="/report">Report content</a> form. We will block the video on our service.'],
];

// ---------------- Pages ----------------
const pages = {};

pages['/'] = (() => {
  const faq = faqBlock(COMMON_FAQ.slice(0, 5), 'Quick answers');
  return {
    path: '/',
    title: 'Free Video & MP3 Downloader for YouTube, Instagram, Facebook, Snapchat',
    description: 'Save public videos from YouTube, Instagram, Facebook and Snapchat as MP4 or MP3. Free, no login, no pop-ups. Works on any phone.',
    body: `
<h1 data-i18n="homeH1">Free video & audio downloader</h1>
<p class="lead" data-i18n="homeLead">Save public videos from YouTube, Instagram, Facebook and Snapchat as MP4 or MP3. No login. No pop-ups.</p>
${toolHtml()}
<h2>How to download</h2>
${steps('any', 'Open the video in the app, tap <em>Share</em>, then <em>Copy link</em>.')}
<h2>Supported sites</h2>
${platformLinks}
${faq.html}
<p><a href="/faq">See all questions →</a></p>`,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: config.siteName,
        url: config.siteUrl + '/',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
      },
      faq.schema,
    ],
  };
})();

pages['/how-it-works'] = {
  path: '/how-it-works',
  title: 'How it works',
  description: `How ${config.siteName} downloads public videos and audio, step by step.`,
  body: `
<h1>How it works</h1>
${steps('any', 'In YouTube, Instagram, Facebook or Snapchat, tap <em>Share</em> → <em>Copy link</em>.')}
<h2>What happens on our server</h2>
<ul>
  <li><strong>We check the link.</strong> Only YouTube, Instagram, Facebook and Snapchat links are accepted.</li>
  <li><strong>We read the video details</strong> (title, picture, length and available qualities) using the open-source tool <em>yt-dlp</em>.</li>
  <li><strong>We prepare your file.</strong> For HD videos, picture and sound are often separate. We download both and join them into one MP4 with <em>FFmpeg</em>. For MP3/M4A we convert only the sound.</li>
  <li><strong>You download it directly from our server.</strong> No redirects to other sites.</li>
  <li><strong>We delete it.</strong> All files are removed automatically after ${ttl} minutes.</li>
</ul>
<h2>Limits</h2>
<ul>
  <li>Videos up to ${maxMin} minutes.</li>
  <li>Files up to ${maxMb} MB.</li>
  <li>${config.jobsPerHour} downloads per hour per user.</li>
  <li>Only public content. Private videos, Stories and live streams are not supported.</li>
</ul>
<p><a class="btn btn-primary" href="/">Start downloading</a></p>`,
};

pages['/faq'] = (() => {
  const faq = faqBlock(COMMON_FAQ, 'Frequently asked questions');
  return {
    path: '/faq',
    title: 'FAQ – Frequently asked questions',
    description: `Answers about ${config.siteName}: supported links, limits, where files are saved, privacy and copyright.`,
    body: `<h1>FAQ</h1>${faq.html}<p>Still need help? <a href="/contact">Contact us</a>.</p>`,
    schema: faq.schema,
  };
})();

pages['/privacy'] = {
  path: '/privacy',
  title: 'Privacy Policy',
  description: `How ${config.siteName} handles your data. We do not store your links or IP address.`,
  body: `
<h1>Privacy Policy</h1>
<p class="small">Last updated: ${new Date().toISOString().slice(0, 10)}</p>
<p>${site} is built to collect as little data as possible. You do not need an account.</p>
<h2>What we do NOT store</h2>
<ul>
  <li>We do <strong>not</strong> save the links you paste in any log or database.</li>
  <li>We do <strong>not</strong> save your IP address in logs.</li>
  <li>We do <strong>not</strong> use advertising or tracking cookies.</li>
</ul>
<h2>What we keep for a short time</h2>
<ul>
  <li><strong>Video details and your link</strong> are kept in server memory (RAM) for up to 15 minutes, so the download can start quickly. They are not written to disk.</li>
  <li><strong>Your prepared file</strong> is stored on our server for up to ${ttl} minutes, then deleted automatically.</li>
  <li><strong>Rate limiting:</strong> to stop misuse, we count downloads per user for 1 hour. We store only a scrambled (hashed) form of your IP address in memory, never the real address, and it is deleted after the hour or when the server restarts.</li>
  <li><strong>Anonymous logs:</strong> we log only things like “a YouTube video was prepared in 12 seconds” and error types, to fix problems. These logs have no links and no IP addresses.</li>
</ul>
<h2>Language choice</h2>
<p>If you change the language, your choice is saved in your own browser (local storage). It is not sent to us.</p>
<h2>Content reports</h2>
<p>If you send a <a href="/report">content report</a>, we keep the details you give (name, email, links, statement) so we can handle the request and keep a record, as the law requires.</p>
<h2>Hosting and other services</h2>
<p>Our server provider and network (for example a CDN) may keep their own short technical logs. To show thumbnails and prepare files, our server contacts YouTube, Instagram, Facebook or Snapchat — your device does not contact them through us.</p>
<h2>Your rights</h2>
<p>Under Indian law (including the Digital Personal Data Protection Act, 2023) and other laws, you can ask what data we hold about you and ask us to delete it. Since we keep almost nothing, there is usually nothing to delete. Email <a href="mailto:${email}">${email}</a>.</p>
<h2>Children</h2>
<p>This service is not meant for children under 18 without a parent’s supervision.</p>
<h2>Changes</h2>
<p>We may update this policy. The date at the top shows the latest version.</p>`,
};

pages['/terms'] = {
  path: '/terms',
  title: 'Terms of Use',
  description: `Rules for using ${config.siteName}. Download only content you own or have permission to download.`,
  body: `
<h1>Terms of Use</h1>
<p class="small">Last updated: ${new Date().toISOString().slice(0, 10)}</p>
<p>By using ${site} you agree to these terms. If you do not agree, please do not use the service.</p>
<h2>1. What the service does</h2>
<p>${site} is a technical tool that helps you save a copy of a <strong>public</strong> video or its audio for personal use. We do not host, upload or own any of this content, and we are not connected with YouTube, Instagram, Facebook, Snapchat, Google, Meta or Snap Inc.</p>
<h2>2. Your responsibility</h2>
<ul>
  <li>Download only content <strong>you own</strong>, content that is free to use (for example Creative Commons), or content you have <strong>permission</strong> to download.</li>
  <li>Respect copyright and the terms of the platform where the content is posted. Some platforms do not allow downloading.</li>
  <li>Do not re-upload, sell, or claim other people’s content as your own.</li>
  <li>Do not use the service to download illegal content or to harm others.</li>
</ul>
<h2>3. Fair use of the service</h2>
<p>Do not use bots, scripts or other automated tools, try to get around our limits, or attack the service. We may block access to stop misuse.</p>
<h2>4. Limits</h2>
<p>Videos up to ${maxMin} minutes, files up to ${maxMb} MB, and ${config.jobsPerHour} downloads per hour. Files are deleted after ${ttl} minutes. Limits may change at any time.</p>
<h2>5. Copyright complaints</h2>
<p>If you own content and do not want it to be downloadable through ${site}, use our <a href="/report">Report content</a> form. We will review it and block the content on our service.</p>
<h2>6. No warranty</h2>
<p>The service is free and provided “as is”. It may stop working for some sites at any time. We are not responsible for any loss from using it, to the extent the law allows.</p>
<h2>7. Law</h2>
<p>These terms are governed by the laws of India.</p>
<h2>8. Contact</h2>
<p>Questions? Email <a href="mailto:${email}">${email}</a>.</p>`,
};

pages['/contact'] = {
  path: '/contact',
  title: 'Contact us',
  description: `Contact the ${config.siteName} team.`,
  body: `
<h1>Contact us</h1>
<p>Email: <a href="mailto:${email}">${email}</a></p>
<p>We usually reply within 2 working days. When writing about a problem, please tell us:</p>
<ul>
  <li>Which site (YouTube, Instagram, Facebook or Snapchat)</li>
  <li>The error message you saw</li>
  <li>Your phone or browser</li>
</ul>
<p><strong>Copyright owners:</strong> please use the <a href="/report">Report content</a> form, so we can act faster.</p>
<h2>Grievance Officer</h2>
<p>As required under Indian IT rules, complaints can be sent to our Grievance Officer at <a href="mailto:${email}">${email}</a>. We acknowledge complaints within 24 hours and try to resolve them within 15 days.</p>`,
};

pages['/report'] = {
  path: '/report',
  title: 'Report content (copyright takedown)',
  description: `Copyright owners can ask ${config.siteName} to block their content.`,
  body: `
<h1>Report content</h1>
<p>Are you the copyright owner (or acting for them) and want your video blocked on ${site}? Fill in this form. We do not host any videos, but we will block the link on our service so it cannot be downloaded here.</p>
<form id="report-form" class="form" novalidate>
  <label>Your full name <input name="name" required maxlength="120" autocomplete="name"></label>
  <label>Your email <input name="email" type="email" required maxlength="200" autocomplete="email"></label>
  <label>You are
    <select name="role">
      <option>The copyright owner</option>
      <option>Acting for the copyright owner</option>
      <option>Other</option>
    </select>
  </label>
  <label>Link of the content to block <input name="contentUrl" type="url" inputmode="url" required maxlength="2048" placeholder="https://..."></label>
  <label>Describe your original work (or a link to it) <textarea name="originalWork" rows="3" maxlength="2000"></textarea></label>
  <label>Anything else <textarea name="details" rows="3" maxlength="4000"></textarea></label>
  <label class="check"><input type="checkbox" name="goodFaith" required> I believe in good faith that this use is not allowed by the copyright owner, its agent, or the law.</label>
  <label class="check"><input type="checkbox" name="accurate" required> The information in this report is accurate, and I am the owner or allowed to act for the owner.</label>
  <label>Signature (type your full name) <input name="signature" required maxlength="120"></label>
  <button type="submit" class="btn btn-primary btn-block">Send report</button>
  <div id="report-message" class="message" role="alert" hidden></div>
</form>
<p class="small">You can also email <a href="mailto:${email}">${email}</a>. False reports may have legal consequences.</p>`,
};

// ---------------- SEO pages for each platform ----------------
function seoPage({ path, title, description, h1, lead, placeholder, linkTip, intro, faqItems }) {
  const faq = faqBlock(faqItems);
  return {
    path,
    title,
    description,
    body: `
<h1>${h1}</h1>
<p class="lead">${lead}</p>
${toolHtml(placeholder)}
<h2>How to use</h2>
${steps('phone', linkTip)}
${intro}
${faq.html}
<h2>Other downloaders</h2>
${platformLinks}`,
    schema: faq.schema,
  };
}

pages['/youtube-video-downloader'] = seoPage({
  path: '/youtube-video-downloader',
  title: 'YouTube Video Downloader – Save MP4 in 360p to 1080p',
  description: 'Free YouTube video downloader. Save public YouTube videos as MP4 in 360p, 480p, 720p or 1080p with sound. No app, no login.',
  h1: 'YouTube video downloader',
  lead: 'Save public YouTube videos as MP4 in 360p, 480p, 720p or 1080p — with sound.',
  placeholder: 'Paste YouTube link, e.g. https://youtu.be/...',
  linkTip: 'In the YouTube app tap <em>Share</em> → <em>Copy link</em>.',
  intro: `<h2>Good to know</h2>
<p>YouTube keeps HD picture and sound as separate files. ${site} downloads both and joins them into one MP4 so it plays on any phone. On slow 4G, choose <strong>360p or 480p</strong> to save data — they look fine on a phone screen.</p>`,
  faqItems: [
    ['Can I download 1080p YouTube videos?', 'Yes, if the video is available in 1080p. We show only the qualities the video really has.'],
    ['Does it work for long videos?', `Videos up to ${maxMin} minutes are supported.`],
    ['Can I download a playlist?', 'No. Please copy the link of one video at a time.'],
    ['Can I download private or members-only videos?', 'No. Only public videos are supported.'],
  ],
});

pages['/youtube-to-mp3'] = seoPage({
  path: '/youtube-to-mp3',
  title: 'YouTube to MP3 Converter – 128, 192, 320 kbps',
  description: 'Convert your own or free-to-use YouTube videos to MP3 (128, 192 or 320 kbps) or M4A. Free, fast, no login.',
  h1: 'YouTube to MP3',
  lead: 'Save the sound of a public YouTube video as MP3 (128, 192 or 320 kbps) or M4A. Open the <strong>Audio</strong> tab after pasting the link.',
  placeholder: 'Paste YouTube link to convert to MP3',
  linkTip: 'In YouTube tap <em>Share</em> → <em>Copy link</em>.',
  intro: `<h2>Please respect music copyright</h2>
<p>Most songs on YouTube are copyrighted. Use this only for audio you own, lectures and talks you are allowed to save, or content under a free licence (like Creative Commons). For music, use a licensed app such as YouTube Music, JioSaavn or Spotify.</p>
<h2>MP3 or M4A?</h2>
<p><strong>MP3</strong> plays everywhere. <strong>M4A</strong> is often smaller with the same quality, and plays on all modern phones.</p>`,
  faqItems: [
    ['Which MP3 quality should I choose?', '128 kbps is good for speech and saves data. 192 kbps is good for most music. 320 kbps is the largest file.'],
    ['How big is an MP3?', 'About 1 MB per minute at 128 kbps, and about 2.4 MB per minute at 320 kbps.'],
    ['Can I convert a full playlist?', 'No. One video at a time.'],
  ],
});

pages['/youtube-shorts-downloader'] = seoPage({
  path: '/youtube-shorts-downloader',
  title: 'YouTube Shorts Downloader – Save Shorts as MP4',
  description: 'Download public YouTube Shorts as MP4 with sound. Free, no login, works on Android and iPhone.',
  h1: 'YouTube Shorts downloader',
  lead: 'Save public YouTube Shorts as MP4 with sound.',
  placeholder: 'Paste Shorts link, e.g. https://youtube.com/shorts/...',
  linkTip: 'On a Short, tap <em>Share</em> → <em>Copy link</em>.',
  intro: `<h2>Tip</h2><p>Shorts are vertical videos, so “1080p” means 1080 pixels wide. Great for WhatsApp Status — but please only share content you own or have permission to share.</p>`,
  faqItems: [
    ['Do Shorts links work?', 'Yes. Links like youtube.com/shorts/… and youtu.be/… both work.'],
    ['Is there a watermark?', 'We do not add any watermark.'],
  ],
});

pages['/instagram-reel-downloader'] = seoPage({
  path: '/instagram-reel-downloader',
  title: 'Instagram Reel Downloader – Save Reels as MP4',
  description: 'Download public Instagram Reels and video posts as MP4 or MP3. Free, no login needed.',
  h1: 'Instagram Reel downloader',
  lead: 'Save public Instagram Reels and video posts as MP4, or just the audio as MP3.',
  placeholder: 'Paste Instagram Reel link, e.g. https://www.instagram.com/reel/...',
  linkTip: 'On the Reel, tap the <em>Share</em> (paper plane) icon → <em>Copy link</em>.',
  intro: `<h2>Only public accounts</h2>
<p>We can download Reels and posts from <strong>public</strong> accounts only. Private accounts and Stories need a login, so they do not work. Sometimes Instagram limits requests from servers; if that happens, please try again in a few minutes.</p>`,
  faqItems: [
    ['Can I download Instagram Stories?', 'No. Stories need a login, so they are not supported.'],
    ['Can I download a post with many videos?', 'We download the first video in the post.'],
    ['Why does it say “login required”?', 'The account is private, or Instagram is limiting requests right now. Try again later.'],
  ],
});

pages['/facebook-video-downloader'] = seoPage({
  path: '/facebook-video-downloader',
  title: 'Facebook Video Downloader – Save FB Videos & Reels',
  description: 'Download public Facebook videos and Reels as MP4 or MP3 in HD. Free, no login.',
  h1: 'Facebook video downloader',
  lead: 'Save public Facebook videos and Reels as MP4, or the audio as MP3.',
  placeholder: 'Paste Facebook video link, e.g. https://fb.watch/...',
  linkTip: 'Tap <em>Share</em> under the video → <em>Copy link</em>. Links like fb.watch/… work too.',
  intro: `<h2>Only public videos</h2><p>Videos shared to “Friends only” or in private groups cannot be downloaded. The post must be set to <em>Public</em>.</p>`,
  faqItems: [
    ['Do fb.watch links work?', 'Yes. Short fb.watch and facebook.com/share links work.'],
    ['Can I download from private groups?', 'No. Only public videos are supported.'],
  ],
});

pages['/snapchat-spotlight-downloader'] = seoPage({
  path: '/snapchat-spotlight-downloader',
  title: 'Snapchat Spotlight Downloader – Save as MP4',
  description: 'Download public Snapchat Spotlight videos as MP4 or MP3. Free and no login.',
  h1: 'Snapchat Spotlight downloader',
  lead: 'Save public Snapchat Spotlight videos as MP4, or the audio as MP3.',
  placeholder: 'Paste Spotlight link, e.g. https://www.snapchat.com/spotlight/...',
  linkTip: 'On the Spotlight video, tap <em>Share</em> → <em>Copy link</em>.',
  intro: `<h2>Only Spotlight</h2><p>Private snaps, chats and friends’ Stories cannot be downloaded — they are private. Only public Spotlight videos work.</p>`,
  faqItems: [
    ['Can I download someone’s Snap Story?', 'No. Stories and snaps are private. Only public Spotlight videos are supported.'],
    ['Do t.snapchat.com links work?', 'Yes, as long as they open a public Spotlight video.'],
  ],
});

module.exports = { pages };
