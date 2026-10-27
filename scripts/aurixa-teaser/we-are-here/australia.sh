#!/usr/bin/env bash
# We Are Here, the Australia version: frames 490 to the end drawn again (the Earth from 21 s, frame 504; frames 490 to
# 503 come out as delivered, which keeps every run's start on a frame comp.py draws), the opening's two runs kept as
# delivered (part-00000, frames 0-289; part-00290, 290-489), all joined, laid on As One's soundtrack and measured as
# film.sh does.
#   scripts/aurixa-teaser/we-are-here/australia.sh <work files dir> <python with numpy and OpenCV> [out dir]
# The map data must be in the work's cache (<work>/../cache, from ../fetch.py). With [out dir] the new runs, the
# picture and the master go there (a draft to review); without it, into the work's we-are-here/film and we-are-here.
set -euo pipefail
WORK="$(cd "$1" && pwd)" PY="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$WORK/we-are-here"
KEEP="$ROOT/film"
OUT="${3:-$KEEP}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
FRAMES=1092
# Four runs of about equal cost: the drop's and the chase's fast moves are drawn at the most moments of the shutter.
BOUNDS=(490 640 770 930 "$FRAMES")
for f in part-00000.mkv part-00290.mkv; do
  [ -s "$KEEP/$f" ] || { echo "$KEEP/$f is missing: the opening's runs are kept as delivered (HANDOFF.md 4.4)" >&2; exit 1; }
done
pids=()
for k in 0 1 2 3; do
  a=${BOUNDS[$k]} b=${BOUNDS[$((k + 1))]}
  OMP_NUM_THREADS=1 "$PY" -I "$HERE/comp.py" "$WORK" "$a:$b" --out "$OUT/part-$(printf %05d "$a").mkv" \
    > "$OUT/run-$k.log" 2>&1 &
  pids+=($!)
done
st=0
for p in "${pids[@]}"; do wait "$p" || st=1; done
[ $st -eq 0 ] || { tail -5 "$OUT"/run-*.log >&2; exit 1; }
{
  printf "file '%s'\n" "$KEEP/part-00000.mkv" "$KEEP/part-00290.mkv"
  for k in 0 1 2 3; do printf "file '%s'\n" "$OUT/part-$(printf %05d "${BOUNDS[$k]}").mkv"; done
} > "$OUT/parts.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$OUT/parts.txt" -c copy "$OUT/picture.mkv"
n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/picture.mkv")
[ "$n" = "$FRAMES" ] || { echo "the picture has $n frames, not $FRAMES" >&2; exit 1; }
DEST="$ROOT"
[ "$OUT" = "$KEEP" ] || DEST="$OUT"
"$HERE/../encode.sh" "$OUT/picture.mkv" "$WORK/sound-as-one/master.wav" "$DEST/we-are-here-australia-1080x1920.mp4" 45.5 24
"$PY" -I "$HERE/../qc.py" "$DEST/we-are-here-australia-1080x1920.mp4" "$OUT/picture.mkv" "$DEST/qc-australia.json" "$FRAMES" 24
