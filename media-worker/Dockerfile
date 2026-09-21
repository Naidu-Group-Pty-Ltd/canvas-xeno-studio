FROM node:22-bookworm-slim

# FFmpeg is the only system dependency; everything else is Node built-ins.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=8080 \
    WORK_DIR=/tmp/xeno-media

# Runs unprivileged: the worker only needs a temp directory.
RUN mkdir -p /tmp/xeno-media && chown -R node:node /tmp/xeno-media /app
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
