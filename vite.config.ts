import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Link-preview tags have to carry absolute URLs — a scraper reads the HTML
// without ever running our JS, so it can't work the origin out for itself.
// Each deployment stamps its own: without VITE_SITE_ORIGIN, dev would
// advertise production's card, which is a 404 until the branch merges.
const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN || 'https://anagrimoire.com';

const GAME_SLUGS = ['guess', 'scramble', 'hive', 'grid', 'boxed', 'weave', 'squares'];

// Panels that need an account — /stats, /settings, /account — are left out on
// purpose: real addresses, but nothing on them to index.
const SITEMAP_PATHS = [
  '/',
  ...GAME_SLUGS.flatMap((g) => [`/daily/${g}`, `/play/${g}`, `/solve/${g}`, `/learn/${g}`]),
  '/about',
  '/legal/notices',
  '/legal/privacy',
  '/legal/terms',
];

function sitemapXml(origin: string): string {
  const url = (p: string) =>
    [
      '  <url>',
      `    <loc>${origin}${p}</loc>`,
      `    <changefreq>${p.startsWith('/daily/') ? 'daily' : 'monthly'}</changefreq>`,
      `    <priority>${p === '/' ? '1.0' : p.startsWith('/daily/') ? '0.8' : '0.5'}</priority>`,
      '  </url>',
    ].join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_PATHS.map(url),
    '</urlset>',
    '',
  ].join('\n');
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-origin',
      transformIndexHtml: (html) => html.replaceAll('%SITE_ORIGIN%', SITE_ORIGIN),
    },
    {
      // A sitemap earns its keep here more than on most sites: every control in
      // the nav is a <button>, so a crawler landing on "/" has nothing to
      // follow and would never reach a single game. Generated rather than
      // committed, because the URLs carry this deployment's origin.
      //
      // Dev asks not to be indexed at all — it's a complete copy of production
      // on another hostname, which is duplicate content in the one way that
      // actually costs something.
      name: 'sitemap',
      apply: 'build',
      generateBundle() {
        const isProd = SITE_ORIGIN === 'https://anagrimoire.com';
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(SITE_ORIGIN) });
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: isProd
            ? ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ''].join('\n')
            : ['User-agent: *', 'Disallow: /', ''].join('\n'),
        });
      },
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
