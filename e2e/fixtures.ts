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
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      }
      // profiles, game_results, auth — empty but well-formed
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.addInitScript(() => {
      localStorage.setItem('anagrimoire:storage:v2', 'browser');
      localStorage.setItem('anagrimoire:v1', JSON.stringify({ onboarded: true }));
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
