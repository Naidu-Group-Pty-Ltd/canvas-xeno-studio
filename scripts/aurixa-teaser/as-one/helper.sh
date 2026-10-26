#!/usr/bin/env bash
# A helper session's share of As One: frames FIRST to LAST-1, drawn on this machine exactly as the joining session
# draws them, and kept in a work of its own (a child of the teaser's work) for the joining session to pull back.
#   scripts/aurixa-teaser/as-one/helper.sh <teaser work id> <first frame> <last frame, exclusive>
# It pulls only what the page needs from the teaser's work (the fonts, the logo art, the voice's cues and the
# hall's textures), builds the page with film.py, starts its own work under the teaser's, draws its frames under
# work.py run (which keeps the work held and its files saved), and marks it done. The joining session pulls the
# frames back with `work.py pull --work <helper work>` and draws a few of them itself to hold them against the share.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PARENT="$1" FIRST="$2" LAST="$3"
cd "$ROOT"
WORK="python3 scripts/studio-work/work.py"
W="$ROOT/.xeno-work/$PARENT/files"

echo "== the page's inputs from the teaser's work"
$WORK pull --work "$PARENT" --only work/fonts --only work/assets --only work/sound-as-one/cues.json --only work/textures-as-one
for f in fonts/playfair-display-500.ttf fonts/inconsolata-700.ttf assets/logo-clean.png assets/logo-letters.png \
  sound-as-one/cues.json textures-as-one/marble.png textures-as-one/fog.png; do
  [ -s "$W/$f" ] || { echo "missing from the teaser's work: $f" >&2; exit 1; }
done

echo "== Python for the page"
VENV="${TMPDIR:-/tmp}/as-one-venv"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q numpy scipy pillow
"$VENV/bin/python" -I scripts/aurixa-teaser/as-one/film.py "$W" "$W/textures-as-one"

echo "== a work of this share's own"
out=$($WORK start "As One · frames $FIRST to $((LAST - 1))" --parent "$PARENT" --no-project \
  --goal "Frames $FIRST to $((LAST - 1)) of As One, drawn as the joining session draws them, for it to pull back" 2>&1)
echo "$out"
HID=$(echo "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | grep -v "$PARENT" | head -1)
[ -n "$HID" ] || { echo "no work id in start's answer" >&2; exit 1; }
OUT="$ROOT/.xeno-work/$HID/files/frames-$FIRST-$LAST"
mkdir -p "$OUT"

echo "== drawing frames $FIRST to $((LAST - 1)) into $OUT"
$WORK run --work "$HID" -m "Drawing As One frames $FIRST to $((LAST - 1))" -- \
  env RENDER_RANGE="$FIRST:$LAST" node scripts/aurixa-teaser/as-one/render.cjs "$W/film-as-one" "$OUT"
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/reference.mkv"
$WORK save --work "$HID" -m "As One frames $FIRST to $((LAST - 1)) drawn: $OUT/reference.mkv" --status done
$WORK release --work "$HID" --no-save -m "Frames $FIRST to $((LAST - 1)) drawn and saved"
echo "HELPER DONE work=$HID frames=$FIRST:$LAST"
