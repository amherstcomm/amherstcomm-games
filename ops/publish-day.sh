#!/usr/bin/env bash
#
# Regenerate and publish one day, now rather than at 03:15.
#
# The nightly timer regenerates every day in the fortnight window from the
# settings as they stand, so a word list changed today reaches every future day
# by tomorrow morning without this. It is for when tomorrow morning is too late.
#
# Usage, from the checkout on the VM:
#
#   ops/publish-day.sh 2026-10-08
#   ops/publish-day.sh 2026-09-10 --force     a day that has already started
#
# Today and the past are refused without --force: people have played those
# boards, and regenerating one puts a different puzzle under their saved
# progress.
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

: "${SUPABASE_URL:?set it in ops/publish.env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set it in ops/publish.env}"
# Without the salt the board is a different board, published over the real one.
: "${PUZZLES_SEED_SALT:?set it in ops/publish.env — a day published without it is a different day}"

exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e PUZZLES_SEED_SALT \
  -e SKIP_SOLVER_DATA=1 \
  node:22-alpine \
  sh -c "[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; node scripts/publish-day.mjs $*"
