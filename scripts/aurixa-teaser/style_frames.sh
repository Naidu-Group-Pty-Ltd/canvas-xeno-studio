#!/usr/bin/env bash
# The teaser's style frames and storyboard, from nothing but public data and the films' own pieces.
#   scripts/aurixa-teaser/style_frames.sh <cache dir> <render dir> <assets dir> <fonts dir>
# Needs a Python with numpy, scipy and Pillow, Node with Playwright, and about 4 GB of memory for the renders.
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"
CACHE="$1" R="$2" ASSETS="$3" FONTS="$4"
PY="${PYTHON:-python3}"
mkdir -p "$R/final"
"$PY" -I "$T/fetch.py" "$CACHE"
# Renders read the cache's pkgs/ and data/; they write to the render dir.
ln -sfn "$(cd "$CACHE" && pwd)/pkgs" "$R/pkgs"
ln -sfn "$(cd "$CACHE" && pwd)/data" "$R/data"
"$PY" -I "$T/orbit.py" "$R" "$R/final/orbit-2160.png" 2160 heading=14 lon=146.4 sheen=0 > "$R/final/orbit-2160.json"
"$PY" -I "$T/city.py" "$R" "$R/final/city-2160.png" 2160 > "$R/final/city-2160.json"
"$PY" -I "$T/city.py" "$R" "$R/final/city-q-2160.png" 2160 s=18 boxy=1000 > "$R/final/city-q-2160.json"
"$PY" -I "$T/frames.py" "$R" "$ASSETS" "$FONTS"
node "$T/shoot.cjs" "$R/frames"
"$PY" -I "$T/board.py" "$R" "$FONTS"
node "$T/shoot_board.cjs" "$R/frames" "$R/frames/board.png"
echo "frames and storyboard in $R/frames"
