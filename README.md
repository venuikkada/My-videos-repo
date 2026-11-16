# MySiteName – free video & audio downloader

A free website that saves **public** videos and audio from **YouTube, Instagram (Reels/posts), Facebook (videos/Reels) and Snapchat Spotlight**.
No login. No pop-ups. No fake buttons. Built for cheap Android phones and slow 4G.

- **Backend:** Node.js 20+ (Express), **yt-dlp** (reads videos), **FFmpeg** (joins video + audio, makes MP3/M4A)
- **Frontend:** plain HTML/CSS/JS (≈30 KB in total, no framework), English + optional Hindi/Telugu labels
- **Change the site name** with `SITE_NAME` in `.env` (it is “MySiteName” until you set it).

> ⚠️ Download only content you own or have permission to download. Respect copyright.

---

## 1. Folder structure

```
.
├── src/
│   ├── server.js          # starts Express: security headers, routes, error handler
│   ├── config.js          # all settings (read from .env)
│   ├── platforms.js       # link whitelist + platform detection + clean links
│   ├── ytdlp.js           # runs yt-dlp (info + downloads)
│   ├── ffmpeg.js          # merge / convert with FFmpeg
│   ├── formats.js         # turns yt-dlp formats into 360p…1080p + MP3/M4A choices
│   ├── jobs.js            # job queue, progress, timeouts
│   ├── cleanup.js         # deletes files after 30 min
│   ├── infoCache.js       # short RAM cache (15 min) for video info + thumbnails
│   ├── blocklist.js       # takedown blocklist (data/blocklist.txt)
│   ├── runProcess.js      # safe spawn() helper (no shell)
│   ├── errors.js          # clear error messages
│   ├── logger.js          # anonymous logs (no IPs, no links)
│   ├── routes/api.js      # /api/info, /api/jobs, /api/jobs/:id, /api/files/:id (+ thumb, report)
│   ├── routes/pages.js    # HTML pages, sitemap.xml, robots.txt
│   └── views/             # layout, downloader box, page text (edit text here)
├── public/                # css/style.css, js/app.js, js/i18n.js, favicon.svg
├── data/blocklist.txt     # videos blocked after takedown requests
├── deploy/nginx.conf      # Nginx config for the VPS
├── scripts/update-ytdlp.sh
├── test/                  # unit + end-to-end tests (fake yt-dlp, real FFmpeg)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 2. Pages

| Page | URL |
|---|---|
| Home (downloader) | `/` |
| How it works | `/how-it-works` |
| FAQ | `/faq` |
| Privacy Policy | `/privacy` |
| Terms | `/terms` |
| Contact | `/contact` |
| Report content (takedown form) | `/report` |
| SEO pages | `/youtube-video-downloader`, `/youtube-to-mp3`, `/youtube-shorts-downloader`, `/instagram-reel-downloader`, `/facebook-video-downloader`, `/snapchat-spotlight-downloader` |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` |

Every page shows the copyright note at the top and in the footer.
To add a new SEO page, copy one `seoPage({...})` block in `src/views/pages.js` and add the link in `src/views/layout.js` (`FOOTER_LINKS`).

## 3. API

| Route | What it does |
|---|---|
| `POST /api/info` `{ "url": "..." }` | Returns `title`, `thumbnail`, `duration`, `durationText`, `video[]` (360p/480p/720p/1080p, only if available, with size) and `audio[]` (MP3 128/192/320, M4A). |
| `POST /api/jobs` `{ "url": "...", "type": "video", "quality": "720" }` | Starts a job. Returns `202 { jobId }`. `type` is `video` or `audio`; `quality` is a value from `/api/info` (e.g. `"720"`, `"best"`, `"mp3-192"`, `"m4a"`). |
| `GET /api/jobs/:id` | `{ status: queued \| processing \| ready \| failed, stage, progress (0–100), error?, downloadUrl? }` |
| `GET /api/files/:id` | Sends the finished file from our server (supports resume on slow networks). |

Errors always look like `{ "error": "Simple English message", "code": "PRIVATE" }`.

**How a 1080p download works:** if the chosen video stream has no sound, the server downloads the best video stream and the best audio stream separately with yt-dlp, then joins them with FFmpeg into one MP4 (video is copied, not re-encoded, so it is fast and cheap). The progress bar shows: downloading video (0–70%) → audio (70–85%) → joining (85–100%).

## 4. Security and privacy (built in)

- **Whitelist:** only exact host names of the 4 platforms are accepted. Links are **rebuilt** from the video ID (e.g. `https://www.youtube.com/watch?v=ID`), so users cannot point our server at other sites or at our own network.
- **yt-dlp is locked** to the 4 extractors (`--use-extractors`), so its “download from any website” mode can never run.
- **No shell:** yt-dlp and FFmpeg are run with `spawn()` and an argument array, with `--` before the link.
- The browser only sends a choice like `"720"`; the real format codes stay on the server.
- **Limits** (all in `.env`): 10 jobs/IP/hour, 60 min max length, 500 MB max size, 2 jobs at once, 15 min job timeout.
- **Privacy:** logs contain no IPs and no links. Rate limiting keeps only a hashed IP in RAM for 1 hour. Files are deleted after 30 minutes; video info is kept in RAM for 15 minutes.
- Strict security headers (CSP): only our own scripts run — no ads, no trackers.

## 5. Run on your computer

### Option A – Docker (easiest)

```bash
cp .env.example .env        # then edit SITE_NAME, SITE_URL, CONTACT_EMAIL
docker compose up -d --build
# open http://localhost:3000
```

### Option B – without Docker

You need Node.js 20+, Python 3.10+, FFmpeg.

