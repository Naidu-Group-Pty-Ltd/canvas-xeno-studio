#!/usr/bin/env bash
# We Are Here, from its parts to its delivery master: the composite in four runs side by side (comp.py), joined into
# one picture, laid on As One's soundtrack at 24 frames a second (../encode.sh), and measured (../qc.py).
#   scripts/aurixa-teaser/we-are-here/film.sh <work files dir> <python with numpy and OpenCV>
# The plates (plates.py), the masks (masks.py), the tracks (track.py), the textures (textures.cjs) and the words
# (type.py, type.cjs) come first; README.md has the order.
set -euo pipefail
WORK="$(cd "$1" && pwd)" PY="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$WORK/we-are-here"
FILM="$ROOT/film"
mkdir -p "$FILM"
FRAMES=1092
# Runs of about equal cost: the office's panes and glass, and the five bands, take the longest per frame.
BOUNDS=(0 260 470 760 "$FRAMES")
pids=()
for k in 0 1 2 3; do
  "$PY" -I "$HERE/comp.py" "$WORK" "${BOUNDS[$k]}:${BOUNDS[$((k + 1))]}" > "$FILM/run-$k.log" 2>&1 &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
: > "$FILM/parts.txt"
for k in 0 1 2 3; do
  printf "file '%s'\n" "$FILM/part-$(printf %05d "${BOUNDS[$k]}").mkv" >> "$FILM/parts.txt"
done
ffmpeg -y -v error -f concat -safe 0 -i "$FILM/parts.txt" -c copy "$FILM/picture.mkv"
n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$FILM/picture.mkv")
[ "$n" = "$FRAMES" ] || { echo "the picture has $n frames, not $FRAMES" >&2; exit 1; }
"$HERE/../encode.sh" "$FILM/picture.mkv" "$WORK/sound-as-one/master.wav" "$ROOT/we-are-here-1080x1920.mp4" 45.5 24
"$PY" -I "$HERE/../qc.py" "$ROOT/we-are-here-1080x1920.mp4" "$FILM/picture.mkv" "$ROOT/qc.json" "$FRAMES" 24
