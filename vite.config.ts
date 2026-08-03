import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Link-preview tags have to carry absolute URLs — a scraper reads the HTML
// without ever running our JS, so it can't work the origin out for itself.
// Each deployment stamps its own: without VITE_SITE_ORIGIN, dev would
// advertise production's card, which is a 404 until the branch merges.
const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN || 'https://anagrimoire.com';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-origin',
      transformIndexHtml: (html) => html.replaceAll('%SITE_ORIGIN%', SITE_ORIGIN),
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
