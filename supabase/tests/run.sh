#!/usr/bin/env bash
# Apply schema.sql to a throwaway Postgres and run the SQL tests against it.
#
# Not in CI. It needs Docker and pulls a Postgres image, and the suite it would
# join runs in about six minutes without one — so this is a thing you run when
# you change schema.sql, which is the only time it can tell you anything.
#
#   bash supabase/tests/run.sh
#
# The schema is applied twice on purpose. A first apply on an empty database
# fails six statements: daily_progress and game_results are altered above the
# point where they are created, so the foreign keys to games(progress) have
# nothing to attach to yet. The second apply is clean, and that pair of counts
# is itself asserted below — if a change makes the first apply fail *more*, this
# says so rather than letting it be discovered on the VM.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
name="games-schema-test"

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -e POSTGRES_PASSWORD=x postgres:15 >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

# Over TCP, not the socket: the image runs a temporary server on the unix
# socket while it initialises, so a socket check goes green before the real
# server exists and everything after it lands in a database that is thrown
# away. Cost one debugging round the first time.
echo "waiting for postgres"
until docker exec "$name" psql -U postgres -h 127.0.0.1 -c 'select 1' >/dev/null 2>&1; do
  sleep 0.2
done

psql_() { docker exec -i "$name" psql -q -U postgres -h 127.0.0.1 "$@"; }

psql_ -v ON_ERROR_STOP=1 < "$here/bootstrap.sql" >/dev/null
# words.sql is DDL for public.words and is applied alongside schema.sql on a
# real deployment — see docs/selfhost.md. It carries no rows; the tests that
# need words insert their own.
psql_ -v ON_ERROR_STOP=1 < "$here/../words.sql" >/dev/null
# Realtime owns this publication; schema.sql adds tables to it.
psql_ -c 'create publication supabase_realtime;' >/dev/null 2>&1 || true

first=$(psql_ < "$here/../schema.sql" 2>&1 | grep -c 'ERROR' || true)
second=$(psql_ < "$here/../schema.sql" 2>&1 | grep -c 'ERROR' || true)
echo "schema applied: $first errors on a fresh database, $second on the second pass"

if [ "$second" -ne 0 ]; then
  echo "FAIL: schema.sql does not settle — the second apply should be clean"
  psql_ < "$here/../schema.sql" 2>&1 | grep 'ERROR' | head
  exit 1
fi
if [ "$first" -ne 6 ]; then
  echo "FAIL: expected 6 first-apply errors (the games(progress) foreign keys), got $first"
  exit 1
fi

status=0
for f in "$here"/*.sql; do
  case "$(basename "$f")" in bootstrap.sql) continue ;; esac
  echo "--- $(basename "$f")"
  if ! psql_ -v ON_ERROR_STOP=1 < "$f" 2>&1 | grep -E 'PASS|FAIL|ERROR'; then
    status=1
  fi
done
exit "$status"
