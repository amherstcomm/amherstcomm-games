#!/usr/bin/env bash
#
# Publish the rolling fortnight of daily puzzles to Postgres.
#
# This exists because the GitHub workflow cannot: the database answers only on
# the internal network, and a hosted runner is not on it. Rather than stand up
# a self-hosted runner whose entire job is to be inside a network the VM is
# already inside, the VM runs it.
#
# Idempotent by design — publish-puzzles.mjs sends
# `Prefer: resolution=merge-duplicates`, so a re-run overwrites rather than
# fails, and a missed night is repaired by the next one.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f ops/publish.env ]; then
  echo "ops/publish.env is missing — copy ops/publish.env.example and fill it in" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ops/publish.env
set +a

# Fail before doing anything rather than half way through the window.
#
# SUPABASE_URL especially: publish-puzzles.mjs defaults it to the *upstream*
# project's hosted Supabase, so an unset value does not fail obviously, it aims
# somewhere else entirely.
# No apostrophes in these messages. Inside "${VAR:?word}" bash reads a single
# quote as an opening quote and the script dies at parse time with an
# unexpected-EOF forty lines further down, which is a miserable thing to debug
# for the sake of a possessive.
: "${SUPABASE_URL:?set it in ops/publish.env — it defaults to the upstream hosted project}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set it in ops/publish.env}"
: "${PUZZLES_SEED_SALT:?set it in ops/publish.env — and never change it, see the example file}"

# --network host because SUPABASE_URL is almost certainly a localhost port on
# this box, which means nothing inside a container otherwise.
#
# node_modules lives in the mounted checkout, so it survives between runs; the
# install only happens on a fresh clone.
exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e PUZZLES_SEED_SALT \
  -e SKIP_SOLVER_DATA=1 \
  node:22-alpine \
  sh -c '[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; node scripts/publish-window.mjs'
