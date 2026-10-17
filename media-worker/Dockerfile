FROM node:22-bookworm-slim

# FFmpeg is the only system dependency; everything else is Node built-ins.
# Inter is the typeface for burned-in captions and titles.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-inter \
  && rm -rf /var/lib/apt/lists/*

# Lip scores (the lip_check task, see src/lipcheck.js): SyncNet in its own
# Python, with MediaPipe to find the face. Optional and best effort: built
# with LIP_CHECK=0, or if anything here can't be fetched, the worker simply
# doesn't offer lip_check and the app goes on without scores. Kept before the
# code, so a change to the worker doesn't rebuild it.
#   - SyncNetModel.py: joonson/syncnet_python (MIT), at a fixed commit.
#   - syncnet_v2.model: its weights, from the authors' site (its sha256 is
#     printed; set SYNCNET_SHA256 to require it).
#   - face_landmarker.task: MediaPipe's face landmark model.
ARG LIP_CHECK=1
ARG SYNCNET_COMMIT=907c0b579c2e2d83f0eae1b2ac9e720cde4e5623
ARG SYNCNET_MODEL_SHA256=41b85aed0006546cb2d6dc9180c5bc3dac737ab80eff643022e397a349c30c22
ARG SYNCNET_SHA256=
ARG FACE_MODEL_SHA256=64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
# (A chain of &&, not set -e: errexit is ignored on the left of ||.)
RUN if [ "$LIP_CHECK" = "1" ]; then \
    ( apt-get update \
      && apt-get install -y --no-install-recommends python3 python3-venv curl libgl1 libegl1 libglib2.0-0 \
      && rm -rf /var/lib/apt/lists/* \
      && mkdir -p /opt/lipcheck/syncnet /opt/lipcheck/models \
      && base="https://raw.githubusercontent.com/joonson/syncnet_python/$SYNCNET_COMMIT" \
      && curl -fsSL "$base/SyncNetModel.py" -o /opt/lipcheck/syncnet/SyncNetModel.py \
      && curl -fsSL "$base/LICENSE.md" -o /opt/lipcheck/syncnet/LICENSE.md \
      && echo "$SYNCNET_MODEL_SHA256  /opt/lipcheck/syncnet/SyncNetModel.py" | sha256sum -c - \
      && curl -fsSL https://www.robots.ox.ac.uk/~vgg/software/lipsync/data/syncnet_v2.model -o /opt/lipcheck/syncnet/syncnet_v2.model \
      && sha256sum /opt/lipcheck/syncnet/syncnet_v2.model \
      && { [ -z "$SYNCNET_SHA256" ] || echo "$SYNCNET_SHA256  /opt/lipcheck/syncnet/syncnet_v2.model" | sha256sum -c -; } \
      && curl -fsSL https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task -o /opt/lipcheck/models/face_landmarker.task \
      && echo "$FACE_MODEL_SHA256  /opt/lipcheck/models/face_landmarker.task" | sha256sum -c - \
      && python3 -m venv /opt/lipcheck/venv \
      && /opt/lipcheck/venv/bin/pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu \
      && /opt/lipcheck/venv/bin/pip install --no-cache-dir numpy==1.26.4 scipy==1.13.1 mediapipe==0.10.14 python_speech_features==0.6 \
      && /opt/lipcheck/venv/bin/python -c "import torch, cv2, mediapipe, python_speech_features, scipy" \
    ) || ( echo "lip_check could not be installed: the worker runs without it"; rm -rf /opt/lipcheck/venv /opt/lipcheck/syncnet ); \
  fi

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY lipcheck/syncnet_score.py /opt/lipcheck/syncnet_score.py

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
