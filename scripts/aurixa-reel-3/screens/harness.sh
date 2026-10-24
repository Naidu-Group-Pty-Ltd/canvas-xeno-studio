#!/usr/bin/env bash
# The screens harness: start or stop its backend (engine/server.ts) and its pages (vite), each on its own ports, so
# several can run side by side. Their pids and logs go in <work dir>.
#   ./harness.sh start <factfind-parsed.json> <work dir> [harness port] [engine port]
#   ./harness.sh stop <work dir>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cmd="$1"; shift
if [ "$cmd" = start ]; then
  parsed="$1"; work="$2"; hport="${3:-5198}"; eport="${4:-5299}"
  mkdir -p "$work"
  for p in "$hport" "$eport"; do
    if (exec 3<>/dev/tcp/127.0.0.1/"$p") 2>/dev/null; then echo "port $p is already in use" >&2; exit 1; fi
  done
  # exec all the way down, so the pid kept is the server's own.
  (cd "$HERE/engine" && exec nohup env REEL_ENGINE_PORT="$eport" NODE_PATH="$HERE/node_modules" bun server.ts "$parsed" "$work/engine") > "$work/engine.log" 2>&1 &
  echo $! > "$work/engine.pid"
  (cd "$HERE" && exec nohup env REEL_HARNESS_PORT="$hport" NODE_PATH="$HERE/node_modules" "$HERE/node_modules/.bin/vite" --config vite.config.ts) > "$work/vite.log" 2>&1 &
  echo $! > "$work/vite.pid"
  for i in $(seq 1 60); do
    curl -sf -X POST "localhost:$eport/fn/__log" > /dev/null && curl -sf "localhost:$hport/" > /dev/null && { echo "harness on :$hport, engine on :$eport"; exit 0; }
    sleep 1
  done
  echo "the harness did not start: see $work/engine.log and $work/vite.log" >&2; exit 1
elif [ "$cmd" = stop ]; then
  work="$1"
  for f in engine vite; do
    if [ -f "$work/$f.pid" ]; then
      pid="$(cat "$work/$f.pid")"; kill "$pid" 2>/dev/null || true
      for i in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
      rm -f "$work/$f.pid"
    fi
  done
  echo stopped
fi
