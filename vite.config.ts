import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execFileSync } from 'node:child_process';

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

// Which source files decide what a given page actually says. A page's lastmod
// is the date of the last commit touching them, which is the closest thing we
// have to "when this page last changed" — and much closer than the deploy
// timestamp, which is the same for every URL and is the pattern search engines
// learn to ignore.
const GAME_FILES: Record<string, string> = {
  guess: 'src/GuessGame.tsx',
  scramble: 'src/ScrambleGame.tsx',
  hive: 'src/HiveGame.tsx',
  grid: 'src/GridGame.tsx',
  boxed: 'src/BoxGame.tsx',
  weave: 'src/WeaveGame.tsx',
  squares: 'src/SquaresGame.tsx',
};

function sourcesFor(path: string): string[] {
  if (path === '/') return ['src/HomeView.tsx'];
  // the About panel lives in App.tsx rather than a file of its own, so its date
  // is an upper bound: App.tsx moves for reasons About didn't
  if (path === '/about') return ['src/App.tsx'];
  if (path.startsWith('/legal/')) return ['src/LegalDocs.tsx'];
  const [, view, slug] = path.split('/');
  const game = GAME_FILES[slug];
  if (!game) return [];
  if (view === 'solve') return [game, 'src/solvers.ts'];
  if (view === 'learn') return [game, 'src/LearnMode.tsx'];
  return [game];
}

// A shallow clone has one commit, so every file would report the same date —
// precisely the useless uniform timestamp we're trying to avoid. Better to emit
// no lastmod at all than a date we know is an artefact of how the CI cloned.
const gitAvailable = (() => {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'false';
  } catch {
    return false;
  }
})();

const dateCache = new Map<string, string | null>();

/** The most recent commit touching any of these files, as a W3C datetime.
 *  One git call per page, memoised, so pages sharing a source share the call. */
function lastModified(files: string[]): string | null {
  if (!gitAvailable || !files.length) return null;
  const key = files.join('\0');
  const hit = dateCache.get(key);
  if (hit !== undefined) return hit;
  let date: string | null = null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...files], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    date = out || null;
  } catch {
    date = null;
  }
  dateCache.set(key, date);
  return date;
}

function sitemapXml(origin: string): string {
  const url = (p: string) => {
    // The dailies change every morning whatever the code did, so a commit date
    // would understate them — and a build date would be right for one day and
    // wrong for the rest. lastmod is optional per URL; omitting it is honest
    // where a claim wouldn't be, and changefreq still says what's true.
    const daily = p.startsWith('/daily/');
    const lastmod = daily ? null : lastModified(sourcesFor(p));
    return [
      '  <url>',
      `    <loc>${origin}${p}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      `    <changefreq>${daily ? 'daily' : 'monthly'}</changefreq>`,
      '  </url>',
    ].join('\n');
  };
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
        if (!gitAvailable) {
          // Silence here would look identical to "nothing changed recently",
          // so say it: the sitemap is going out without any lastmod at all.
          this.warn('no usable git history — sitemap emitted without lastmod dates');
        }
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
