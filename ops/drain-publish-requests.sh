#!/usr/bin/env bash
#
# Publish whatever the admin portal has asked for. Run by the minute timer;
# safe to run by hand, and does nothing when nothing is waiting.
#
# Same credentials and the same container as ops/publish-puzzles.sh, because it
# runs the same routine: the day it publishes is the day tonight's window would
# have published, from the settings as they stand now.
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
: "${PUZZLES_SEED_SALT:?set it in ops/publish.env — a day published without it is a different day}"

exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e PUZZLES_SEED_SALT \
  -e SKIP_SOLVER_DATA=1 \
  node:22-alpine \
  sh -c "[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; node scripts/drain-publish-requests.mjs"
