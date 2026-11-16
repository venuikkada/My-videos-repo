#!/usr/bin/env bash
# Updates yt-dlp. Sites like YouTube change often, so run this daily
# (see README: "Keep yt-dlp updated").
#
#   ./scripts/update-ytdlp.sh            quick update inside the running container
#   ./scripts/update-ytdlp.sh --rebuild  rebuild the Docker image with the newest yt-dlp
#   ./scripts/update-ytdlp.sh --local    update yt-dlp installed without Docker
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  --rebuild)
    echo "Rebuilding image with the newest yt-dlp..."
    docker compose build --build-arg YTDLP_CACHE_BUST="$(date +%s)" app
    docker compose up -d app
    docker compose exec -T app yt-dlp --version
    ;;
  --local)
    if [ -x /opt/yt-dlp/bin/pip ]; then
      /opt/yt-dlp/bin/pip install -q -U "yt-dlp[default]"
    else
      python3 -m pip install -q -U --user "yt-dlp[default]"
    fi
    yt-dlp --version
    ;;
  *)
    echo "Updating yt-dlp inside the running container..."
    docker compose exec -T app /opt/yt-dlp/bin/pip install -q -U "yt-dlp[default]"
    echo -n "yt-dlp version now: "
    docker compose exec -T app yt-dlp --version
    echo "Done. (This lasts until the container is rebuilt; use --rebuild to make it permanent.)"
    ;;
esac
