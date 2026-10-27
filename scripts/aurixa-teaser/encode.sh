#!/usr/bin/env bash
# The teaser's delivery master: render.cjs's lossless reference with master.py's sound.
#   scripts/aurixa-teaser/encode.sh <reference.mkv> <master.wav> <out.mp4> [seconds] [fps]
# Picture: 1080 x 1920 at 30 fps (or [fps]: We Are Here is 24), BT.709 4:2:0 in the TV range by zimg with error-diffusion dither (so the night's
# gradients don't band), x264 High at CRF 14 with its dark-scene adaptive quantisation, every colour tag written,
# as Reels 2 and 3 were delivered. Sound: AAC-LC at 256 kb/s, 48 kHz stereo. The sound is cut to the picture's
# length (Three Questions' 37.5 seconds unless given; As One's is 45.5), and both start at zero.
set -euo pipefail
REF="$1" WAV="$2" OUT="$3" LEN="${4:-37.5}" FPS="${5:-30}"
ffmpeg -y -hide_banner -loglevel error \
  -i "$REF" -i "$WAV" \
  -filter_complex "[0:v]format=gbrp,zscale=rangein=full:primariesin=709:transferin=709:matrixin=709:primaries=709:transfer=709:matrix=709:range=limited:dither=error_diffusion,format=yuv420p[v]" \
  -map "[v]" -map 1:a \
  -c:v libx264 -preset slow -crf 14 -profile:v high -level:v 4.2 -x264-params aq-mode=3:aq-strength=0.9 \
  -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -r "$FPS" -g "$((FPS * 2))" \
  -c:a aac -b:a 256k -ar 48000 -ac 2 \
  -t "$LEN" -movflags +faststart "$OUT"
echo "$OUT"
