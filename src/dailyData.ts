// Daily game data URLs. The dev site (and local development) gets its own
// generated puzzle set so testing there never spoils the production dailies.
// NYT-derived solver data (letterboxed, spellingbee, strands) is shared —
// it's the same real puzzle either way.
const IS_DEV_SITE =
  typeof location !== 'undefined' &&
  (location.hostname.startsWith('dev.') ||
    location.hostname === 'localhost' ||
    // the dev service's Render-assigned hostname (production is anagrimoire-6ado)
    location.hostname === 'anagrimoire.onrender.com');

const BASE = 'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data';

export function dailyDataUrl(name: 'daily-words' | 'daily-hive' | 'daily-box' | 'daily-scramble' | 'daily-grid'): string {
  return `${BASE}/${IS_DEV_SITE ? 'dev-' : ''}${name}.json`;
}
