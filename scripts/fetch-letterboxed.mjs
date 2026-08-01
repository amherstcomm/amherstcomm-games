// Fetches today's NYT Letter Boxed puzzle and writes data/letterboxed.json.
// Run by .github/workflows/letterboxed-data.yml on a daily schedule.
import { mkdir, writeFile } from 'node:fs/promises';

const res = await fetch('https://www.nytimes.com/puzzles/letter-boxed', {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'text/html',
  },
});
if (!res.ok) throw new Error(`NYT responded ${res.status}`);
const html = await res.text();

const match = html.match(/window\.gameData\s*=\s*(\{.+?\})\s*(?:;|<\/script>)/s);
if (!match) throw new Error('Could not locate window.gameData in the page');
const game = JSON.parse(match[1]);

if (!Array.isArray(game.sides) || game.sides.length !== 4) {
  throw new Error(`Unexpected sides payload: ${JSON.stringify(game.sides)}`);
}

const out = {
  date: game.printDate ?? null,
  sides: game.sides.map((s) => String(s).toLowerCase()),
  par: game.par ?? null,
  fetchedAt: new Date().toISOString(),
};

await mkdir('data', { recursive: true });
await writeFile('data/letterboxed.json', JSON.stringify(out, null, 2) + '\n');
console.log('Wrote data/letterboxed.json:', JSON.stringify(out));
