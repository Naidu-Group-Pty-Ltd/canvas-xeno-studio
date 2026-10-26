#!/bin/bash
# Draws runs of the film at final quality and settles each one by agreement: for a machine drawing its share of the
# film (README, "On more than one machine"), or this one. Each run is drawn with render.cjs. Then the frames
# verify_run.py picks are drawn again independently and put to the vote, and drawn once more where a vote is
# unresolved, up to three times.
#   scripts/aurixa-reel-3/draw_runs.sh <runs dir> <assets dir> <fonts dir|-> first:last [first:last ...]
# <fonts dir> holds the web fonts the film was set in (plates.cjs's cache, in os.tmpdir()). They are copied into this
# machine's cache first, so every machine sets the captions from the same files; "-" leaves the cache as it is. A
# run whose film.json is already verified is left as it is, so the script can simply be run again after a restart.
# No sound is drawn: assemble.py joins the runs under the soundtrack.
set -u
RUNS_DIR=$(realpath -m "$1")
ASSETS=$(realpath "$2")
FONTS=$3
shift 3
cd "$(dirname "$0")/../.." || exit 1
export NODE_PATH=${NODE_PATH:-/opt/node-tools/node_modules}
CACHE=$(node -e 'console.log(require("os").tmpdir())')
if [ "$FONTS" != "-" ]; then
  cp "$FONTS"/*.ttf "$CACHE"/ || exit 1
fi
REDRAWS=${REDRAWS_DIR:-$CACHE/r3-redraws}
verified() {
  python3 -I -c 'import json, sys; sys.exit(0 if "verified" in json.load(open(sys.argv[1])) else 1)' "$1" 2>/dev/null
}
unresolved() {
  python3 -I -c 'import json, sys; print(",".join(map(str, json.load(open(sys.argv[1]))["verified"]["unresolved"])))' "$1"
}
status=0
for run in "$@"; do
  first=${run%:*}
  last=${run#*:}
  dir="$RUNS_DIR/$first-$last"
  if [ -f "$dir/film.json" ] && verified "$dir/film.json"; then
    echo "run $first-$last already drawn and verified"
    continue
  fi
  if [ ! -f "$dir/film.json" ]; then
    rm -rf "$dir"
    mkdir -p "$dir"
    echo "run $first-$last drawing from $(date -u +%H:%M:%S)"
    if ! node scripts/aurixa-reel-3/render.cjs "$dir" "$ASSETS" none "$first" "$last" > "$dir/render.log" 2>&1; then
      echo "run $first-$last FAILED to draw (see $dir/render.log)"
      status=1
      continue
    fi
    tail -1 "$dir/render.log"
  fi
  # The frames to put to the vote: every one the check captured again, its neighbours, and a sample of the rest.
  frames=$(python3 -I scripts/aurixa-reel-3/verify_run.py pick "$dir" | tee "$dir/verify.log" | sed -n 's/.*: //p')
  extras=()
  for k in 1 2 3; do
    [ -n "$frames" ] || break
    out="$REDRAWS/$first-$last-$k"
    rm -rf "$out"
    mkdir -p "$out"
    echo "run $first-$last: drawing again $(echo "$frames" | tr ',' '\n' | wc -l) frames ($k)"
    if ! RENDER_FRAMES=$frames node scripts/aurixa-reel-3/render.cjs "$out" "$ASSETS" none "$first" "$last" > "$out.log" 2>&1; then
      echo "run $first-$last: drawing again FAILED (see $out.log)"
      status=1
      break
    fi
    extras+=("$out")
    python3 -I scripts/aurixa-reel-3/verify_run.py settle "$dir" - 0 "${extras[@]}" | tee -a "$dir/verify.log"
    frames=$(unresolved "$dir/film.json")
  done
  if [ -n "$frames" ]; then
    echo "run $first-$last: frames $frames still unresolved"
    status=1
  fi
  echo "run $first-$last done $(date -u +%H:%M:%S)"
done
echo "all done $(date -u +%H:%M:%S), status $status"
exit $status
