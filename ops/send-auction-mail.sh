#!/usr/bin/env bash
#
# Send the auction emails that are waiting. Run by the minute timer; safe to
# run by hand, and does nothing when nothing is waiting -- or when
# MAIL_TRANSPORT is not set in ops/publish.env, in which case they stay queued.
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

# Checked for nodemailer itself, not just node_modules: the other timers made
# node_modules before this needed it, so its being there says nothing.
exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e MAIL_TRANSPORT \
  -e MAIL_FROM \
  -e MAIL_SITE_URL \
  -e MAIL_TIME_ZONE \
  -e SMTP_HOST \
  -e SMTP_PORT \
  -e SMTP_USER \
  -e SMTP_PASS \
  -e RESEND_API_KEY \
  node:22-alpine \
  sh -c "[ -d node_modules/nodemailer ] || npm ci --ignore-scripts --no-audit --no-fund; node scripts/send-auction-mail.mjs"
