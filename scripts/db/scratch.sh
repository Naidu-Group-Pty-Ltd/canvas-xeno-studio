#!/usr/bin/env bash
# A scratch Postgres built the way the live database was: Supabase's stand-ins
# (scripts/db/stand-ins.sql), Lovable's migrations (supabase/migrations), then
# the studio's own (drizzle/migrations, in the journal's order). Each of the
# studio's migrations that says it can run again is then run a second time,
# and the SQL tests in tests/sql are run against it.
#
#   scripts/db/scratch.sh                 # build, check, test, then throw it away
#   scripts/db/scratch.sh --keep          # leave it running and say how to connect
#   scripts/db/scratch.sh tests/sql/work.sql   # only these tests
#
# Needs Postgres 16's server binaries (PG_BIN, default /usr/lib/postgresql/16/bin).
# Run as root, the server runs as the postgres user (Postgres refuses root).
# Nothing here touches a real database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${XENO_SCRATCH_PORT:-54329}"
KEEP=0
TESTS=()
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    *) TESTS+=("$arg") ;;
  esac
done
if [ ${#TESTS[@]} -eq 0 ]; then
  shopt -s nullglob
  TESTS=("$ROOT"/tests/sql/*.sql)
fi

DIR="$(mktemp -d "${TMPDIR:-/tmp}/xeno-scratch-pg-XXXXXX")"
as_pg=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$DIR"
  as_pg=(runuser -u postgres --)
fi

stop() {
  "${as_pg[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
if [ "$KEEP" = "0" ]; then trap stop EXIT; fi

"${as_pg[@]}" "$PG_BIN/initdb" -D "$DIR/data" -U postgres --auth=trust --encoding=UTF8 >/dev/null
"${as_pg[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -l "$DIR/server.log" \
  -o "-c listen_addresses='' -k $DIR -p $PORT -c fsync=off" -w start >/dev/null

# Every file through stdin, so the server's user never needs to read the checkout.
sql() {
  "${as_pg[@]}" "$PG_BIN/psql" -X -q -h "$DIR" -p "$PORT" -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --set=SHOW_CONTEXT=errors "$@"
}
apply() {
  local file="$1"
  if ! out="$(sql -f - < "$file" 2>&1)"; then
    echo "FAILED: ${file#$ROOT/}" >&2
    echo "$out" >&2
    exit 1
  fi
}

apply "$ROOT/scripts/db/stand-ins.sql"
for file in "$ROOT"/supabase/migrations/*.sql; do apply "$file"; done
mapfile -t TAGS < <(python3 -c 'import json,sys; [print(e["tag"]) for e in json.load(open(sys.argv[1]))["entries"]]' \
  "$ROOT/drizzle/migrations/meta/_journal.json")
for tag in "${TAGS[@]}"; do apply "$ROOT/drizzle/migrations/$tag.sql"; done
echo "applied: stand-ins, ${#TAGS[@]} studio migrations after Lovable's"
again=0
for tag in "${TAGS[@]}"; do
  # Those written to run again say so in their first lines ("additive, re-runnable").
  if head -3 "$ROOT/drizzle/migrations/$tag.sql" | grep -qi "re-runnable"; then
    apply "$ROOT/drizzle/migrations/$tag.sql"
    again=$((again + 1))
  fi
done
echo "applied again: the $again studio migrations written to run again"

failed=0
for test in "${TESTS[@]}"; do
  if out="$(sql -f - < "$test" 2>&1)"; then
    echo "passed: ${test#$ROOT/}"
    [ -n "$out" ] && echo "$out" | sed 's/^/  /'
  else
    echo "FAILED: ${test#$ROOT/}" >&2
    echo "$out" | sed 's/^/  /' >&2
    failed=1
  fi
done

if [ "$KEEP" = "1" ]; then
  echo "kept: ${as_pg[*]} $PG_BIN/psql -h $DIR -p $PORT -U postgres -d postgres"
  echo "stop: ${as_pg[*]} $PG_BIN/pg_ctl -D $DIR/data stop && rm -rf $DIR"
fi
exit "$failed"
