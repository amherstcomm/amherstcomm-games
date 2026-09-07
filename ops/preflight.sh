#!/usr/bin/env bash
#
# Walk the whole themed pipeline and say which link is missing.
#
# Read-only: it publishes nothing, writes no rows and changes no settings, so it
# is safe at any hour and safe to repeat. Run it before a themed month, and
# again on the morning of anything that matters.
#
# It exists because every part of this can be checked on its own and the chain
# could not. The settings live in the database, the generator reads them, the
# publish writes rows, the site reads those rows -- and a break anywhere along
# it looks, from the admin pages, exactly like a month that is set up.
#
# Usage, from the checkout on the VM:
#
#   ops/preflight.sh                          today and the fortnight ahead
#   ops/preflight.sh --from 2026-10-01 --days 31
#
# Exit 0 when every check passed, 1 when any failed. Lines marked `note` are
# facts rather than verdicts: whether a word list *should* cover these days is
# the one thing this cannot know.
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

# Both, and no default: a check that quietly asked a different database would
# be worse than no check, since it would answer confidently.
: "${SUPABASE_URL:?set it in ops/publish.env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set it in ops/publish.env}"

# The salt is not needed here -- nothing is generated -- so it is not required.
# --network host because SUPABASE_URL is almost certainly a localhost port on
# this box, which means nothing inside a container otherwise.
exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  node:22-alpine \
  sh -c "[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; node scripts/preflight.mjs $*"