```bash
# Ubuntu / Debian
sudo apt install -y ffmpeg python3 python3-venv
python3 -m venv ~/yt-dlp && ~/yt-dlp/bin/pip install -U "yt-dlp[default]"
export YTDLP_PATH=~/yt-dlp/bin/yt-dlp

npm install
cp .env.example .env
npm start                  # or: npm run dev (auto-restart on changes)
```

(On Windows, install FFmpeg and yt-dlp, make sure both are in PATH, then `npm install && npm start`.)

### Tests

```bash
npm test
```

The tests use a fake yt-dlp (no internet needed) and the real FFmpeg, and check: link detection, format choices, a full 1080p merge (checks the MP4 has video **and** audio), MP3/M4A, rate limits, pages and the report form.

## 6. Deploy on a VPS (Ubuntu 24.04)

**Which VPS?** Start with 2 vCPU / 2–4 GB RAM / 40+ GB disk and **plenty of bandwidth** (each download passes through your server twice: in from YouTube, out to the user).
Rough cost: ₹500–₹1,200/month (e.g. DigitalOcean/Vultr/Linode Mumbai or Bangalore, Hostinger VPS, Hetzner). Prefer a plan with **unmetered or 2+ TB bandwidth**.

```bash
# 1. Log in and update
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y

# 2. Firewall: only SSH + web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# 3. Install Docker
curl -fsSL https://get.docker.com | sh

# 4. Get the code
git clone https://github.com/YOUR_GITHUB/YOUR_REPO.git /opt/downloader
cd /opt/downloader
cp .env.example .env && nano .env      # set SITE_NAME, SITE_URL=https://yourdomain.com, CONTACT_EMAIL

# 5. Start the app (listens only on 127.0.0.1:3000)
docker compose up -d --build
curl http://127.0.0.1:3000/healthz      # should print {"ok":true,...}

# 6. Nginx + free HTTPS
apt install -y nginx certbot python3-certbot-nginx
cp deploy/nginx.conf /etc/nginx/sites-available/downloader
sed -i 's/example.com/yourdomain.com/g' /etc/nginx/sites-available/downloader
ln -s /etc/nginx/sites-available/downloader /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Point your domain’s **A record** to the server IP before running certbot.

**Privacy note:** the Nginx config uses a log format **without IP addresses**, to match the Privacy Policy. If you add Cloudflare, also turn off any logging you don’t need there.

**Update the site later:**

```bash
cd /opt/downloader && git pull && docker compose up -d --build
```

**See logs:** `docker compose logs -f --tail=100`

## 7. Keep yt-dlp updated (important!)

YouTube, Instagram and Facebook change often. When they do, downloads break until yt-dlp is updated (usually within days).

```bash
./scripts/update-ytdlp.sh            # quick update inside the running container
./scripts/update-ytdlp.sh --rebuild  # rebuild the image with the newest yt-dlp (permanent)
./scripts/update-ytdlp.sh --local    # if you run without Docker
```

Run it automatically every night at 4:10 AM:

```bash
crontab -e
# add this line:
10 4 * * * cd /opt/downloader && ./scripts/update-ytdlp.sh --rebuild >> /var/log/ytdlp-update.log 2>&1
```

## 8. Handling takedown reports

1. Reports from `/report` are saved to `data/reports.jsonl` (one JSON per line). Check it daily:
   `tail -n 5 data/reports.jsonl`
2. Each report includes a ready line like `youtube:dQw4w9WgXcQ`. If the report is valid, add that line to `data/blocklist.txt`.
3. The site reloads the blocklist within 1 minute. No restart needed.

Indian IT Rules expect you to acknowledge complaints within 24 hours. Set `CONTACT_EMAIL` to an inbox you actually check.

## 9. Settings (`.env`)

| Setting | Default | Meaning |
|---|---|---|
| `SITE_NAME` | MySiteName | Name shown on all pages |
| `SITE_URL` | http://localhost:3000 | Used for SEO links and sitemap |
| `CONTACT_EMAIL` | contact@example.com | Shown on Contact/Privacy/Terms |
| `JOBS_PER_HOUR` | 10 | Downloads per visitor per hour |
| `INFO_PER_HOUR` | 60 | “Get options” per visitor per hour |
| `MAX_DURATION_MINUTES` | 60 | Longest video |
| `MAX_FILE_SIZE_MB` | 500 | Biggest file |
| `MAX_CONCURRENT_JOBS` | 2 | Jobs at the same time (≈ 1 per CPU core) |
| `MAX_QUEUED_JOBS` | 50 | Jobs waiting in line |
| `JOB_TIMEOUT_MINUTES` | 15 | Stuck jobs are killed |
| `FILE_TTL_MINUTES` | 30 | Files deleted after this |
| `TRUST_PROXY` | loopback, uniquelocal | Which proxy may tell us the visitor IP |

## 10. Honest notes before you launch

- **YouTube often blocks VPS/data-centre IPs** (“Sign in to confirm you’re not a bot”). Expect some YouTube failures; the site shows a clear “try again later” message. Do **not** add your personal Google cookies to get around this — the account can get banned.
- **Instagram** often asks for a login from servers. Public Reels work most of the time, but not always.
- **Legal risk:** downloading is against YouTube’s Terms of Service, and “YouTube to MP3” sites have been sued and shut down (e.g. YouTube-mp3.org in 2017). Keep the takedown process working, respond fast, and talk to a lawyer before running ads at scale.
- **Google AdSense** usually rejects YouTube downloader sites. Plan other income (e.g. a simple sponsor banner — never fake download buttons).
- Jobs are kept in RAM: one server process only. For more traffic, add a bigger VPS first; a shared queue (Redis) is the next step.
