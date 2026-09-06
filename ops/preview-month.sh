#!/usr/bin/env bash
#
# Show what a run of days would publish, reading the settings from the database
# this VM can see.
#
# It lives here rather than in a GitHub workflow for the same reason
# publish-puzzles.sh does: the database answers on the internal network, and a
# hosted runner is not on it. A workflow that tried would either fail to
# connect or — worse, and this happened — read a *different* database and
# report "an ordinary day" for a month that is set up.
#
# Usage, from the checkout on the VM:
#
#   ops/preview-month.sh --from 2026-10-01 --until 2026-10-07
#   ops/preview-month.sh --from 2026-10-01 --days 3
#
# Nothing is published. Each day is generated into a temporary directory inside
# the container and thrown away, so this is safe to run at any hour: it writes
# no rows, no files, and no branch.
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

# Same two as the publish, and for the same reason: without them the generator
# reads no word lists, no Weave themes, no passages, no rules and no pins, and
# prints ordinary days — which looks exactly like a themed month that did not
# work.
: "${SUPABASE_URL:?set it in ops/publish.env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set it in ops/publish.env}"
# The salt decides the boards. Previewing without the one the publish uses
# would show a week of real-looking puzzles that are not the ones anybody will
# play.
: "${PUZZLES_SEED_SALT:?set it in ops/publish.env — a preview without it is a different week}"

exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e PUZZLES_SEED_SALT \
  -e SKIP_SOLVER_DATA=1 \
  node:22-alpine \
  sh -c "[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; node scripts/preview-month.mjs $*"
