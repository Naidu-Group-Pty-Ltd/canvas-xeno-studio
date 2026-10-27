#!/usr/bin/env bash
# We Are Here, from its parts to its delivery master: every frame drawn in twelve runs, four at a time (comp.py),
# joined into one picture, laid on As One's soundtrack at 24 frames a second (../encode.sh), and measured (../qc.py).
#   scripts/aurixa-teaser/we-are-here/film.sh <work files dir> <python with numpy and OpenCV> [name]
# The map data (../fetch.py, ../terrain.py), the textures (textures.cjs), the tiers' names (comp.py --labels) and the
# words (type.py, type.cjs) come first; README.md has the order. The runs go to we-are-here/film (or, with a name,
# we-are-here/film-<name>), the master to we-are-here/we-are-here[-<name>]-1080x1920.mp4 and its measures beside it.
set -euo pipefail
WORK="$(cd "$1" && pwd)" PY="$2" NAME="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$WORK/we-are-here"
FILM="$ROOT/film${NAME:+-$NAME}"
MASTER="we-are-here${NAME:+-$NAME}"
mkdir -p "$FILM"
FRAMES=1092 RUNS=12 AT_ONCE=4
# Twelve runs of 91 frames, four drawn side by side, each taking the next as one ends: the frames' cost varies five
# times over the film (the drop's and the dive's fast moves draw the land at up to ten moments), and many short runs
# share it out without a guess at where it falls.
BOUNDS=()
for ((k = 0; k <= RUNS; k++)); do BOUNDS+=($((FRAMES * k / RUNS))); done
run() {
  local a=${BOUNDS[$1]} b=${BOUNDS[$(($1 + 1))]}
  OMP_NUM_THREADS=1 "$PY" -I "$HERE/comp.py" "$WORK" "$a:$b" --out "$FILM/part-$(printf %05d "$a").mkv" \
    > "$FILM/run-$1.log" 2>&1
}
for ((k = 0; k < RUNS; k++)); do
  while [ "$(jobs -rp | wc -l)" -ge "$AT_ONCE" ]; do wait -n || true; done
  run "$k" &
done
wait || true
# every run checked by its packets (one a frame) before anything is joined
: > "$FILM/parts.txt"
for ((k = 0; k < RUNS; k++)); do
  a=${BOUNDS[$k]} b=${BOUNDS[$((k + 1))]} part="$FILM/part-$(printf %05d "${BOUNDS[$k]}").mkv"
  got=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "$part" \
    2>/dev/null || echo 0)
  [ "$got" = "$((b - a))" ] || { echo "run $k (frames $a to $((b - 1))) holds $got frames:" >&2; tail -5 "$FILM/run-$k.log" >&2; exit 1; }
  printf "file '%s'\n" "$part" >> "$FILM/parts.txt"
done
ffmpeg -y -v error -f concat -safe 0 -i "$FILM/parts.txt" -c copy "$FILM/picture.mkv"
n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$FILM/picture.mkv")
[ "$n" = "$FRAMES" ] || { echo "the picture has $n frames, not $FRAMES" >&2; exit 1; }
"$HERE/../encode.sh" "$FILM/picture.mkv" "$WORK/sound-as-one/master.wav" "$ROOT/$MASTER-1080x1920.mp4" 45.5 24
"$PY" -I "$HERE/../qc.py" "$ROOT/$MASTER-1080x1920.mp4" "$FILM/picture.mkv" "$ROOT/qc${NAME:+-$NAME}.json" "$FRAMES" 24
