import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Two projects because the layers have different needs: unit tests want a DOM
// (localStorage, mostly) and finish in seconds; the contract tests run the
// real puzzle generator once, which takes a minute or two and needs no DOM at
// all. `npm test` runs both; `npm run test:unit` is the quick inner loop.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'contract',
          environment: 'node',
          include: ['tests/contract/**/*.test.ts'],
          // one generator run shared by every assertion in the file
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
