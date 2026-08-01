# Anagrimoire

A word-game solver for puzzles like Wordle, crosswords, and hangman. Lock in the letters you know by position, list the letters that must appear somewhere, exclude the rest — Anagrimoire surfaces every dictionary word that fits.

*Vibe-coded with [Claude](https://claude.com/claude-code).*

## Features

- **Three dictionaries** — Common (everyday words, ideal for Wordle-style puzzles), Standard (adds less frequent words), and Full (~275,000 words, obscurities included); larger dictionaries load on demand
- **Word lengths from 3 to 15 letters** — works for more than just 5-letter puzzles
- **Known positions** — tile inputs for letters you've confirmed in place
- **Must-contain letters** — letters known to be in the word, position unknown (duplicates respected)
- **Excluded letters** — letters ruled out entirely
- **Live results** with per-letter highlighting, computed entirely in the browser

## Getting started

```sh
npm install
npm run dev
```

Other scripts:

| Command | Purpose |
|---|---|
| `npm run build` | Production build via Vite |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |

## Tech stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) for build tooling
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Lucide](https://lucide.dev/) icons
- [wordlist-english](https://github.com/jacksonrayhamilton/wordlist-english) (MIT) for the Common and Standard dictionaries, built from [SCOWL](http://wordlist.aspell.net/) by Kevin Atkinson (permissive license)
- [an-array-of-english-words](https://github.com/words/an-array-of-english-words) (MIT) for the Full dictionary, derived from the [Letterpress word list](https://github.com/lorenbrichter/Words) (CC0/public domain)

## Deployment

The repo includes a [Render](https://render.com/) blueprint ([render.yaml](render.yaml)) that provisions a static site: it builds with `npm ci && npm run build`, publishes `dist/`, rewrites all routes to `index.html`, and sets long-lived cache headers on hashed assets.

To deploy: in the Render dashboard choose **New → Blueprint**, point it at this repository, and Render will pick up `render.yaml` automatically. Pushes to the connected branch auto-deploy.

## License

[MIT](LICENSE) © Ray Tetzloff
