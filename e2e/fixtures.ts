// The shared test fixture: a page whose network is entirely ours.
//
// - The puzzle feed (raw.githubusercontent.com) is served from the files
//   global-setup generated, so tests exercise the real feed shape.
// - Supabase is a stub origin; the leaderboard RPC returns rows the tests
//   control, and everything else returns politely empty.
// - The storage banner is pre-answered and onboarding dismissed, so tests
//   start where a returning player does.
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './global-setup';

const row = (name: string, value: number, detail: number | null = 1) => ({ name, value, detail });

/** What the stubbed leaderboard returns: enough rows that every board the
 *  tests look at has something on it. */
export const LEADERBOARD = {
  guess: [row('Anagrimoire', 1, 6)],
  scramble: [row('Anagrimoire', 29)],
  hive: [row('Anagrimoire', 24)],
  grid: [row('Anagrimoire', 9)],
  box: [],
  weave: [],
  squares4: [],
  squares5: [],
  cryptogram: [],
  ladder: [],
  bridge: [],
};

export const test = base.extend<{ rpcCalls: { fn: string; args: Record<string, unknown> }[] }>({
  // every difficulty/env the RPCs were asked for, so tests can assert the
  // request as well as the rendering; filled in by the page fixture below
  rpcCalls: async ({}, use) => {
    await use([]);
  },

  page: async ({ page, rpcCalls }, use) => {
    const calls = rpcCalls;

    // the word-band CDN is a production-only path (dev builds always use the
    // bundle), but if that gate ever loosens, tests must not reach a real CDN
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());

    await page.route('https://raw.githubusercontent.com/**', async (route) => {
      const name = route.request().url().split('/').pop()!;
      try {
        const body = readFileSync(join(DATA_DIR, name), 'utf8');
        await route.fulfill({ status: 200, contentType: 'application/json', body });
      } catch {
        await route.fulfill({ status: 404, body: 'not in fixture set' });
      }
    });

    await page.route('https://stub.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
      if (rpc) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(route.request().postData() ?? '{}');
        } catch {
          // GET rpc — arguments live in the query string
          args = Object.fromEntries(url.searchParams);
        }
        calls.push({ fn: rpc, args });
        if (rpc === 'leaderboard') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(LEADERBOARD),
          });
        }
        // The report functions answer a shape, not null — a stub that says
        // null makes every report read as a transport failure, which would
        // have let the dialog's success path go untested.
        if (rpc === 'report_puzzle' || rpc === 'report_player' || rpc === 'report_general') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, recorded: true, ticket: '4f2ba9c17d' }),
          });
        }
        // The owner's door, from a browser with nobody signed in: the server
        // says 'not allowed' and says nothing else, which is what the page has
        // to be able to render without having seen the report.
        if (rpc === 'report_for_action' || rpc === 'report_act') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: false, reason: 'not allowed' }),
          });
        }
        if (rpc === 'is_owner') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
        }
        if (rpc === 'owner_reports') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        if (rpc === 'report_status') {
          const asked = (args as { p_ticket?: string }).p_ticket;
          const answers: Record<string, unknown> = {
            '4f2ba9c17d': {
              found: true, status: 'new', resolution: null, note: null,
              filed: '2026-08-15T00:00:00Z', closed: null,
            },
            c105ed0000: {
              found: true, status: 'handled', resolution: 'blocked',
              note: 'Blocked the word and rebuilt the bands.',
              filed: '2026-08-15T00:00:00Z', closed: '2026-08-16T00:00:00Z',
            },
          };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(answers[asked ?? ''] ?? { found: false }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      }
      // profiles, game_results, auth — empty but well-formed
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.addInitScript(() => {
      localStorage.setItem('anagrimoire:storage:v2', 'browser');
      localStorage.setItem('anagrimoire:v1', JSON.stringify({ onboarded: true }));
      // And the analytics banner, which is a *fixed* card sitting over the
      // bottom of the page — including the footer. Unanswered, it makes every
      // footer control unclickable, which is how the report menu's own tests
      // failed while its "is it visible" test passed.
      localStorage.setItem(
        'anagrimoire:analytics-consent:v2',
        JSON.stringify({ value: 'denied', at: Date.now() })
      );
    });
    await use(page);
  },
});

export { expect };
export type { Page } from '@playwright/test';

/** Seed a played daily so the home page's board filter sees a real morning.
 *  Call before page.goto. */
export async function seedPlayedHive(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const today = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    localStorage.setItem(
      'anagrimoire:hive:v1',
      JSON.stringify({
        dailyMode: true,
        dailyDate: today,
        daily: { center: 'a', outers: ['b', 'c', 'd', 'e', 'f', 'g'], found: ['badge'] },
        practice: null,
      })
    );
  });
}
