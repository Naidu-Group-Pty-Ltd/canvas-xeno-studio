#!/usr/bin/env bash
# The teaser, from the style frames' renders to the delivery master.
#   scripts/aurixa-teaser/film.sh <work files dir> <living logo take dir> <scratch dir>
# The work files dir is the work's files/ (style-frames/ as style_frames.sh left it, with pkgs/ and data/ linked;
# assets/, fonts/, and sound/ with the score and the eight takes). The living logo take is Reel 1's B1
# (logo-B1-*.jpg, kept in Reel 3's work). The scratch dir takes the lossless reference, about 2 GB.
# Needs what style_frames.sh needs, and FFmpeg with zimg. The full render takes about an hour on four cores.
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"
W="$1" B1="$2" S="$3"
PY="${PYTHON:-python3}"
R="$W/style-frames" P="$W/plates"
mkdir -p "$P" "$W/delivery" "$S"
# The dive's plates: the same city at 18, 7 and 2.5 px a km, the closest at the style frames' view and the other two
# with the property where that view's centre puts it (q = C + (p - C) * 18 / s, C the frame's centre), so one camera
# places all three by scale alone.
"$PY" -I "$T/city.py" "$R" "$P/city-q.png" 2160 s=18 cx=457.9390416110282 cy=1074.2698623758392 > "$P/city-q.json"
"$PY" -I "$T/city.py" "$R" "$P/city-mid.png" 2160 s=7 cx=508.09 cy=1004.44 > "$P/city-mid.json"
"$PY" -I "$T/city.py" "$R" "$P/city-wide.png" 2160 s=2.5 cx=528.6 cy=975.87 > "$P/city-wide.json"
# The night, with margins wide enough for the dive's roll (film.js: the corners carried back into the picture
# reach 167 px left and 375 px right of the frame).
"$PY" -I "$T/orbit.py" "$R" "$P/orbit-dive.png" 2160 heading=14 lon=146.4 sheen=0 padx=480 pady=120 > "$P/orbit-dive.json"
"$PY" -I "$T/sound.py" "$W/sound"
"$PY" -I "$T/master.py" "$W/sound/mix.wav" "$W/sound/master.wav"
"$PY" -I "$T/film.py" "$W" "$B1"
node "$T/render.cjs" "$W/film" "$S"
"$T/encode.sh" "$S/reference.mkv" "$W/sound/master.wav" "$W/delivery/aurixa-teaser.mp4"
