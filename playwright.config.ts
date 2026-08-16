import { defineConfig, devices } from '@playwright/test';

// The browser layer. Everything the network would serve is stubbed — the
// puzzle feed comes from a generator run in global-setup, and Supabase is a
// fake origin whose responses the tests fulfil — so a red run means the app
// broke, never that GitHub or Supabase had a bad minute.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // Two workers on CI, not four.
  //
  // Taking all four cores starved the thing being tested: the web server here
  // is Vite in dev mode, which transforms modules on demand, so it needs a core
  // of its own. With four browsers competing for four cores, contrast.spec.ts —
  // eight palette-and-theme combinations, each a fresh navigation — failed with
  // net::ERR_ABORTED and goto timeouts, and failed again on retry.
  //
  // Parallelism comes from sharding the job instead, which gives each shard a
  // whole runner. Three shards of two is six-way, and nothing has to share.
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A built preview, not the dev server.
  //
  // Vite in dev transforms every module on demand, so each navigation costs the
  // server real CPU — and with browsers competing for the same cores it starves.
  // That is not a theory: contrast.spec.ts, which walks four routes across eight
  // palette-and-theme combinations, failed on CI shard 2 with net::ERR_ABORTED
  // and again locally with waitForLoadState timeouts, while passing whenever it
  // ran alone. A preview serves static files and costs almost nothing, so the
  // failure mode goes away rather than being tuned around.
  //
  // It also means the suite tests what actually ships — minified, bundled, the
  // real chunk graph — rather than a development build nobody ever loads. The
  // build step is paid once per run.
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      // A client that exists but points nowhere real: auth surfaces render,
      // and every request is intercepted before it could leave the machine.
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
    },
  },
});
