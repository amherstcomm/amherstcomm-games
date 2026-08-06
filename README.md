# Anagrimoire

Seven word games, each with a solver behind it, a fresh puzzle every morning, and a guided demo. Solve by pattern — lock in the letters you know by position, list the letters that must appear somewhere, exclude the rest — descramble a rack, crack a Spelling Bee hive, find two-word Letter Boxed solutions, trace a Strands-style board, or fill a word square.

*Vibe-coded with [Claude](https://claude.com/claude-code).*

**Live site:** [anagrimoire.com](https://anagrimoire.com) · **Dev preview:** [dev.anagrimoire.com](https://dev.anagrimoire.com)

## Features

### Solver modes

- **Guess the Word** (Wordle, crosswords, hangman) — word lengths from 3 to 15; tile inputs for known positions, must-contain letters (position unknown, duplicates respected), and excluded letters, with per-letter highlighting in the results
- **Scramble** (Scrabble, Jumble) — find every word a rack of letters can spell, with `?` wildcards for blank tiles, an exact-anagram "use every letter" option, and a minimum-length filter
- **Hive** (Spelling Bee-style) — seven letters entered on a hive (amber center, six around), 4+ letter words, center letter required, letters reusable; pangrams surface in their own highlighted group, and today's NYT puzzle autofills with one click for solving
- **Grid** (Boggle-style) — enter the letters of a 3×3, 4×4, or 5×5 square and find every word traceable through adjacent cells (diagonals count), each cell used once per word
- **Boxed** (Letter Boxed-style) — twelve letters entered around a square, 3+ letter words, letters reusable, but consecutive letters can't share a side. Pick a solution length (1–5 words) to see chains covering all twelve letters, get a starred recommendation (fewest words, everyday vocabulary, fewest letters), hover any word or solution chain to trace its criss-cross path on the box, or autofill today's NYT puzzle with one click (a daily GitHub Action publishes Letter Boxed and Spelling Bee data to the `puzzle-data` branch about 15 minutes after the NYT publishes at 3:00 a.m. Eastern)
- **Squares** — type the letters you're sure of in a 4×4 or 5×5 grid and it fills the rest so that every row *and* every column spells a word, showing several ways where more than one fits

Every solver can autofill **today's daily puzzle** (ours) with one click; the Hive, Boxed, and Weave solvers can also load **today's NYT puzzle** (Spelling Bee, Letter Boxed, Strands).

### Play mode

Every mode has a **Solve / Play** toggle.

- **Guess the Word**: six tries at any length from 3 to 15 letters, duplicate-aware coloring, physical and on-screen keyboard support (with letter coloring), and persistent boards and stats. **Daily** serves the same word to everyone per length — generated deterministically by the daily GitHub Action — with a win streak; **Practice** deals unlimited random words. Answers come from the Common dictionary so they're always fair; guesses are validated against the Full one.
- **Scramble**: a three-minute sprint to find every word you can from a seven-letter rack (each letter usable once per word). Racks are shuffled real words, so a full-rack bonus word always exists; 3-letter words score 1, longer words their length, whole-rack +7. When time's up, one click reveals every answer in the solver. **Daily** rack for everyone; **Practice** deals unlimited racks.
- **Grid** (Boggle-style): a three-minute sprint to find every word you can trace through the 4×4 grid, with classic scoring (3–4 letters 1 pt, 5: 2, 6: 3, 7: 5, 8+: 11). Cells stay face-down until you press Start. **Daily** grids roll from the classic sixteen-dice distributions; **Practice** deals unlimited grids in 3×3, 4×4, or 5×5 (Big Boggle dice for the largest).
- **Box** (Letter Boxed-style): chain words around the square to use all twelve letters — each word starts with the previous word's last letter, consecutive letters can't share a side. Boxes are our own, built from two chainable words so a two-word solution always exists; **Daily** is the same generated box for everyone, **Practice** deals unlimited boxes. Backspace un-commits words for editing. The current entry draws its criss-cross line live on the box, and hovering a committed word traces its path. **Help** peeks at the solver mid-game; **Reveal** gives up, ending the board unfinished (no solve is recorded).
- **Hive**: find words from seven letters — 4-letter words score 1, longer words score their length, pangrams +7 — with a rank ladder up to Queen Bee, scored against the Standard dictionary. **Daily** plays our own generated hive (the same one for everyone, seeded from a pangram so it's always completable — not the NYT's puzzle); **Practice** deals unlimited fresh hives. Tap the hive or type; shuffle, delete, and found-word history included. **Help** peeks at the solver mid-game; **Reveal** gives up, ending the hive unfinished.

- **Weave** (Strands-style): themed words tile the whole board — every letter used exactly once, with a spangram spanning the board. Drag to trace; theme words lock blue, the spangram gold, other dictionary words (4+ letters) bank toward hints that outline an unfound word, and a Reveal gives up gracefully. Completion (either way) draws every word's path as a line overlay. Puzzles are generated from a curated theme file with a subset-sum + backtracking packer. **Daily** is a 6×8 board; **Practice** draws from a daily pool in 6×8 or 8×10 (hard). Weave also has a Solve mode: enter any 6×8 Strands or 8×10 board (or autofill today's NYT Strands with its theme clue) to list every traceable word, hover to see its path.
- **Word Squares**: fill a grid so every row and every column is a word. Some letters are given and the rest are yours; a bar beside each line turns green when that line is a word and red when it's full but isn't. Two sizes — a 4×4 with six letters given and a 5×5 with ten — each a separate daily and a separate leaderboard, since they aren't the same puzzle. Boards are generated so that ten *different* words appear (five read twice would be half a puzzle) and exactly one filling works. **Practice** draws from a daily pool.

Daily content refreshes about 15 minutes after 3:00 a.m. Eastern. The dev site (and local development) gets its own independently generated daily set, so testing there never spoils the production puzzles.

When accounts are configured, each daily also shows a one-line **global summary** once you finish (player count, solve rate, averages — e.g. "12 players · 75% solved · avg 2 hints"). The numbers are anonymous aggregates over signed-in players' synced results, computed by a security-definer SQL function that exposes only totals, and they're visible to everyone — signing in is how you contribute, not how you see them.

### Dictionaries

Three tiers, selectable per mode: **Common** (everyday words, ideal for Wordle-style puzzles), **Standard** (adds less frequent words), and **Full** (~275,000 words, obscurities included). The larger dictionaries load on demand to keep the initial page light.

### Quality of life

- **Live results** computed entirely in the browser — nothing leaves your device
- **Sorting** — alphabetical asc/desc everywhere; Descramble and Spelling Bee also sort by word length with results grouped per length
- **Click any result to copy it** to the clipboard
- **Smart letter tiles** — typing auto-advances to the next box, Backspace steps back, arrow keys navigate, and filled tiles get a small × pill to clear them
- **Letter-pill inputs** — multi-letter fields (must contain, excluded, rack) show each letter as a removable pill with a corner ×
- **Toggleable on-screen keyboard** — fluid-width QWERTY panel that fits any screen, with a `?` key for blank tiles in Descramble; while open, the device's native keyboard stays suppressed
- **Themes & accessibility** — a Settings panel (in the footer) offers light, dark, or system appearance plus four color palettes: **Default**, **Red–green friendly** (deuteranopia/protanopia — blue and orange replace green and amber, on Okabe-Ito hues), **Blue–yellow friendly** (tritanopia — green against vermilion, the axis those eyes keep), and **Monochrome** (no hue at all; game states separate by lightness). Every color resolves through CSS variables. All eight theme × palette combinations were audited to meet WCAG AA contrast, and the game states were checked to stay distinguishable under simulated deuteranopia, protanopia, and tritanopia. A text-size setting (normal / large / larger) scales the whole page, and browser zoom and font-size preferences still compound on top — every size in the app is expressed in relative units. Verified against WCAG 1.4.4 (text at 200%), 1.4.10 (reflow at 320px, including the 8×10 board, the on-screen keyboard, and every dialog), and 1.4.12 (text-spacing overrides) with no clipping or horizontal scrolling. Settings persist locally and sync to your account when signed in.
- **Share your result** — every game offers a spoiler-free summary once it's finished: Guess posts the familiar coloured tile grid, Weave one mark per word in the order you found them (gold for the spangram, a bulb per hint), and the rest a score-and-rank line. Emoji follow your palette, so what you post matches what you saw. **Nothing shared ever contains a letter or a word** — not even Weave's theme clue, since working that out is half the puzzle. Uses the native share sheet on phones and the clipboard elsewhere.
- **Keyboard accessible** — a skip link jumps past the mode tabs to the puzzle, every focusable control shows a high-contrast focus ring, and dialogs move focus in, trap Tab, close on Escape, and hand focus back to whatever opened them. Every game is playable by keyboard: the typing games listen directly, and Weave's board (a single tab stop) gets a cursor you steer with the arrow keys plus a diagonal ring — number pad `7 8 9 / 4 6 / 1 2 3` or `Q W E / A D / Z S X`, selectable in Settings with a diagram of the chosen layout. Enter starts a word and submits it, Backspace steps back — and every reachable cell shows its key in the corner, so the next move is never a guess. You still have to find the word on the board. A **Keys** panel in the footer lists every shortcut.
- **Learn mode** — every game has a third Solve / Play / **Learn** tab: rules, scoring, daily/practice differences, tips, and a hands-on interactive demo (step through a worked Guess solve, tap out words on a mini rack/hive/box, drag-trace a mini grid or Weave board) validated against the real dictionary
- **You choose what's remembered** — a first visit asks two separate questions, because they aren't the same question: whether the site may keep your games on this device, and whether analytics may leave it. Storage has three answers — **Remember** (boards, settings, statistics, as before), **Signed in only** (the session token and nothing else; with an account the dailies still follow you, since they live there), and **Forget everything** (nothing written at all — every game still plays, and closing the tab starts over). Changeable later under Settings → What this device keeps, and choosing less clears what was already there. Everything in the app reads and writes through one gate, so the setting is enforced in a single place rather than in every game
- **Statistics, history and boards** — a Stats panel (in the footer) with five tabs. **Overall / Daily / Practice** are lifetime totals: Guess win rate, streak and distribution; Hive words, pangrams, Genius and Queen Bee; Scramble and Grid sprint scores; Boxed solves with fewest words and best time; Weave solves, reveals and hints; Word Squares solves and best time, kept per board size. **History** plots your dailies day by day — Guess as a distribution plus a table per word length, the rest as sparklines, with streaks counted off puzzle dates rather than a stored counter. **Boards** ranks everyone who has set a display name. Signed out it's all local; signed in it's your account's.
- **Real addresses** — every state has a URL and the address bar follows you: `/solve/guess`, `/play/hive`, `/daily/squares`, `/learn/grid`, `/stats/history`, `/settings/games`, `/legal/privacy`. Opening a panel puts it in the bar and Back closes it; closing one steps back rather than stacking a new entry. Older spellings still work and rewrite themselves on arrival — both the `?daily=hive` query links and `/solve/pattern`, from when Guess was called Pattern.
- **A front page** — `/` lists the seven games with today's state on each (read from your own browser, so it works signed out) and the top of today's board. Regulars who'd rather skip it can set Settings → Site → Start on to a game, or to wherever they left off.

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

## Accounts & sync (optional)

The site is fully functional with no backend — solving and playing stay in the browser. Optionally, a [Supabase](https://supabase.com/) project adds sign-in (magic link, one-time code, GitHub or Google) and carries four things between devices:

- **Statistics.** Every completed practice game is appended to a per-user event log; the browser's pre-account totals are imported once as a baseline, and the Stats panel replays baseline + log instead of reading the local store.
- **Dailies in progress.** A daily's board is one row per puzzle, merged rather than overwritten, so you can start on a phone and finish on a laptop — and can't accidentally play the same day twice. The merge rules are deliberate about deletions: erasing a letter has to survive the next sync, which a naive union would undo.
- **Settings.** Theme, palette, text size, which games are shown, and the start page.
- **A display name**, which is the opt-in to the leaderboards and the only thing about an account any other player can see. Without one you don't appear at all.

There's also self-serve deletion under Account: one button clears your play record and keeps the account, another deletes the account outright. Both derive the account from `auth.uid()` and take no argument, because a function accepting a user id is a delete-anybody endpoint the moment somebody edits a uuid in the network tab.

Signed out — or without the env vars below — every auth surface hides and everything stays local.

Setup:

1. Create a free Supabase project.
2. Run [supabase/schema.sql](supabase/schema.sql) in the SQL Editor (safe to re-run — re-run it after pulling changes, since it also adds new columns like `profiles.settings`).
3. In **Authentication → URL Configuration**, set the Site URL to `https://anagrimoire.com` and add `https://www.anagrimoire.com` (the alias), `https://dev.anagrimoire.com`, and `http://localhost:5173` as additional redirect URLs — sign-in redirects back to whichever origin the visitor is on, so both spellings of production must be allowed.
4. Copy the Project URL and anon/publishable key (**Settings → API**) into env vars — `.env.local` for local dev (see [.env.example](.env.example)), and environment variables on each Render static site. The anon key is public by design; row-level security protects the data.

5. Optionally enable OAuth providers (**Authentication → Providers**): create a GitHub/Google OAuth app with the callback URL Supabase shows there, and paste in its client ID and secret. The sign-in modal offers both alongside email.

Note: Supabase's built-in email service is rate-limited (a few magic links per hour) and its templates can't be edited without custom SMTP. Magic links are single-use, and corporate email scanners sometimes pre-click them — the modal accepts the emailed one-time code as a fallback, but the code only appears in the email once custom SMTP is configured with `{{ .Token }}` in the Magic Link template. Until then, OAuth is the frictionless path.

## Analytics (optional)

Set `VITE_GA_ID` to a Google Analytics 4 measurement ID (`G-…`) and the site loads gtag and reports pageviews; leave it unset and nothing is injected. Use one GA4 property with a separate web data stream (and measurement ID) for each environment, set on the matching Render site, so prod and dev numbers stay separable.

Every visitor is asked, wherever they are, and nothing loads until they agree — no geo-IP lookup, and no guessing the region from a time zone, which was the previous approach and could be defeated by a VPN. Declining is one click, the same as accepting, and is remembered. An answer lasts a year before it's asked again. A Global Privacy Control signal counts as a refusal without asking at all. Either way it can be switched off under Settings → Analytics, which also clears the cookies it had set. No account identifier is ever sent, so Google holds a browser-scoped id with nothing to tie it to a person.

## Privacy and terms

`/legal/privacy` and `/legal/terms`, written to describe what the code actually does — the rule being that if the two disagree, the code is right and the document is wrong. Both live in [src/LegalDocs.tsx](src/LegalDocs.tsx).

## Deployment

The repo includes a [Render](https://render.com/) blueprint ([render.yaml](render.yaml)) that provisions a static site: it builds with `npm ci && npm run build`, publishes `dist/`, rewrites all routes to `index.html`, and sets long-lived cache headers on hashed assets.

Two environments are deployed on Render:

| Environment | URL | Branch |
|---|---|---|
| Production | [anagrimoire.com](https://anagrimoire.com) (www is an alias) | `main` |
| Dev | [dev.anagrimoire.com](https://dev.anagrimoire.com) | `dev` |

Pushes to each branch auto-deploy to the matching environment.

## Disclaimer

Anagrimoire is an independent project. It is not affiliated with, endorsed by, or sponsored by The New York Times Company (Wordle, Spelling Bee, Letter Boxed, Strands), Hasbro or Mattel (Scrabble, Boggle), Tribune Content Agency (Jumble), or any other puzzle publisher. All game names and trademarks are the property of their respective owners and are used only to describe the kinds of puzzles this tool can help with. No word list is guaranteed to match any game's official dictionary.

## License

[MIT](LICENSE) © Ray Tetzloff
