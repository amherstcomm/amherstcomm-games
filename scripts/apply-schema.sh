#!/usr/bin/env bash
# Applies supabase/schema.sql to the self-hosted database, on the VM.
#
#   cd /home/rtetzloff/git/amherstcomm-games && git pull && scripts/apply-schema.sh
#
# The Supabase Studio SQL editor refuses a query over a megabyte, and
# schema.sql passed that in October 2026 and only grows. This goes straight to
# Postgres instead: into the Supabase database container, or over
# SUPABASE_DB_URL when that is set.
#
# One transaction: the whole file lands or none of it does, so a failure part
# way leaves the database as it was. schema.sql is idempotent on a database
# that already has it, so running this again is always safe.
#
# The container is found by its image (supabase/postgres); set
# SUPABASE_DB_CONTAINER to name it instead. It connects as postgres; set
# SUPABASE_DB_USER for another role, e.g. if a run fails "must be owner of".
set -euo pipefail
cd "$(dirname "$0")/.."

schema=supabase/schema.sql
args=(-v ON_ERROR_STOP=1 --single-transaction -q)
# Warnings and errors only: re-applying says "already exists, skipping" a few
# hundred times, and an error would scroll away under it.
quiet='-c client_min_messages=warning'

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  echo "Applying $schema over SUPABASE_DB_URL..."
  PGOPTIONS="$quiet" psql "$SUPABASE_DB_URL" "${args[@]}" -f "$schema"
else
  container=${SUPABASE_DB_CONTAINER:-$(docker ps --format '{{.Names}} {{.Image}}' |
    awk '$2 ~ /^supabase\/postgres/ { print $1; exit }')}
  if [ -z "$container" ]; then
    echo "No running Supabase database container found. Set SUPABASE_DB_CONTAINER to its name" >&2
    echo "(docker ps lists them), or SUPABASE_DB_URL to a connection string." >&2
    exit 1
  fi
  echo "Applying $schema in container $container..."
  docker exec -i -e PGOPTIONS="$quiet" "$container" psql -U "${SUPABASE_DB_USER:-postgres}" -d postgres "${args[@]}" < "$schema"
fi

echo "Applied $schema at $(git rev-parse --short HEAD)."
