#!/usr/bin/env bash
#
# Prove the pg_cron half of schema.sql on a Postgres that actually has pg_cron.
#
# run.sh uses a plain postgres:15, which has no pg_cron — so every run of the
# main suite exercises the *other* branch of that guard, the one that skips.
# The branch that schedules a job has to be proved somewhere, and it writes to
# a scheduler on a live database, which is not a thing to find out about in
# production.
#
# Separate from run.sh and not part of it: this installs a package and restarts
# the server, which is a minute and a half nobody wants on every schema change.
# Run it when the pg_cron block changes.
#
#   bash supabase/tests/cron.sh
#
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
name="games-cron-test"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "starting postgres"
docker run -d --name "$name" -e POSTGRES_PASSWORD=x postgres:15 >/dev/null
until docker exec "$name" psql -U postgres -h 127.0.0.1 -c 'select 1' >/dev/null 2>&1; do
  sleep 1
done

echo "installing pg_cron"
docker exec "$name" bash -c \
  "apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq postgresql-15-cron >/dev/null 2>&1"
# It is a shared_preload_libraries extension: without this, `create extension`
# fails, which is also the shape of the answer if a deployment ever says the
# extension is available but will not install.
docker exec "$name" bash -c \
  "echo \"shared_preload_libraries='pg_cron'\" >> /var/lib/postgresql/data/postgresql.conf"
docker restart "$name" >/dev/null
until docker exec "$name" psql -U postgres -h 127.0.0.1 -c 'select 1' >/dev/null 2>&1; do
  sleep 1
done
docker exec "$name" psql -U postgres -h 127.0.0.1 -qc "create extension pg_cron"

psql_() { docker exec -i "$name" psql -q -U postgres -h 127.0.0.1 "$@"; }

# The real block, lifted out of schema.sql rather than copied into this file —
# a copy would go stale exactly when it mattered. apply_schedules() is stubbed
# because what is under test is the scheduling, not the sweep.
python - "$here/../schema.sql" <<'PY' > "$here/.cron-block.sql"
import io, sys
s = io.open(sys.argv[1], encoding='utf-8').read()
start = "do $do$\nbegin\n  if exists (select 1 from pg_extension where extname = 'pg_cron') then"
i = s.index(start)
j = s.index("$do$;", i) + len("$do$;")
sys.stdout.write(
    "create or replace function public.apply_schedules() returns void "
    "language sql as $$ select $$;\n" + s[i:j] + "\n")
PY

fail() { echo "FAIL  $1"; exit 1; }
pass() { echo "PASS  $1"; }

echo "applying it three times"
for _ in 1 2 3; do psql_ -v ON_ERROR_STOP=1 < "$here/.cron-block.sql" >/dev/null; done
rm -f "$here/.cron-block.sql"

jobs=$(psql_ -tAc "select count(*) from cron.job where jobname = 'sessions-opening-hours'")
[ "$jobs" = "1" ] || fail "re-applying the schema stacked up $jobs jobs"
pass "re-applying the schema leaves one job, not one per apply"

sched=$(psql_ -tAc "select schedule from cron.job where jobname = 'sessions-opening-hours'")
[ "$sched" = "* * * * *" ] || fail "scheduled '$sched', not every minute"
pass "it runs every minute, which is as fine as the window can be set"

# The one that matters. A job that exists and never fires is the failure this
# whole script is here to rule out — everything above is satisfied by a row in
# a table.
echo "waiting for it to fire (up to 90s)"
for _ in $(seq 1 18); do
  runs=$(psql_ -tAc "select count(*) from cron.job_run_details where status = 'succeeded'")
  [ "$runs" -ge 1 ] && break
  sleep 5
done
[ "${runs:-0}" -ge 1 ] || fail "the job never ran: $(psql_ -tAc \
  "select coalesce(string_agg(status || ' ' || coalesce(return_message, ''), '; '), 'no runs at all') from cron.job_run_details")"
pass "and it actually fires, and succeeds"

echo "--- pg_cron checks passed ---"
