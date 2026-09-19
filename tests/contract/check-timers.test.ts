// The publish timers, as the preflight checks them.
//
// Written after the requests timer went uninstalled for a week and every
// republish request sat on "waiting". The script is run for real, against a
// systemctl that answers from a table this test writes, so each way a timer can
// be missing or broken is one row changed.
import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const NAMES = ['amherstcomm-games-puzzles', 'amherstcomm-games-requests'];
const STARTED = 'Sat 2026-09-19 10:46:03 CDT';

let dir: string;
let units: string;
let table: string;

/** A systemctl that looks its whole command line up in a |-separated table --
 *  not tabs, which read collapses, so an empty output field vanished and the
 *  exit code was printed in its place:
 *  arguments, what to print, the exit code. Anything not in it fails, the way
 *  asking about a unit that does not exist does. */
const FAKE = `#!/usr/bin/env bash
key="$*"
while IFS='|' read -r k out code; do
  if [ "$k" = "$key" ]; then
    [ -n "$out" ] && echo "$out"
    exit "\${code:-0}"
  fi
done < "$FAKE_SYSTEMCTL"
exit 1
`;

type Row = [args: string, out: string, code?: number];

function healthy(name: string): Row[] {
  return [
    [`cat ${name}.timer`, ''],
    [`is-enabled ${name}.timer`, 'enabled'],
    [`is-active ${name}.timer`, 'active'],
    [`show -p ExecMainStartTimestamp --value ${name}.service`, STARTED],
    [`show -p Result --value ${name}.service`, 'success'],
  ];
}

/** Every row healthy, with `change` replacing any row whose arguments match. */
function state(change: Row[] = [], drop: string[] = []) {
  const rows = new Map<string, Row>();
  for (const name of NAMES) for (const r of healthy(name)) rows.set(r[0], r);
  for (const r of change) rows.set(r[0], r);
  for (const d of drop) rows.delete(d);
  writeFileSync(table, [...rows.values()].map(([a, o, c]) => `${a}|${o}|${c ?? 0}`).join('\n') + '\n');
}

async function check() {
  try {
    const { stdout } = await run('bash', ['ops/check-timers.sh'], {
      env: {
        ...process.env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        FAKE_SYSTEMCTL: table,
        UNIT_DIR: units,
      },
    });
    return { code: 0, out: stdout };
  } catch (error) {
    const e = error as { code?: number; stdout?: string };
    return { code: e.code ?? 1, out: e.stdout ?? '' };
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fake-systemctl-'));
  writeFileSync(join(dir, 'systemctl'), FAKE, { mode: 0o755 });
  table = join(dir, 'table.tsv');
  units = mkdtempSync(join(tmpdir(), 'units-'));
  // Installed copies identical to the ones in ops/.
  for (const name of NAMES) {
    for (const kind of ['timer', 'service']) {
      copyFileSync(join('ops', `${name}.${kind}`), join(units, `${name}.${kind}`));
    }
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(units, { recursive: true, force: true });
});

describe('checking the publish timers', () => {
  it('passes when both are installed, running and succeeding', async () => {
    state();
    const { code, out } = await check();
    expect(code, out).toBe(0);
    expect(out.match(/^PASS/gm)).toHaveLength(4);
    expect(out).not.toMatch(/^(FAIL|note)/m);
  });

  // The week it was missed.
  it('fails a timer that is not installed, and says how to install it', async () => {
    state([], ['cat amherstcomm-games-requests.timer']);
    const { code, out } = await check();
    expect(code).toBe(1);
    expect(out).toMatch(
      /^FAIL {2}amherstcomm-games-requests\.timer .* not installed\. sudo cp ops\/amherstcomm-games-requests\.\*/m
    );
    expect(out).toMatch(/sudo systemctl enable --now amherstcomm-games-requests\.timer/);
  });

  it('fails one installed but switched off', async () => {
    state([['is-enabled amherstcomm-games-puzzles.timer', 'disabled', 1], ['is-active amherstcomm-games-puzzles.timer', 'inactive', 3]]);
    const { code, out } = await check();
    expect(code).toBe(1);
    expect(out).toMatch(/^FAIL {2}amherstcomm-games-puzzles\.timer .* installed but disabled and inactive/m);
  });

  // Installed and firing every minute, and failing every minute: the same
  // silence as not being there.
  it('fails a service whose last run failed, and points at its journal', async () => {
    state([['show -p Result --value amherstcomm-games-requests.service', 'exit-code']]);
    const { code, out } = await check();
    expect(code).toBe(1);
    expect(out).toMatch(/^FAIL {2}amherstcomm-games-requests\.service — last run ended exit-code/m);
    expect(out).toMatch(/journalctl -u amherstcomm-games-requests\.service/);
  });

  it('notes one that has not run yet, without failing', async () => {
    state([['show -p ExecMainStartTimestamp --value amherstcomm-games-puzzles.service', '']]);
    const { code, out } = await check();
    expect(code, out).toBe(0);
    expect(out).toMatch(/^note {2}amherstcomm-games-puzzles\.service — has not run yet/m);
  });

  // A copy made before the file in ops/ changed runs the old command.
  it('notes an installed copy that differs from the one in ops/', async () => {
    state();
    appendFileSync(join(units, 'amherstcomm-games-requests.service'), '\n# edited\n');
    const { code, out } = await check();
    expect(code, out).toBe(0);
    expect(out).toMatch(/^note {2}amherstcomm-games-requests\.service — the installed copy differs/m);
  });
});
