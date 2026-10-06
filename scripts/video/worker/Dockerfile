FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY scripts/video/worker/package*.json ./
RUN npm ci --omit=dev
COPY scripts/video/worker/worker.mjs ./
COPY scripts/video/package-hls.mjs ./
CMD ["node", "worker.mjs"]
