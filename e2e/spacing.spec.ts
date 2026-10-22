// Nothing touches that should not.
//
// Every page, at a desk and on a phone, and on a phone at the largest text
// size -- which is a setting people use, and where a row of controls that fits
// at the default stops fitting. On each, every pair of visible boxes (anything
// with a border or a fill) is measured, and the test fails on:
//
//   - two boxes overlapping, or touching with less than 3px between them
//   - a box crowding a line of text to within 4px
//   - anything wider than the screen, so the page scrolls sideways
//   - text running out through the side of its own box
//   - something tappable left under the floating keyboard button at the very
//     bottom of a page, where scrolling can no longer reveal it
//
// It exists because of two prize chips on the tournament page that were
// glued to each other and to the card below them. Eyeballing found those two;
// the first run of this found the rest, and a spacing bug nobody measured is
// one that comes back.
//
// What is deliberately not a collision, and why:
//   - the ambient glows behind the page (pointer-events-none, positioned)
//   - things passing under the sticky bar, which is what sticky is for
//   - a label on its own control: "New session" sits on its text box by design
//   - anything inside [data-joined] -- a cryptogram word's letters run
//     together and sit on their cipher numbers, which is how a run of cells
//     reads as one word; the attribute says so where the markup is, rather
//     than this file exempting a whole page
//   - an absolutely positioned badge overhanging its tile, like Weave's
//     keyboard shortcut numbers: an overhang is the point of a corner badge
//   - the floating button over content mid-page: a floating button floats,
//     and scrolling reveals what is under it. Only the bottom of the page,
//     where nothing more can scroll into view, is judged -- and by what the
//     browser would hand a tap at that spot, so a dialog stacked above the
//     button does not count as covered by it.
import { expect, test } from './fixtures';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (n: number) =>
  new Date(new Date(`${today}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// --- what the pages are given to draw -------------------------------------
// Everything a page could show at once, prizes included: a page stubbed empty
// is a page with nothing to collide.

const ROUND = {
  tournament_id: 't1',
  tournament: 'Ownership Cup',
  difficulty: 'easy',
  tournament_starts_on: plus(-3),
  tournament_ends_on: plus(4),
  tournament_prize: '$100 Gift Card',
  round_id: 'r1',
  starts_on: plus(0),
  ends_on: plus(0),
  games: ['weave', 'hive'],
  game_weights: { weave: 2 },
  trivia: [{ session_id: 's1', title: 'Test 15', mode: 'open', state: 'closed', weight: 10 }],
  contests: [
    { contest_id: 'c1', name: 'Pumpkin carving', phase: 'voting', votes_close_on: plus(2), weight: 2 },
  ],
  prize: '$25 Gift Card',
  number: 1,
  of: 5,
};

const STANDINGS = {
  ok: true,
  tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'easy', prize: '$100 Gift Card' },
  table: [
    { name: 'Ray Tetzloff', points: 100, wins: 1, placed: 1 },
    { name: 'Ada Lovelace', points: 40, wins: 0, placed: 2 },
  ],
  rounds: [
    {
      id: 'r0', number: 1, starts_on: plus(-2), ends_on: plus(-2), prize: '$25 Gift Card',
      weights: {}, boards: { hive: [{ name: 'Bea', value: 88, detail: 1 }] }, trivia: [], contests: [],
    },
    {
      id: 'r1', number: 2, starts_on: plus(0), ends_on: plus(0), prize: '$25 Gift Card',
      weights: { weave: 2 },
      boards: { weave: [{ name: 'Ada Lovelace', value: 1, detail: 95000, hints: 0 }] },
      trivia: [
        {
          session_id: 's1', title: 'Test 15', mode: 'open', weight: 10,
          standings: [{ place: 1, name: 'Ray Tetzloff', points: 6, seconds: 48 }],
        },
      ],
      contests: [{ contest_id: 'c1', name: 'Pumpkin carving', phase: 'voting', weight: 2, standings: [] }],
    },
  ],
};

const CONTEST = {
  id: 'c1', name: 'Pumpkin carving', blurb: 'Carve one, photograph it.',
  entries_open_on: plus(-5), entries_close_on: plus(-1), votes_open_on: plus(0), votes_close_on: plus(2),
  who_enters: 'admins', entrants_shown: true, voters_shown: true, picks: 3, prize: 'A day off',
  phase: 'voting', may_enter: true, may_vote: true,
};
const ENTRIES = [
  { id: 'e1', title: 'Jack', blurb: 'Butter knife.', image_path: null, entrant: 'Ada', mine: false },
  { id: 'e2', title: 'Gourdon', blurb: null, image_path: null, entrant: 'Bea', mine: false },
  { id: 'e3', title: 'Squash', blurb: null, image_path: null, entrant: 'Cal', mine: false },
];

/** The contest page is three different pages depending on its phase, so the
 *  contest asked for decides which: c1 voting and organiser-entered, c2 taking
 *  a player's own entry, c3 over with a result. */
function contestPage(id: string) {
  if (id === 'c2') {
    return {
      ok: true, my_votes: [], entries: ENTRIES.map((e, i) => ({ ...e, mine: i === 0 })),
      contest: {
        ...CONTEST, id: 'c2', who_enters: 'players', phase: 'entries', may_enter: true, may_vote: false,
        entries_close_on: plus(2), votes_open_on: plus(3), votes_close_on: plus(5),
      },
    };
  }
  if (id === 'c3') {
    return {
      ok: true, my_votes: [], entries: ENTRIES,
      contest: { ...CONTEST, id: 'c3', phase: 'over', may_enter: false, may_vote: false, votes_close_on: plus(-1) },
    };
  }
  return { ok: true, contest: CONTEST, entries: ENTRIES, my_votes: ['e2'] };
}

/** A contest round running across the daily one: what the tournament page
 *  draws when rounds overlap, which is a different layout from one round. */
const CONTEST_ROUND = {
  ...ROUND,
  round_id: 'r2', number: 2, starts_on: plus(-1), ends_on: plus(4),
  games: [], trivia: [], prize: 'A day off',
};

// A giveaway taking entries, run by the reader, and one drawn twice over --
// somebody declined -- so every part of the page has something in it.
const GIVEAWAY_ENTRANTS = [
  { person: 'p1', name: 'Ray Tetzloff', weight: 1000000 },
  { person: 'p2', name: 'A rather long display name for somebody', weight: 514239 },
  { person: 'p3', name: 'Bea', weight: 250000 },
];
// A judged giveaway's judging: the long answers and every control a judge and
// an organiser both see at once.
const JUDGED_QUESTIONS = [
  { id: 'q1', prompt: 'What does being an owner mean to you, in a sentence or two?' },
  { id: 'q2', prompt: 'Who would you take?' },
];
function judgingPage(id: string) {
  const decided = id === 'g4' || id === 'g6';
  const rated = id === 'g5' || id === 'g6';
  return {
    ok: true, is_judge: !decided, decided, picks: 3, questions: JUDGED_QUESTIONS,
    mode: rated ? 'screened' : 'judged', bar: 3, my_ratings: rated && !decided ? { 'Entry 2': 4 } : null,
    judges: [{ user: 'u1', name: 'Ray Tetzloff', ranked: true }, { user: 'u2', name: 'A rather long display name for somebody', ranked: false }],
    entries_count: 3, mine: null, entered: false, my_ranking: decided ? null : ['Entry 2'],
    entries: GIVEAWAY_ENTRANTS.map((e, i) => ({
      person: decided ? e.person : null, key: e.person, label: `Entry ${i + 1}`, name: decided ? e.name : null,
      own: i === 0 && !decided, points: 6 - i * 2, firsts: 1,
      average: rated ? 4.5 - i * 1.5 : null, rated_by: rated ? 2 : null, qualified: rated && decided ? i < 2 : null,
      ratings: rated && decided ? [{ judge: 'Ray Tetzloff', rating: 5 - i }, { judge: 'A rather long display name for somebody', rating: 4 - i }] : null,
      ranks: decided ? [{ judge: 'Ray Tetzloff', rank: i + 1 }, { judge: 'A rather long display name for somebody', rank: 3 - i }] : null,
      answers: [
        { question: 'q1', answer: 'A voice in what we build, and a share in what it earns when the year goes well for all of us.' },
        { question: 'q2', answer: 'My dad' },
      ],
    })),
  };
}

function giveawayPage(id: string) {
  const drawn = id === 'g2';
  const draw = (seq: number, winner: (typeof GIVEAWAY_ENTRANTS)[number]) => ({
    id: `d${seq}`, seq, reason: seq === 1 ? 'first drawing' : 'drawing again: Bea declined', wanted: 1,
    entrants: GIVEAWAY_ENTRANTS, total: 1764239, snapshot_hash: 'ab'.repeat(32),
    chain: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971', round: 22_000_000 + seq,
    round_at: `2026-10-0${seq}T15:00:00Z`, committed_at: `2026-10-0${seq}T14:59:30Z`, committed_by: 'Ray Tetzloff',
    randomness: 'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd', signature: 'b4',
    winners: [{ ...winner, pick: 1, hash: 'f94c1c77a99a6'.padEnd(64, '0'), target: 959526, total: 1764239 }],
    revealed_at: `2026-10-0${seq}T15:00:02Z`, revealed_by: 'Ray Tetzloff',
  });
  return {
    ok: true, can_manage: true, me: 'p1',
    chain: { hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971', genesis: 1692803367, period: 3 },
    giveaway: {
      id, title: drawn ? 'Brewers vs Cubs, the last home game of the season' : 'Bucks vs Bulls',
      prize: '2 tickets, section 112, row 4', details: 'Saturday 1:10pm. Parking pass included.',
      winners: 1, event_on: plus(8), self_entry: true, entries_close_at: drawn ? null : `${plus(3)}T17:00:00Z`,
      strength: 1, half_life_days: 365, cancelled_reason: null,
      // g3 is a judged one being judged, g4 one decided; g5 is a rated one
      // being rated, g6 one whose pool is set
      status: id === 'g3' || id === 'g5' ? 'judging' : id === 'g6' ? 'qualified' : drawn || id === 'g4' ? 'drawn' : 'open',
      mode: id === 'g3' || id === 'g4' ? 'judged' : id === 'g5' || id === 'g6' ? 'screened' : 'draw', picks: 3, bar: 3,
      created_at: `${plus(-6)}T14:00:00Z`, created_by: 'Ray Tetzloff',
    },
    entrants: GIVEAWAY_ENTRANTS.map((e, i) => ({
      ...e, linked: i < 2, entered_at: `${plus(-5)}T14:00:00Z`, entered_by: 'Ray Tetzloff', self: i === 0,
      attended: i === 1 ? [{ on: plus(-30), what: 'Bucks game' }, { on: plus(-400), what: 'Brewers opening day' }] : [],
    })),
    draws: drawn ? [draw(1, GIVEAWAY_ENTRANTS[2]), draw(2, GIVEAWAY_ENTRANTS[0])] : [],
    winners: drawn
      ? [
          { person: 'p3', name: 'Bea', pick: 1, draw: 1, status: 'declined', decided_at: null, decided_by: 'Ray Tetzloff' },
          { person: 'p1', name: 'Ray Tetzloff', pick: 1, draw: 2, status: 'pending', decided_at: null, decided_by: null },
        ]
      : [],
    log: [
      { at: `${plus(-6)}T14:00:00Z`, actor: 'Ray Tetzloff', action: 'created', detail: {} },
      { at: `${plus(-5)}T14:00:00Z`, actor: 'Ray Tetzloff', action: 'entered', detail: { name: 'Bea', self: false } },
      { at: `${plus(-1)}T14:00:00Z`, actor: 'Ray Tetzloff', action: 'committed',
        detail: { draw: 1, entrants: 3, wanted: 1, round: 22000001 } },
    ],
  };
}

function reply(fn: string, args: Record<string, unknown>, path: string): unknown {
  switch (fn) {
    case 'my_capabilities':
      return ['site.settings', 'users.manage', 'games.setup', 'winners.view'];
    case 'is_owner':
      return true;
    case 'current_rounds':
      return path.includes('rounds=several') ? [ROUND, CONTEST_ROUND] : [ROUND];
    case 'tournament_standings':
      return STANDINGS;
    case 'contest_view':
      return contestPage(String(args.p_contest));
    case 'contests_on':
      return [
        {
          id: 'c1', name: 'Pumpkin carving', phase: 'voting', entries_close_on: plus(-1),
          votes_open_on: plus(0), votes_close_on: plus(2), entries: 3,
        },
      ];
    case 'contest_results':
      return {
        ok: true, final: args.p_contest === 'c3', voters: 14, prize: 'A day off',
        table: [
          { place: 1, entry_id: 'e2', title: 'Gourdon', points: 21, firsts: 5, entrant: 'Bea' },
          { place: 2, entry_id: 'e1', title: 'Jack', points: 17, firsts: 3, entrant: 'Ada' },
          { place: 3, entry_id: 'e3', title: 'Squash', points: 8, firsts: 0, entrant: 'Cal' },
        ],
        ballots: [{ voter: 'Ada', picks: ['Gourdon', 'Squash'] }],
      };
    case 'contest_entries_sheet':
      return {
        ok: true,
        entries: ENTRIES.map((e) => ({ ...e, entrant: 'u', entrant_name: e.entrant, entered_by_me: true })),
      };
    case 'contests_sheet':
      return { ok: true, contests: [{ ...CONTEST, entries: 3 }] };
    case 'tournaments_sheet':
      return {
        ok: true,
        tournaments: [
          {
            id: 't1', name: 'Ownership Cup', difficulty: 'easy', starts_on: plus(-3), ends_on: plus(4),
            locks_site: true, sessions_open: false, prize: '$100 Gift Card',
            rounds: [
              {
                id: 'r1', starts_on: plus(0), ends_on: plus(0), games: ['weave', 'hive'],
                game_weights: { weave: 2 }, prize: '$25 Gift Card', trivia: ROUND.trivia,
                contests: ROUND.contests, started: true,
              },
            ],
          },
        ],
      };
    case 'word_lists_sheet':
      return { ok: true, lists: [] };
    case 'word_policies_sheet':
      return { ok: true, policies: [] };
    case 'current_item':
      return {
        state: 'open', id: 'q1', position: 1, opened_at: new Date().toISOString(), seconds: 30,
        now: new Date().toISOString(), mine: { One: 'Alpha', Two: 'Beta', Three: 'Gamma' }, answer: null,
        yours: false, kind: 'match', prompt: 'Match the year to the event',
        payload: {
          left: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
          right: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'],
        },
      };
    case 'session_leaderboard':
      return {
        ok: true, scored: 4,
        standings: [
          { place: 1, name: 'Ray Tetzloff', points: 12, seconds: 48 },
          { place: 2, name: 'Ada Lovelace', points: 9, seconds: 61 },
          { place: 3, name: 'A rather long display name', points: 3, seconds: 120 },
        ],
      };
    case 'my_standing':
      return { ok: true, points: 6, scored: 2 };
    case 'giveaways_list':
      return {
        ok: true, can_manage: true,
        giveaways: [
          { id: 'g1', title: 'Bucks vs Bulls', prize: '2 tickets, section 112, row 4', winners: 1, event_on: plus(8),
            status: 'open', self_entry: true, entries_close_at: null, entrants: 3, entered: true, drawn: [] },
          { id: 'g2', title: 'Brewers vs Cubs, the last home game of the season', prize: '4 tickets', winners: 2,
            event_on: plus(-2), status: 'drawn', self_entry: true, entries_close_at: null, entrants: 12,
            entered: false, drawn: ['Ray Tetzloff', 'A rather long display name for somebody'] },
        ],
      };
    case 'giveaway_judging':
      return judgingPage(String(args.p_id));
    case 'giveaway_detail':
      return giveawayPage(String(args.p_id));
    case 'giveaway_history':
      return {
        ok: true, can_manage: true,
        people: GIVEAWAY_ENTRANTS.map((e, i) => ({
          person: e.person, name: e.name, linked: i < 2, entries: 4, wins: i, weight: e.weight,
          attended: i === 1
            ? [{ id: 'a1', on: plus(-30), what: 'Bucks game', source: 'giveaway', giveaway: 'g0' },
               { id: 'a2', on: plus(-400), what: 'Brewers opening day', source: 'manual', giveaway: null }]
            : [],
          won: i === 1 ? [{ on: plus(-60), what: 'Employee Ownership Month gift card, the big one', giveaway: 'g9' }] : [],
        })),
        log: [{ at: `${plus(-3)}T14:00:00Z`, actor: 'Ray Tetzloff', action: 'attendance recorded',
                detail: { name: 'Bea', what: 'Brewers opening day', on: plus(-400) } }],
      };
    default:
      return { ok: true };
  }
}

// --- every address ---------------------------------------------------------
// Written out rather than imported: routes.ts reaches import.meta.env through
// the brand module, which Node cannot load. routes.test.ts holds the list the
// app itself enumerates; a page added there and not here is a page this file
// does not look at.
const SESSION = '5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4b';
const PAGES: [string, string][] = [
  ['home', '/'],
  ...['guess', 'scramble', 'hive', 'grid', 'boxed', 'weave', 'squares', 'cryptogram', 'ladder', 'bridge'].map(
    (slug): [string, string] => [`daily ${slug}`, `/daily/${slug}`]
  ),
  ['tournament', '/tournament'],
  ['tournament, several rounds', '/tournament?rounds=several'],
  ['round game', '/tournament/weave'],
  ['contest list', '/contest'],
  ['contest voting', '/contest/c1'],
  ['contest entering', '/contest/c2'],
  ['contest over', '/contest/c3'],
  ['giveaways', '/giveaways'],
  ['giveaway open', '/giveaways/g1'],
  ['giveaway drawn', '/giveaways/g2'],
  ['giveaway replay', '/giveaways/g2/replay'],
  ['giveaway history', '/giveaways/history'],
  ['giveaway being judged', '/giveaways/g3'],
  ['giveaway judged and decided', '/giveaways/g4'],
  ['giveaway being rated', '/giveaways/g5'],
  ['giveaway rated, pool set', '/giveaways/g6'],
  ...['site', 'games', 'lists', 'weave', 'passages', 'pins', 'coverage', 'tournaments', 'contests', 'people'].map(
    (tab): [string, string] => [`admin ${tab}`, `/admin/${tab}`]
  ),
  ...['site', 'games', 'privacy'].map((tab): [string, string] => [`settings ${tab}`, `/settings/${tab}`]),
  ...['overall', 'daily', 'practice', 'history', 'boards'].map((tab): [string, string] => [`stats ${tab}`, `/stats/${tab}`]),
  ...['personal', 'friends'].map((tab): [string, string] => [`account ${tab}`, `/account/${tab}`]),
  ['keys', '/keys'],
  ['about', '/about'],
  ...['notices', 'privacy', 'terms'].map((doc): [string, string] => [`legal ${doc}`, `/legal/${doc}`]),
  ['sessions', '/sessions'],
  ['join', '/join'],
  ['live question', `/live/${SESSION}`],
  ['presenter', `/live/${SESSION}/host`],
  ['scores', `/scores/${SESSION}`],
];

// The site has no font of its own: it draws in the system's UI font, so how
// wide a label is depends on whose machine draws it -- Segoe here, Roboto on
// Android, San Francisco on an iPhone, and something wider on the CI runner.
// Two controls that fit on this machine broke there, and there is no
// installing "whatever GitHub has". So the last setup widens every letter,
// and a control that only fits in a narrow font fails here as well as there.
//
// Calibrated against CI rather than guessed: at 0.09em this reproduces the
// runner's two failures exactly, and nothing else fails. 0.12em leaves
// headroom for fonts wider than the runner's and still flags only real
// problems -- a stress setup that caught less than CI would prove nothing.
//
// On every element, not the body: set on the body it is inherited, and any
// element with letter spacing of its own -- Bridge's uppercase words, with
// tracking-wide -- overrides it and was never stressed at all. That is how a
// row the CI font spilled 4px out of passed here even at 0.2em.
//
// It is still not CI's font, and cannot be: the runner draws in a font wider
// than anything this setting reproduces, so a layout that only fits by a few
// pixels can still pass here and fail there. The fix for that is a layout that
// does not depend on how wide a word is -- one that wraps -- not a bigger
// number here.
const WIDE_FONT = '*, *::before, *::after { letter-spacing: 0.12em !important; }';

const SETUPS = [
  ['desk', { width: 1280, height: 900 }, 'normal', ''],
  ['phone', { width: 390, height: 844 }, 'normal', ''],
  ['phone, largest text', { width: 390, height: 844 }, 'larger', ''],
  ['phone, largest text, wide font', { width: 390, height: 844 }, 'larger', WIDE_FONT],
] as const;

type Finding = { kind: string; a: string; b: string };

/** Measures the page. Runs in the browser; `atBottom` is which of the two
 *  passes this is -- layout at the top, the floating button at the bottom. */
function measure(atBottom: boolean): Finding[] {
  const describe = (el: Element) => {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 5).join('.');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${text}"`;
  };
  const visibleColour = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return p.length < 4 || p[3] > 0.02;
  };
  const isFixed = (el: Element) => {
    for (let p: Element | null = el; p; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') return true;
    }
    return false;
  };
  const shown = (cs: CSSStyleDeclaration) =>
    cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
  const floatingButton = (el: Element) => el.getAttribute('aria-label') === 'Show keyboard';

  type Box = { el: Element; r: DOMRect; fixed: boolean };
  const boxes: Box[] = [];
  const texts: Box[] = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const cs = getComputedStyle(el);
    if (!shown(cs)) continue;
    if (cs.pointerEvents === 'none' && (cs.position === 'absolute' || cs.position === 'fixed')) continue;
    if (el.closest('.sticky')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const bordered = (['Top', 'Right', 'Bottom', 'Left'] as const).some(
      (s) => parseFloat(cs[`border${s}Width`]) > 0 && visibleColour(cs[`border${s}Color`])
    );
    if (bordered || visibleColour(cs.backgroundColor)) {
      if (r.width > innerWidth * 0.95 && r.height > innerHeight * 0.5) continue;
      boxes.push({ el, r, fixed: isFixed(el) });
      continue;
    }
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0
    );
    if (ownText && /^(block|flex|grid|list-item)$/.test(cs.display)) {
      texts.push({ el, r, fixed: isFixed(el) });
    }
  }

  const out: Finding[] = [];
  const gaps = (A: Box, B: Box) => ({
    h: Math.max(B.r.left - A.r.right, A.r.left - B.r.right),
    v: Math.max(B.r.top - A.r.bottom, A.r.top - B.r.bottom),
  });
  const related = (A: Box, B: Box) => A.el.contains(B.el) || B.el.contains(A.el);
  const joined = (A: Box, B: Box) => {
    const j = A.el.closest('[data-joined]');
    return !!j && j.contains(B.el);
  };

  if (!atBottom) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];
        if (related(A, B) || A.fixed !== B.fixed || joined(A, B)) continue;
        if (floatingButton(A.el) || floatingButton(B.el)) continue;
        const { h, v } = gaps(A, B);
        let kind = '';
        if (h < -1 && v < -1) kind = 'overlapping';
        else if (v >= -1 && v < 3 && h < -4) kind = 'touching, one above the other';
        else if (h >= -1 && h < 3 && v < -4) kind = 'touching, side by side';
        if (kind) out.push({ kind, a: describe(A.el), b: describe(B.el) });
      }
    }
    for (const A of boxes) {
      for (const T of texts) {
        if (related(A, T) || A.fixed !== T.fixed || joined(A, T) || floatingButton(A.el)) continue;
        const label = T.el.closest('label');
        if (label && label.contains(A.el)) continue;
        const { h, v } = gaps(A, T);
        if (v >= -1 && v < 4 && h < -4) out.push({ kind: 'crowding a line of text', a: describe(A.el), b: describe(T.el) });
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      const wide = Array.from(document.querySelectorAll('body *')).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > innerWidth + 1;
      });
      for (const el of wide) {
        if (Array.from(el.children).some((c) => wide.includes(c))) continue;
        const past = Math.round(el.getBoundingClientRect().right - innerWidth);
        out.push({ kind: 'wider than the screen', a: describe(el), b: `${past}px past the edge` });
      }
    }
    // Text through the side of its own box. Measured on the box's own text
    // and in-flow children, so a badge positioned to overhang a corner -- which
    // is the point of a badge -- is not counted as a spill.
    for (const B of boxes) {
      const cs = getComputedStyle(B.el);
      if (cs.overflowX !== 'visible' || B.el.clientWidth === 0) continue;
      const inner = B.r.right - parseFloat(cs.borderRightWidth);
      let furthest = 0;
      for (const n of Array.from(B.el.childNodes)) {
        if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim()) {
          const range = document.createRange();
          range.selectNodeContents(n);
          furthest = Math.max(furthest, range.getBoundingClientRect().right);
        } else if (n instanceof Element && getComputedStyle(n).position !== 'absolute') {
          furthest = Math.max(furthest, n.getBoundingClientRect().right);
        }
      }
      if (furthest - inner > 2) {
        out.push({ kind: 'spilling out of its box', a: describe(B.el), b: `${Math.round(furthest - inner)}px` });
      }
    }
  } else {
    for (const F of boxes.filter((b) => floatingButton(b.el))) {
      for (const el of Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]'))) {
        if (el === F.el || F.el.contains(el) || !shown(getComputedStyle(el))) continue;
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, F.r.right) - Math.max(r.left, F.r.left);
        const h = Math.min(r.bottom, F.r.bottom) - Math.max(r.top, F.r.top);
        if (w <= 2 || h <= 2) continue;
        const onTop = document.elementFromPoint(Math.max(r.left, F.r.left) + w / 2, Math.max(r.top, F.r.top) + h / 2);
        if (onTop && F.el.contains(onTop)) {
          out.push({ kind: 'under the floating button at the bottom of the page', a: describe(el), b: '' });
        }
      }
    }
  }
  return out;
}

