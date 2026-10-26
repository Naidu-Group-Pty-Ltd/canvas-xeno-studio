#!/bin/bash
# Draws the whole film with render.cjs one scene's run at a time, so a restart loses one run at most: run it
# again and it carries on from the first run without a film.json. Then join the runs with Reel 1's assemble.py.
#   scripts/aurixa-reel-3/render_queue.sh <runs dir> <assets dir> <soundtrack.wav> [run ...]
# Each run is a scene's shots (scenes/*.cjs). Runs named after the soundtrack (first:last, e.g. 05.1:05.2) are drawn
# first, in that order, then the rest in film order.
set -u
RUNS_DIR=$(realpath -m "$1")
ASSETS=$(realpath "$2")
SOUNDTRACK=$(realpath "$3")
shift 3
cd "$(dirname "$0")/../.." || exit 1
ALL="01.1:01.3 02.1:02.3 03.1:03.1 04.1:04.2 05.1:05.2 05.3:05.5 05.6:05.6 06.1:06.3 06.4:06.4 07.1:07.3 07.4:07.4 08.1:08.3 09.1:09.3 10.1:10.1 11.1:11.1 12.1:12.1 13.1:13.1 14.1:14.1"
ORDER="$*"
for run in $ALL; do
  case " $ORDER " in *" $run "*) ;; *) ORDER="$ORDER $run" ;; esac
done
for run in $ORDER; do
  first=${run%:*}
  last=${run#*:}
  dir="$RUNS_DIR/$first-$last"
  if [ -f "$dir/film.json" ]; then
    echo "run $first-$last already drawn"
    continue
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  echo "run $first-$last starting $(date -u +%H:%M:%S)"
  NODE_PATH=${NODE_PATH:-/opt/node-tools/node_modules} node scripts/aurixa-reel-3/render.cjs "$dir" "$ASSETS" "$SOUNDTRACK" "$first" "$last" > "$dir/render.log" 2>&1
  echo "run $first-$last exited $? at $(date -u +%H:%M:%S)"
done
echo "queue done $(date -u +%H:%M:%S)"
