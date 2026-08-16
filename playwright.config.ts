import { defineConfig, devices } from '@playwright/test';

// The browser layer. Everything the network would serve is stubbed — the
// puzzle feed comes from a generator run in global-setup, and Supabase is a
// fake origin whose responses the tests fulfil — so a red run means the app
// broke, never that GitHub or Supabase had a bad minute.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // Playwright takes half the cores by default, which on a four-core runner is
  // two workers for 122 tests — the same suite that runs in about two and a
  // half minutes locally took over ten. All four on CI; locally the default is
  // left alone, since a laptop has other things to do.
  workers: process.env.CI ? '100%' : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
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
