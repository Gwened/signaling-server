# WebRTC Signaling Server (Bun) — for Dokploy or any Docker host
# Build: docker build -t signaling-server .
# Run:   docker run -p 3001:3001 -e BOTS_ENABLED=1 -e ENABLE_NOTIFICATIONS=0 signaling-server

FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Application code
COPY . .

RUN chown -R bun:bun /app

EXPOSE 3001

# Same as systemd: bun run main.ts
# Env vars (set in Dokploy): NODE_ENV, BOTS_ENABLED, ENABLE_NOTIFICATIONS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, OFFICIAL_ORIGIN
ENV NODE_ENV=production

USER bun

CMD ["bun", "run", "main.ts"]
