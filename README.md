# Anagrimoire

A word-game solver for puzzles like Wordle, crosswords, hangman, Scrabble, Jumble, Spelling Bee, and Letter Boxed. Solve by pattern — lock in the letters you know by position, list the letters that must appear somewhere, exclude the rest — descramble a rack of letters, crack a Spelling Bee hive, or find two-word Letter Boxed solutions.

*Vibe-coded with [Claude](https://claude.com/claude-code).*

**Live site:** [www.anagrimoire.com](https://www.anagrimoire.com) · **Dev preview:** [dev.anagrimoire.com](https://dev.anagrimoire.com)

## Features

### Solver modes

- **Pattern** (Wordle, crosswords, hangman) — word lengths from 3 to 15; tile inputs for known positions, must-contain letters (position unknown, duplicates respected), and excluded letters, with per-letter highlighting in the results
- **Descramble** (Scrabble, Jumble) — find every word a rack of letters can spell, with `?` wildcards for blank tiles, an exact-anagram "use every letter" option, and a minimum-length filter
- **Spelling Bee** — seven letters, 4+ letter words, center letter required, letters reusable; pangrams surface in their own highlighted group
- **Letter Boxed** — twelve letters on four sides, 3+ letter words, letters reusable, but consecutive letters can't share a side; two-word solutions covering all twelve letters surface first, shortest first

### Dictionaries

Three tiers, selectable per mode: **Common** (everyday words, ideal for Wordle-style puzzles), **Standard** (adds less frequent words), and **Full** (~275,000 words, obscurities included). The larger dictionaries load on demand to keep the initial page light.

### Quality of life

- **Live results** computed entirely in the browser — nothing leaves your device
- **Sorting** — alphabetical asc/desc everywhere; Descramble and Spelling Bee also sort by word length with results grouped per length
- **Click any result to copy it** to the clipboard
- **Smart letter tiles** — typing auto-advances to the next box, Backspace steps back, arrow keys navigate, and filled tiles get a small × pill to clear them
- **Letter-pill inputs** — multi-letter fields (must contain, excluded, rack) show each letter as a removable pill with a corner ×
- **Toggleable on-screen keyboard** — fluid-width QWERTY panel that fits any screen, with a `?` key for blank tiles in Descramble; while open, the device's native keyboard stays suppressed
- **Everything is remembered** — active mode, per-mode dictionary and sort preferences, your last letters in each mode, and the keyboard state persist in localStorage

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

Two environments are deployed on Render:

| Environment | URL | Branch |
|---|---|---|
| Production | [www.anagrimoire.com](https://www.anagrimoire.com) | `main` |
| Dev | [dev.anagrimoire.com](https://dev.anagrimoire.com) | `dev` |

Pushes to each branch auto-deploy to the matching environment.

## Disclaimer

Anagrimoire is an independent project. It is not affiliated with, endorsed by, or sponsored by The New York Times Company (Wordle, Spelling Bee, Letter Boxed), Hasbro or Mattel (Scrabble), Tribune Content Agency (Jumble), or any other puzzle publisher. All game names and trademarks are the property of their respective owners and are used only to describe the kinds of puzzles this tool can help with. No word list is guaranteed to match any game's official dictionary.

## License

[MIT](LICENSE) © Ray Tetzloff
