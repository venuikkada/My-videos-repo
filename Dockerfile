# Video downloader: Node.js + FFmpeg + yt-dlp in one small image.
FROM node:22-bookworm-slim

ENV NODE_ENV=production

# FFmpeg (merging/converting), Python (needed by yt-dlp), tini (clean shutdown)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp lives in its own folder, owned by the "node" user,
# so scripts/update-ytdlp.sh can update it without root.
# Change YTDLP_CACHE_BUST to force Docker to fetch the newest yt-dlp.
ARG YTDLP_CACHE_BUST=1
RUN python3 -m venv /opt/yt-dlp \
 && /opt/yt-dlp/bin/pip install --no-cache-dir -U "yt-dlp[default]" \
 && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp \
 && chown -R node:node /opt/yt-dlp \
 && yt-dlp --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY data/blocklist.txt ./data/blocklist.txt
RUN mkdir -p /app/tmp && chown -R node:node /app/tmp /app/data

# Never run as root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
