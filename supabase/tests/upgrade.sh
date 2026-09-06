#!/usr/bin/env bash
#
# Apply the *deployed* schema, then this one, and require the second to be
# clean.
#
# run.sh applies schema.sql to an empty database twice and asserts it settles.
# That proves the file is idempotent against itself and proves nothing about the
# path every real deployment actually takes: from the version already running to
# this one.
#
# The two are not the same, and the difference is not theoretical. `create or
# replace function` cannot rename a parameter — it raises 42P13 — so renaming
# `p_spangram` to `p_spangrams` applied perfectly to a fresh database and
# aborted on the live one, taking every statement after it down with it. The
# deployment ended up with no word lists, no availability table, and an admin
# page missing half its panels. run.sh was green throughout, because a fresh
# database has no old function to disagree with.
#
# So: origin/main is what is deployed, or near enough, and this asks the
# question the other harness cannot.
#
#   bash supabase/tests/upgrade.sh [rev]
#
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
# Several past releases, not just the last one.
#
# Testing only `origin/main` catches a rename made in the current change and
# misses one made in the release before it — which is exactly what happened:
# `p_spangram` became `p_spangrams` in #55, main already contained it by the
# time this harness existed, and the deployment that broke was still on #54.
# A deployment upgrades from wherever it happens to be, so the question is
# asked from each of the last few.
REVS=${REVS:-"origin/main origin/main~1 origin/main~2 origin/main~3 origin/main~4"}
name="games-upgrade-test"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

# cd rather than `git -C`: MSYS_NO_PATHCONV applies to the whole command, and
# with it set git cannot find a /c/... directory either. The variable is for the
# `rev:path` argument, which MSYS otherwise mangles into a drive path and hands
# back empty rather than failing.
cd "$repo"

echo "starting postgres"
docker run -d --name "$name" -e POSTGRES_PASSWORD=x postgres:15 >/dev/null
until docker exec "$name" psql -U postgres -h 127.0.0.1 -c 'select 1' >/dev/null 2>&1; do
  sleep 1
done

failed=0
n=0
for rev in $REVS; do
  n=$((n + 1))
  db="upgrade_$n"
  old="$(MSYS_NO_PATHCONV=1 git show "$rev:supabase/schema.sql" 2>/dev/null || true)"
  if [ -z "$old" ]; then
    echo "SKIP  $rev has no supabase/schema.sql"
    continue
  fi

  # A database each, in one container: a fresh one per revision is the whole
  # point, and spinning a container per revision would cost a minute apiece.
  docker exec "$name" psql -q -U postgres -h 127.0.0.1 -c "create database $db" >/dev/null
  psql_() { docker exec -i "$name" psql -q -U postgres -h 127.0.0.1 -d "$db" "$@"; }
  psql_ -v ON_ERROR_STOP=1 < "$here/bootstrap.sql" >/dev/null
  psql_ -v ON_ERROR_STOP=1 < "$here/../words.sql" >/dev/null
  psql_ -v ON_ERROR_STOP=1 -c "create publication supabase_realtime" >/dev/null

  # The old version twice, exactly as a real deployment reached its state. Its
  # own first-apply errors are its business, not this test's.
  printf '%s' "$old" | psql_ >/dev/null 2>&1 || true
  printf '%s' "$old" | psql_ >/dev/null 2>&1 || true

  errors=$(psql_ < "$here/../schema.sql" 2>&1 | grep 'ERROR' || true)
  if [ -n "$errors" ]; then
    echo "FAIL  upgrading from $rev"
    echo "$errors" | head -5
    failed=1
    continue
  fi
  again=$(psql_ < "$here/../schema.sql" 2>&1 | grep 'ERROR' || true)
  if [ -n "$again" ]; then
    echo "FAIL  a second apply after upgrading from $rev"
    echo "$again" | head -5
    failed=1
    continue
  fi
  echo "PASS  applies cleanly over $rev, twice"
done

[ "$failed" -eq 0 ] || exit 1
echo "--- upgrade checks passed ---"