for (const [setup, size, scale, css] of SETUPS) {
  for (const [name, path] of PAGES) {
    test(`${name} on a ${setup} has nothing touching that should not`, async ({ page }) => {
      await page.setViewportSize(size);
      if (scale !== 'normal') {
        await page.addInitScript((sc) => {
          const was = JSON.parse(localStorage.getItem('anagrimoire:v1') ?? '{}');
          localStorage.setItem('anagrimoire:v1', JSON.stringify({ ...was, textScale: sc }));
        }, scale);
      }
      await page.route('**/rest/v1/rpc/**', (route) => {
        const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(route.request().postData() ?? '{}');
        } catch {
          // a GET rpc carries nothing this file reads
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(reply(fn, args, path)),
        });
      });

      await page.goto(path);
      if (css) await page.addStyleTag({ content: css });
      await page.waitForLoadState('networkidle');
      // Settled, not merely loaded: a board that draws after the first paint
      // moves things, and a measurement taken mid-move is of a moment rather
      // than of a layout.
      const settle = () =>
        page.evaluate(async () => {
          let last = -1;
          let still = 0;
          for (let i = 0; i < 60 && still < 4; i++) {
            await new Promise((r) => setTimeout(r, 100));
            const h = document.documentElement.scrollHeight;
            still = h === last ? still + 1 : 0;
            last = h;
          }
        });
      await settle();
      const atTop = await page.evaluate(measure, false);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settle();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const atBottom = await page.evaluate(measure, true);

      // One line per distinct problem, so thirty identical keys read as one.
      const lines = [...new Set([...atTop, ...atBottom].map((f) => `${f.kind}: ${f.a} / ${f.b}`))];
      expect(lines, `${name} on a ${setup}`).toEqual([]);
    });
  }
}
