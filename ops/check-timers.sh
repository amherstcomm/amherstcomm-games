#!/usr/bin/env bash
#
# Are the two publish timers installed, switched on, and succeeding?
#
# Part of ops/preflight.sh, and runnable on its own. Written because the
# requests timer went uninstalled for a week: every "Republish this day" sat on
# "waiting — the publish host looks once a minute", and nothing anywhere said
# the publish host was not looking. An installed timer whose service fails every
# minute is the same silence, so the last run's result is checked too.
#
# Same marks as the preflight: PASS and FAIL are verdicts, `note` is a fact.
# Exit 1 when anything failed.
#
# UNIT_DIR is where installed units live; overridable so the check can be
# tested against a directory that is not the machine's.
set -uo pipefail

cd "$(dirname "$0")/.."
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
failed=0

pass() { echo "PASS  $1${2:+ — $2}"; }
fail() { echo "FAIL  $1${2:+ — $2}"; failed=1; }
note() { echo "note  $1${2:+ — $2}"; }

if ! command -v systemctl >/dev/null 2>&1; then
  note "timers" "no systemctl here, so they were not checked — run this on the publish host"
  exit 0
fi

check() {
  local name=$1 purpose=$2
  local timer="$name.timer" service="$name.service"
  local install="sudo cp ops/$name.* $UNIT_DIR/ && sudo systemctl daemon-reload && sudo systemctl enable --now $timer"

  if ! systemctl cat "$timer" >/dev/null 2>&1; then
    fail "$timer ($purpose)" "not installed. $install"
    return
  fi

  local enabled active
  enabled=$(systemctl is-enabled "$timer" 2>/dev/null)
  active=$(systemctl is-active "$timer" 2>/dev/null)
  if [ "$enabled" = enabled ] && [ "$active" = active ]; then
    pass "$timer ($purpose)" "installed, enabled and running"
  else
    fail "$timer ($purpose)" "installed but ${enabled:-unknown} and ${active:-unknown}. sudo systemctl enable --now $timer"
  fi

  # A oneshot's Result is "success" after a clean run and names what went wrong
  # otherwise. Before its first run there is no start time to show.
  local started result
  started=$(systemctl show -p ExecMainStartTimestamp --value "$service" 2>/dev/null)
  result=$(systemctl show -p Result --value "$service" 2>/dev/null)
  if [ -z "$started" ] || [ "$started" = n/a ]; then
    note "$service" "has not run yet"
  elif [ "$result" = success ]; then
    pass "$service" "last run succeeded, $started"
  else
    fail "$service" "last run ended ${result:-unknown}, $started. sudo journalctl -u $service -n 40 --no-pager"
  fi

  # The installed copy is what systemd runs. One copied before a change to the
  # file in ops/ runs the old command, and nothing says so.
  local unit
  for unit in "$timer" "$service"; do
    if [ -f "$UNIT_DIR/$unit" ] && ! cmp -s "$UNIT_DIR/$unit" "ops/$unit"; then
      note "$unit" "the installed copy differs from ops/$unit. $install"
    fi
  done
}

check amherstcomm-games-puzzles "the nightly publish"
check amherstcomm-games-requests "days asked for from the admin portal"

exit "$failed"
