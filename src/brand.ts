// What this deployment calls itself.
//
// The name is a build value rather than a database row on purpose. It renders
// in the masthead, which is the first thing painted — a name fetched over the
// network would show a placeholder and then swap, and the thing that swapped
// would be the site's own name. It also has to be in index.html before any
// JavaScript runs, for the tab title and the link-preview tags a scraper reads
// without executing anything.
//
// The subtitle is different in kind: it names an *event*, so it changes while
// the deployment does not. It is a build value here only because the settings
// table it belongs in does not exist yet — once the admin portal lands, this
// becomes the fallback and a row becomes the source. Written down so that
// move is a planned one rather than a surprise.
function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** The name a deployment falls back to when it does not set one.
 *
 *  Kept in step with the default in vite.config.ts by
 *  tests/unit/brand.test.ts — the two are read at different times (this one in
 *  the browser, that one while generating index.html) and would otherwise be
 *  free to disagree, which would show as a tab title and a masthead calling
 *  the site two different things. */
export const SITE_NAME_FALLBACK = 'Amherst Games';

/** The site's name, in the masthead and the tab title. */
export const SITE_NAME: string = trimmed(import.meta.env.VITE_SITE_NAME) || SITE_NAME_FALLBACK;

/** The event this run of the site is for — "Employee Ownership Month" — or
 *  empty, which is the ordinary state and renders nothing at all rather than
 *  an empty line. */
export const SITE_SUBTITLE: string = trimmed(import.meta.env.VITE_SITE_SUBTITLE);
