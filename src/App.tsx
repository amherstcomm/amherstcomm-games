import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { X, BookOpen, Grid3x3, Shuffle, Hexagon, Keyboard, Delete, Info, Square, Gamepad2, CornerDownLeft, LayoutGrid, Puzzle, BarChart3, UserRound, Scale, Settings, Home, Table2, KeyRound } from 'lucide-react';
import LearnMode, { type LearnModeHandle } from '@/LearnMode';
import type { Session } from '@supabase/supabase-js';
import StatsModal from '@/StatsModal';
import AccountModal from '@/AccountModal';
import { stashInvite } from '@/friends';
import { OskContext } from '@/MobileKeyInput';
import { KeySinkContext, type KeySink } from '@/keySink';
import { isOffered, offered, useUnavailable } from '@/availability';
import SettingsModal from '@/SettingsModal';
import KeyboardHelp from '@/KeyboardHelp';
import { PALETTES, PaletteContext, resolveTheme, TEXT_SCALES, THEME_MODES, useTheme, type Palette, type TextScale, type ThemeMode } from '@/theme';
import { PrefsContext } from '@/prefs';
import OnboardingCard from '@/OnboardingCard';
import { useModalA11y } from '@/useModalA11y';
import { Combine, Flag as FlagIcon, Radio, SlidersHorizontal } from 'lucide-react';
import BridgeGame, { type BridgeGameHandle } from '@/BridgeGame';
import GameMenu from '@/GameMenu';
import LadderIcon from '@/LadderIcon';
import { supabase } from '@/supabase';
import { autoSignIn } from '@/signIn';
import { SITE_NAME } from '@/brand';
import { useSetting } from '@/settings';
import { importBaselineOnce } from '@/stats';
import GuessGame, { type GuessGameHandle, type LetterState } from '@/GuessGame';
import HiveGame, { type HiveGameHandle } from '@/HiveGame';
import BoxGame, { type BoxGameHandle } from '@/BoxGame';
import ScrambleGame, { type ScrambleGameHandle } from '@/ScrambleGame';
import GridGame, { type GridGameHandle } from '@/GridGame';
import WeaveGame, { type WeaveGameHandle } from '@/WeaveGame';
import { DICTIONARIES, getAcceptPool, getDictionary, getDifficultyPool, getDisplayFilter } from '@/dictionaries';
import ConsentBanner from '@/ConsentBanner';
import { PrivacyPolicy, Terms } from '@/LegalDocs';
import { onDailyReport, requestDaily } from '@/dailyBus';
import { entryGame, entryRoute } from '@/routing/entry';
import {
  gameFeature, FEED_NAME, GAME_NAME } from '@/games';
import { useAddressBar, useNav } from '@/routing/useRouting';
import { routeOf, type Overlay } from '@/routing/nav';
import ReportMenu from '@/ReportMenu';
import { amOwner } from '@/reports';
import TicketView from '@/TicketView';
import ReportQueueView from '@/ReportQueueView';
import LiveSession from '@/LiveSession';
import SessionEditor from '@/SessionEditor';
import AdminSettings from '@/AdminSettings';
import JoinSession from '@/JoinSession';
import Scoreboard from '@/Scoreboard';
import { allows, myCapabilities } from '@/roles';
import { readLiveSessions } from '@/live';
import ReportActionView from '@/ReportActionView';

import HomeView from '@/HomeView';
import RouteLink from '@/RouteLink';
import SquaresGame, { type SquaresGameHandle } from '@/SquaresGame';
import CryptogramGame, { type CryptogramGameHandle } from '@/CryptogramGame';
import LadderGame, { type LadderGameHandle } from '@/LadderGame';
import {
  MODE_SLUG,
  modeOf,
  pathOf,
  type Route,
} from '@/routes';
import {
  difficulty as currentDifficulty,
  setDifficulty,
  difficultyMode,
  onDifficultyChange,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  type Difficulty,
} from '@/difficulty';
import { ALL_MODES, ALL_START_PAGES, ALL_VIEWS, asDifficulty, lengthChoices, visibleModes, visibleViews, type LengthRange, type StartPage, type View, loadState, saveState, type Mode, type NavKeys } from '@/storage';



// No label here. It lived in this table and in five other files, and disagreed:
// this one said 'Guess' for one game and 'Word Ladder' for another, mixing the
// short name and the full one inside a single column. @/games has both, and the
// call sites below pick by how much room they have.
const MODES: { id: Mode; blurb: string; description: string; playDescription: string }[] = [
  {
    id: 'pattern',
    blurb: 'Wordle, crosswords, hangman — clues about positions',
    description:
      "Lock in the letters you know, list the ones you've seen, and exclude the rest. We'll surface every dictionary word that fits.",
    playDescription:
      // no colour names — they change with the palette
      'Six guesses at a hidden word. Each one tells you which letters are in the right place and which are merely in there somewhere.',
  },
  {
    id: 'descramble',
    blurb: 'Scrabble, Jumble — what can these letters spell?',
    description:
      "Type the letters you're holding — with ? for blank tiles — and we'll show every word they can spell.",
    playDescription:
      'Three minutes, seven letters, as many words as you can find. Longer words score more.',
  },
  {
    id: 'bee',
    blurb: 'Seven letters, 4+ letter words, center letter required — Spelling Bee style',
    description:
      "Enter the hive's seven letters and we'll find every word that uses the center — pangrams first.",
    playDescription:
      'Every word uses the centre letter and at least four letters. Use all seven for a pangram.',
  },
  {
    id: 'grid',
    blurb: 'Boggle style — chain adjacent letters, each cell once',
    description:
      "Enter the grid letters and we'll find every word traceable through adjacent cells.",
    playDescription:
      'Three minutes to trace words through touching letters, each cell used once per word.',
  },
  {
    id: 'boxed',
    blurb: "Twelve letters on four sides, no two in a row from the same side — Letter Boxed style",
    description:
      "Enter the twelve letters, three per side. We'll find every legal word and the two-word solutions that use all twelve.",
    playDescription:
      'Use all twelve letters in a chain of words, never twice in a row from the same side.',
  },
  {
    id: 'squares',
    blurb: 'Fill the grid so every row and column is a word',
    description:
      "Type the letters you're sure of and we'll fill the rest, so every row and every column spells a word.",
    playDescription:
      'Fill the blanks so that every row and every column spells a word.',
  },
  {
    id: 'weave',
    blurb: 'Themed words tile the whole board — Strands style',
    description:
      'Play the themed tiling puzzle, or use Solve to list every traceable word on a Strands-style board.',
    playDescription:
      'Find the themed words that tile the whole board, plus the one that spans it corner to corner.',
  },
  {
    id: 'cryptogram',
    blurb: 'A passage in code — work out which letter is which',
    description:
      'Play the daily cipher. The solver is still being built: it has to offer the readings that fit rather than guess one, which is a different thing from the word solvers.',
    playDescription:
      'Every letter stands for another one, the same way throughout. Work out the passage.',
  },
  {
    id: 'ladder',
    blurb: 'Turn one word into another, a letter at a time',
    description:
      'Play the daily ladder, or use Solve to find the shortest route between any two words of the same length.',
    playDescription:
      'Change one letter at a time, and every rung has to be a word. Get from the first to the last in par.',
  },
  {
    id: 'bridge',
    blurb: 'Find the word that joins both sides',
    description:
      'Play the daily five, or use Solve to find every word that joins any two others.',
    playDescription:
      'Five prompts, and the answer is the word that joins both sides — SNOW · BALL · ROOM. Hints turn over a length or a letter, and you get three, one or none.',
  },
];

const MODE_ICONS: Record<Mode, typeof Grid3x3> = {
  pattern: Grid3x3,
  descramble: Shuffle,
  bee: Hexagon,
  grid: LayoutGrid,
  boxed: Square,
  weave: Puzzle,
  squares: Table2,
  cryptogram: KeyRound,
  ladder: LadderIcon,
  bridge: Combine,
};








const initial = loadState();

// Arriving at "/" with a start page set to one particular game is the same
// kind of instruction a link gives, so it travels the same path. 'home' stays
// on the front page; 'last' falls through to whatever was stored.
const startTarget =
  entryRoute().kind === 'home' &&
  initial.startPage !== 'home' &&
  initial.startPage !== 'last'
    ? ({ view: 'play', slug: MODE_SLUG[initial.startPage] } as const)
    : null;

// A link names both a game and a tab. It only overrides the game it names —
// every other game keeps whatever the visitor last had open.
const entry = entryGame() ?? startTarget;
const linkMode = entry ? modeOf(entry.slug) : null;
// Panels and legal documents are addresses too, so arriving at one opens it.

// An invite link stashes its code before anything else happens: accepting may
// need a sign-in first, and OAuth leaves the page entirely — the stash is what
// survives the round trip. The account panel picks it up from there.
if (entryRoute().kind === 'friend') stashInvite((entryRoute() as { code: string }).code);

function App() {
  // The event this run is for. A setting, so it changes without a rebuild;
  // the build value is what paints before the database answers.
  const subtitle = useSetting('subtitle');
  const announcement = useSetting('announcement');
  const [mode, setMode] = useState<Mode>(linkMode ?? initial.mode);
  const [dictionaries, setDictionaries] = useState(initial.dictionaries);
  // The word length Guess is playing. The only one of these left: every other
  // input here -- the known letters, the rack, the hive's seven, the box's
  // twelve, the grids -- was something you typed *into a solver*, and the
  // stored copies are ignored from this version on rather than migrated.
  const [length, setLength] = useState(initial.pattern.length);







  // The board-trace hooks went with the solvers: hovering a result to draw it
  // back on the board was a results-panel gesture, and there is no results
  // panel. The games trace their own boards where they need to.

  const [commonSet, setCommonSet] = useState<Set<string> | null>(null);

  // common-word set used to rank recommended Letter Boxed solutions
  useEffect(() => {
    if (mode === 'boxed' && !commonSet) {
      getDictionary('common').then((ws) => setCommonSet(new Set(ws)));
    }
  }, [mode, commonSet]);
  const [kbOpen, setKbOpen] = useState(initial.keyboard);
  // "/" is a page now, not a synonym for wherever you left off
  // Where the app is. The nine booleans, the ladder, the three refs and both
  // effects live in src/routing/useRouting.ts now — this is the seam: page and
  // overlay identity there, which game and which view here.
  const routing = useNav(entryRoute(), initial.startPage === 'home');
  const { nav, open: openOverlay, close: closeOverlay, overlayLink, pageLink } = routing;

  function overlay<K extends Overlay['kind']>(kind: K): Extract<Overlay, { kind: K }> | undefined {
    return nav.overlays.find((o): o is Extract<Overlay, { kind: K }> => o.kind === kind);
  }

  const atHome = nav.page.kind === 'home';
  // Full pages: they replace the board rather than sitting over it. One
  // conditional, per the note where this is rendered — a live session belongs
  // here for the same reason a report does, and for one more: the presenter's
  // screen goes on a projector, and a word game behind it is the quiz spoiled.
  const reportPage: Route | null =
    nav.page.kind === 'ticket' ||
    nav.page.kind === 'reportAction' ||
    nav.page.kind === 'reportQueue' ||
    nav.page.kind === 'live' ||
    nav.page.kind === 'sessions' ||
    nav.page.kind === 'admin' ||
    nav.page.kind === 'join' ||
    nav.page.kind === 'scores'
      ? nav.page
      : null;

  /** Pages meant to be looked at from across a room rather than read. The
   *  presenter's half of a live session and the scoreboard; the participant's
   *  half is a phone in a hand and stays narrow. */
  const forTheRoom =
    (nav.page.kind === 'live' && nav.page.host) || nav.page.kind === 'scores';

  // `some`, not `top` — the consent banner opens Legal over an open Settings,
  // and both modals stay mounted. The address is the top; what renders is
  // whatever is anywhere on the stack.
  const legalOpen = !!overlay('legal');
  const legalTab = overlay('legal')?.doc ?? nav.last.legal;
  const statsOpen = !!overlay('stats');
  const statsTab = overlay('stats')?.tab ?? nav.last.stats;
  const settingsOpen = !!overlay('settings');
  const settingsTab = overlay('settings')?.tab ?? nav.last.settings;
  const accountOpen = !!overlay('account');
  const accountTab = overlay('account')?.tab ?? nav.last.account;
  const aboutOpen = overlay('panel')?.panel === 'about';
  const keysOpen = overlay('panel')?.panel === 'keys';

  const setAtHome = (v: boolean) =>
    routing.dispatch({ type: 'page', page: v ? { kind: 'home' } : { kind: 'game' } });

  const [startPage, setStartPage] = useState(initial.startPage);
  // Whether to draw the queue link at all. False for everyone signed out and
  // for every ordinary account, and the server says so — this only decides a
  // link, and the RPCs behind it check again regardless.
  const [owner, setOwner] = useState(false);
  // Same idea for the sessions link, and read from the same place the SQL
  // reads: can('games.setup'). A capability rather than a role, so moving
  // which role may set games up is one row in `capabilities` and not a
  // redeploy.
  const [canSetUp, setCanSetUp] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  // Whether anything is running, so the way in is on every page rather than
  // only for people who were sent a link. Not a poll — see the note in
  // JoinSession; this refetches when the tab is focused, which is when somebody
  // has just been told it is starting.
  const [liveNow, setLiveNow] = useState(0);
  const [learnMode, setLearnMode] = useState(entryGame()?.view === 'learn');
  const [theme, setTheme] = useState<ThemeMode>(initial.theme);
  const [palette, setPalette] = useState<Palette>(initial.palette);

  const [navKeys, setNavKeys] = useState<NavKeys>(initial.navKeys);
  const [textScale, setTextScale] = useState<TextScale>(initial.textScale);
  const [hiddenModes, setHiddenModes] = useState<Mode[]>(initial.hiddenModes);
  const [hiddenViews, setHiddenViews] = useState<View[]>(initial.hiddenViews);
  const [lengthRange, setLengthRange] = useState<LengthRange>(initial.lengthRange);
  const [practiceAllowed, setPracticeAllowed] = useState(initial.practiceAllowed);
  const [highlightMatches, setHighlightMatches] = useState(initial.highlightMatches);
  const [solverDictionary, setSolverDictionary] = useState(initial.solverDictionary);
  const [wordFilter, setWordFilter] = useState(initial.wordFilter);
  // the display-filter predicate, shared by Grid's missed-words list; the
  // solver filters its own list where it loads
  const [showWord, setShowWord] = useState<(w: string) => boolean>(() => () => true);
  useEffect(() => {
    let alive = true;
    getDisplayFilter(wordFilter).then((f) => alive && setShowWord(() => f));
    return () => {
      alive = false;
    };
  }, [wordFilter]);
  const [onboarded, setOnboarded] = useState(initial.onboarded);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!session) {
      setOwner(false);
      setCanSetUp(false);
      setCanAdmin(false);
      setLiveNow(0);
      return;
    }
    let alive = true;
    amOwner().then((yes) => alive && setOwner(yes));
    myCapabilities().then((held) => {
      if (!alive) return;
      setCanSetUp(allows(held, 'games.setup'));
      setCanAdmin(allows(held, 'site.settings'));
    });
    const count = () => readLiveSessions().then((live) => alive && setLiveNow(live.length));
    void count();
    window.addEventListener('focus', count);
    return () => {
      alive = false;
      window.removeEventListener('focus', count);
    };
  }, [session]);

  useTheme(theme, palette, textScale);

  // track the auth session when Supabase is configured
  //
  // The auto sign-in hangs off getSession rather than off the session state,
  // because it has to run exactly once on the answer to "is anyone signed in",
  // and not again on every later change to it. Signing out is a later change.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void autoSignIn(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // on sign-in, snapshot this browser's pre-account stats once as the baseline
  useEffect(() => {
    if (session) void importBaselineOnce();
  }, [session]);

  // appearance settings follow the account: pull on sign-in (and whenever the
  // tab comes back to the foreground, so a change made on another device
  // lands here), then push edits
  // State, not a ref: the push effect is gated on this, and a ref changing
  // doesn't re-run an effect. As a ref, the first pull flipped it silently and
  // nothing was ever written back unless the player happened to change a
  // setting afterwards — so a value that was already true locally at load,
  // like onboarded, never reached the account at all.
  const [settingsPulled, setSettingsPulled] = useState(false);
  const pushPending = useRef(false);

  const pullSettings = useCallback(async () => {
    // don't clobber an edit that hasn't been written yet
    if (!supabase || !session || pushPending.current) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) {
      console.warn('settings pull failed:', error.message);
      return;
    }
    const s = data?.settings as
      | {
          theme?: ThemeMode;
          palette?: Palette;
          navKeys?: NavKeys;
          textScale?: TextScale;
          hiddenModes?: Mode[];
          hiddenViews?: View[];
          lengthRange?: LengthRange;
          practiceAllowed?: boolean;
          highlightMatches?: boolean;
          solverDictionary?: string;
          wordFilter?: string;
          startPage?: StartPage;
          onboarded?: boolean;
        }
      | null;
    if (s?.theme && THEME_MODES.includes(s.theme)) setTheme(s.theme);
    if (s?.palette && PALETTES.includes(s.palette)) setPalette(s.palette);
    if (s?.navKeys === 'numpad' || s?.navKeys === 'wasd') setNavKeys(s.navKeys);
    if (s?.textScale && TEXT_SCALES.includes(s.textScale)) setTextScale(s.textScale);
    if (Array.isArray(s?.hiddenModes)) setHiddenModes(s.hiddenModes.filter((m) => ALL_MODES.includes(m)));
    if (Array.isArray(s?.hiddenViews)) setHiddenViews(s.hiddenViews.filter((v) => ALL_VIEWS.includes(v)));
    if (s?.lengthRange) setLengthRange(s.lengthRange);
    if (typeof s?.practiceAllowed === 'boolean') setPracticeAllowed(s.practiceAllowed);
    if (typeof s?.highlightMatches === 'boolean') setHighlightMatches(s.highlightMatches);
    if (s?.solverDictionary)
      setSolverDictionary(asDifficulty(s.solverDictionary) ?? 'per-game');
    if (s?.wordFilter === 'none' || s?.wordFilter === 'strong' || s?.wordFilter === 'all')
      setWordFilter(s.wordFilter);
    if (s?.startPage && ALL_START_PAGES.includes(s.startPage)) setStartPage(s.startPage);
    if (s?.onboarded) setOnboarded(true);
    setSettingsPulled(true);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setSettingsPulled(false);
      return;
    }
    void pullSettings();
  }, [session, pullSettings]);

  useEffect(() => {
    if (!supabase || !session) return;
    const onWake = () => {
      if (document.visibilityState === 'visible') void pullSettings();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [session, pullSettings]);

  useEffect(() => {
    if (!supabase || !session || !settingsPulled) return;
    pushPending.current = true;
    const id = window.setTimeout(async () => {
      const settings = { theme, palette, navKeys, textScale, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, solverDictionary, wordFilter, startPage, onboarded };
      // update first — it needs only the update policy, which every install
      // has. `select` reveals whether a row actually matched.
      const { data, error } = await supabase!
        .from('profiles')
        .update({ settings })
        .eq('id', session.user.id)
        .select('id');
      if (error) {
        console.warn('settings sync failed:', error.message);
      } else if (!data?.length) {
        // no profile row yet (the signup trigger never fired) — create one
        const { error: insertError } = await supabase!
          .from('profiles')
          .insert({ id: session.user.id, settings });
        if (insertError) {
          console.warn(
            'settings sync failed: no profile row, and creating one was refused —',
            insertError.message
          );
        }
      }
      pushPending.current = false;
    }, 500);
    return () => {
      window.clearTimeout(id);
      pushPending.current = false;
    };
  }, [session, settingsPulled, theme, palette, navKeys, textScale, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, solverDictionary, wordFilter, startPage, onboarded]);

  // surface auth errors that come back in the redirect URL (expired or
  // already-used magic links land here with no other visible sign)
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const desc = params.get('error_description') || params.get('error');
    if (desc) {
      setAuthNotice(desc);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});
  // A board outside the daily set — a word game inside a session — claiming the
  // on-screen keyboard while it is on screen. Null the rest of the time, which
  // is every other page, and then the keyboard behaves exactly as it did.
  const [keySink, setKeySink] = useState<KeySink | null>(null);
  const registerKeySink = useCallback((sink: KeySink | null) => setKeySink(sink), []);
  const [commonWordsArr, setCommonWordsArr] = useState<string[] | null>(null);
  const [fullWordsArr, setFullWordsArr] = useState<string[] | null>(null);
  const [standardWordsArr, setStandardWordsArr] = useState<string[] | null>(null);

  const gameRef = useRef<GuessGameHandle>(null);
  const hiveRef = useRef<HiveGameHandle>(null);
  const boxRef = useRef<BoxGameHandle>(null);
  const scrambleRef = useRef<ScrambleGameHandle>(null);
  const gridRef = useRef<GridGameHandle>(null);
  const learnRef = useRef<LearnModeHandle>(null);
  const weaveRef = useRef<WeaveGameHandle>(null);
  const squaresRef = useRef<SquaresGameHandle>(null);
  const cryptogramRef = useRef<CryptogramGameHandle>(null);
  const ladderRef = useRef<LadderGameHandle>(null);
  const bridgeRef = useRef<BridgeGameHandle>(null);

  // The switch and the games both read the same stored value; this only
  // mirrors it so the pressed state re-renders.
  const [level, setLevel] = useState(currentDifficulty);
  useEffect(() => onDifficultyChange(() => setLevel(currentDifficulty())), []);

  // Practice puzzles are built in the browser, so the words a difficulty means
  // have to be here too — the same bands the daily generator draws from.
  const [practiceWordsArr, setPracticeWordsArr] = useState<string[] | null>(null);
  // What this difficulty accepts, one band wider than it sets from.
  const [acceptWordsArr, setAcceptWordsArr] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    setPracticeWordsArr(null);
    getDifficultyPool(level).then((ws) => alive && setPracticeWordsArr(ws));
    getAcceptPool(level).then((ws) => alive && setAcceptWordsArr(ws));
    return () => {
      alive = false;
    };
  }, [level]);

  const patternPlayActive = mode === 'pattern' && !learnMode;
  const beePlayActive = mode === 'bee' && !learnMode;
  const boxedPlayActive = mode === 'boxed' && !learnMode;
  const descramblePlayActive = mode === 'descramble' && !learnMode;
  const gridPlayActive = mode === 'grid' && !learnMode;
  const weavePlayActive = mode === 'weave' && !learnMode;
  const squaresPlayActive = mode === 'squares' && !learnMode;
  const cryptogramPlayActive = mode === 'cryptogram' && !learnMode;
  const ladderPlayActive = mode === 'ladder' && !learnMode;
  const bridgePlayActive = mode === 'bridge' && !learnMode;
  const playActive =
    patternPlayActive || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive || squaresPlayActive || cryptogramPlayActive || ladderPlayActive || bridgePlayActive;



  // the guess game validates against the full dictionary and picks practice
  // words from the common one; hive, box, scramble, grid play -- and the Learn
  // demos -- use standard.
  //
  // Three branches here loaded a list for a solver: the cryptogram's candidate
  // ranking, the ladder's search and the bridge's membership check. They went
  // with the solvers, and so did the word-rank fetch, which existed only to
  // order a candidate list nobody is shown.
  useEffect(() => {
    if (!playActive && !learnMode) return;
    if (!commonWordsArr) getDictionary('common').then(setCommonWordsArr);
    if (patternPlayActive && !fullWordsArr) getDictionary('full').then(setFullWordsArr);
    if (
      (learnMode || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive || squaresPlayActive) &&
      !standardWordsArr
    ) {
      getDictionary('standard').then(setStandardWordsArr);
    }
  }, [playActive, learnMode, mode, patternPlayActive, beePlayActive, boxedPlayActive, descramblePlayActive, gridPlayActive, weavePlayActive, squaresPlayActive, commonWordsArr, fullWordsArr, standardWordsArr]);

  const aboutRef = useRef<HTMLDivElement>(null);
  const legalRef = useRef<HTMLDivElement>(null);
  const closeAbout = closeOverlay;
  const closeLegal = closeOverlay;
  useModalA11y(aboutRef, closeAbout, aboutOpen);
  useModalA11y(legalRef, closeLegal, legalOpen);

  // the input the on-screen keyboard types into
  const lastFocused = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) lastFocused.current = e.target;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // 'per-game' keeps each solver's own pick; anything else is the whole site's
  const dictionaryId = solverDictionary === 'per-game' ? dictionaries[mode] : solverDictionary;
  const setDictionaryId = (id: Difficulty) =>
    setDictionaries((prev) => ({ ...prev, [mode]: id }));


  // A shared link names a game and a tab deliberately, so it outranks hiding
  // for this visit: dropping someone on the wrong page because of a setting
  // they made months ago is worse than showing them one game they'd switched
  // off. It doesn't unhide anything — the setting is untouched.
  // Two layers, and they are not the same kind of thing. `hidden*` is what this
  // person chose not to see and can choose again; `unavailable` is what the
  // deployment is not offering, which a preference cannot overrule — so the
  // link-mode exception below, which drags a hidden game back for the length of
  // one visit, does not apply to it.
  const unavailable = useUnavailable();
  // Sessions are not a game, so they are switched by their own key. A
  // deployment may want the quiz and nothing else, or the games and no quiz.
  const sessionsOn = !unavailable.includes('site:sessions');
  /** The games still on offer, by mode — the switches are named by slug. */
  const offeredModes = (off: string[]) =>
    ALL_MODES.filter((m) => !off.includes(gameFeature(MODE_SLUG[m])));

  // A game switched off is gone from the menu *and* refused at its own address.
  // Hiding it from the menu alone would leave it playable to anybody who had
  // bookmarked it, which is not what switching a game off means — and during an
  // event the whole point is that a game not ready yet is not reachable.
  //
  // The first game still on is where it lands, rather than a dead end: whoever
  // followed the link wanted to play something.
  useEffect(() => {
    // Keyed by *slug*, not by mode. They are different words for eight of the
    // ten games — hive is `bee` internally, guess is `pattern`, scramble is
    // `descramble` — and the slug is the one the address bar and the admin page
    // both use, so it is the one the switch is named after.
    if (isOffered(gameFeature(MODE_SLUG[mode]) as `game:${string}`)) return;
    const first = offeredModes(unavailable)[0];
    if (first) setMode(first);
  }, [mode, unavailable]);

  const shownModes = useMemo(() => {
    const vis = visibleModes(hiddenModes);
    return offeredModes(unavailable).filter((m) => vis.includes(m) || m === linkMode);
  }, [hiddenModes, unavailable]);

  const shownViews = useMemo(() => {
    const vis = visibleViews(hiddenViews);
    return offered(unavailable, 'view', ALL_VIEWS).filter(
      (v) => vis.includes(v) || v === entryGame()?.view
    );
  }, [hiddenViews, unavailable]);


  const prefs = useMemo(
    () => ({ practiceAllowed, highlightMatches }),
    [practiceAllowed, highlightMatches]
  );

  // Two views left, so the play flags no longer choose between them. They are
  // still read and written — the stored ones are what step 2 of this removal
  // will clear out with the solver JSX they used to switch.
  const currentView: View = learnMode ? 'learn' : 'play';

  function goToView(view: View) {
    if (view === 'learn') {
      setLearnMode(true);
      return;
    }
    setLearnMode(false);
  }

  // Which board each game has open. The games own this — they persist it and
  // they draw the toggle — so they report it up rather than being told. The
  // handle is only for the other direction, when an address asks for the board
  // the player isn't currently on.
  const [dailyByMode, setDailyByMode] = useState<Record<Mode, boolean>>(() => {
    const seed = Object.fromEntries(ALL_MODES.map((m) => [m, true])) as Record<Mode, boolean>;
    const g = entryGame();
    if (g?.view === 'play') seed[modeOf(g.slug)] = g.daily;
    return seed;
  });

  // Three boards a day, and you may play all of them — so the switch belongs
  // beside the board rather than buried in settings.
  //
  // On practice as much as on the daily. Practice is the same board generated
  // on the fly and not recorded, so it needs the same control — and since the
  // size pickers are gone, this is the only way to choose a shape there.
  //
  // Grid is here too now: it varies by board size, 4x4 then 5x5. Not shown
  // when someone has asked to be left with one puzzle.
  // The difficulties this deployment is offering, which is not the same
  // question as which one you are playing.
  //
  // The admin portal has had a switch per difficulty since availability went
  // in, and nothing read it: the switch saved, the picker went on drawing all
  // three, and pressing one dealt a board the deployment had turned off. The
  // module's own comment names this failure -- "a switch that saves and does
  // nothing" -- because site:sessions did it first.
  const offeredDifficulties = useMemo(
    () => offered(unavailable, 'difficulty', DIFFICULTIES),
    [unavailable]
  );

  // Nothing to choose between is not a choice. One difficulty draws no picker
  // at all, the same way the Play/Learn switch disappears at one tab -- and
  // none offered is a deployment that has switched the lot off, where drawing
  // an empty box would be the interface arguing with it.
  const showDifficultySwitch =
    playActive && difficultyMode() === 'all' && offeredDifficulties.length > 1;

  // Somebody left on a difficulty that has since been switched off is moved to
  // one that exists, rather than being left on a board nobody can deal. Same
  // shape as the redirect that carries a hidden game's address back to a game
  // this deployment has.
  useEffect(() => {
    if (offeredDifficulties.length === 0) return;
    if (!offeredDifficulties.includes(level)) setDifficulty(offeredDifficulties[0]);
  }, [offeredDifficulties, level]);

  // The date rides along so the report link can name the board a player is
  // actually looking at. Empty for practice, which is nobody's problem but the
  // dealer's — it was never published and there is nothing on the server to
  // look up.
  const [dateByMode, setDateByMode] = useState<Partial<Record<Mode, string>>>({});
  // The practice board each game is showing, for the one report whose evidence
  // has to come from here — see the note in the listener below.
  const [boardByMode, setBoardByMode] = useState<Partial<Record<Mode, unknown>>>({});

  useEffect(
    () =>
      onDailyReport((m, daily, date, board) => {
        setDailyByMode((prev) => (prev[m] === daily ? prev : { ...prev, [m]: daily }));
        setDateByMode((prev) => (prev[m] === date ? prev : { ...prev, [m]: date }));
        // The practice board on screen, so it can be reported at all: it was
        // never published, so the server has nothing to look up and the only
        // evidence there can be is the board itself. Undefined on a daily,
        // which is reported by naming it instead.
        setBoardByMode((prev) => (prev[m] === board ? prev : { ...prev, [m]: board }));
      }),
    []
  );

  // Where the app is, written as an address. `routeOf` is "whatever is on top,
  // or the page" — the ladder this replaced had a rung per kind and /reports
  // was never given one, so the page rendered and the address reverted to the
  // game underneath.
  //
  // `daily` only means something under /play: pathOf drops it for solve and
  // learn, so emitting it there produced a Route that could not round-trip
  // through its own address.
  const currentRoute: Route = useMemo(
    () =>
      routeOf(nav, {
        slug: MODE_SLUG[mode],
        view: currentView,
        daily: currentView === 'play' && dailyByMode[mode],
      }),
    [nav, mode, currentView, dailyByMode]
  );

  // Back and Forward reach both halves: the nav reducer, and the game state
  // that only App holds.
  useAddressBar(
    currentRoute,
    useCallback(
      (r: Route) => {
        if (r.kind === 'friend') stashInvite(r.code);
        routing.dispatch({ type: 'apply', route: r });
        if (r.kind === 'game') {
          const m = modeOf(r.slug);
          setMode(m);
          if (r.view === 'learn') {
            setLearnMode(true);
          } else {
            setLearnMode(false);
            if (r.view === 'play') requestDaily(m, r.daily);
          }
        }
      },
      [routing.dispatch]
    )
  );

  const shownLengths = useMemo(() => lengthChoices(lengthRange), [lengthRange]);

  // hiding the game or tab you're standing on shouldn't leave you nowhere
  //
  // Unless there is nowhere: a deployment may switch every game off and run
  // sessions alone, which is a real thing to want during an event. Then `mode`
  // stays whatever it was and simply never renders — setMode(undefined) is what
  // used to happen, and it took the whole page down.
  useEffect(() => {
    if (shownModes.length === 0) return;
    if (!shownModes.includes(mode)) setMode(shownModes[0]);
  }, [shownModes, mode]);

  // narrowing the range around the length you're on moves you to the nearest
  // one still offered, rather than leaving nothing selected
  useEffect(() => {
    if (length < lengthRange.min) setLength(lengthRange.min);
    else if (length > lengthRange.max) setLength(lengthRange.max);
  }, [lengthRange, length]);

  useEffect(() => {
    if (!shownViews.includes(currentView)) goToView(shownViews[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownViews, currentView, mode]);

  // persist tool, per-tool dictionary, and last inputs
  useEffect(() => {
    saveState({
      mode,
      dictionaries,
      keyboard: kbOpen,
      theme,
      palette,
      textScale,
      navKeys,
      hiddenModes,
      hiddenViews,
      lengthRange,
      practiceAllowed,
      highlightMatches,
      solverDictionary,
      wordFilter,
      startPage,
      onboarded,
      // The word length Guess is playing, and nothing else about a board: what
      // used to sit here was solver input, and an older browser's copy of it is
      // left where it is rather than migrated.
      pattern: { length },
    });
  }, [mode, dictionaries, kbOpen, theme, palette, textScale, navKeys, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, solverDictionary, wordFilter, startPage, onboarded, length]);


  // Everything the solvers computed stood here: the rack's letters, the box's
  // four sides, the search itself, and the chain index that turned its answers
  // into Letter Boxed solutions. The engines it called are still in
  // src/solvers.ts, where the games and the Learn demos use them.

  const KEY_TARGETS: Record<Mode, { current: { pressKey: (k: string) => void } | null }> = {
    pattern: gameRef,
    bee: hiveRef,
    boxed: boxRef,
    descramble: scrambleRef,
    grid: gridRef,
    weave: weaveRef,
    squares: squaresRef,
    cryptogram: cryptogramRef,
    ladder: ladderRef,
    bridge: bridgeRef,
  };

  // The on-screen keyboard, driven into whichever board is on screen.
  //
  // It had a second half: with no board mounted a solver was up, and its
  // inputs are ordinary DOM, so the key was pushed into the last focused input
  // by hand. There is no solver now, so no board means a game still loading,
  // and a keypress into that is a keypress into nothing.
  function pressKey(k: string) {
    if (learnMode) {
      learnRef.current?.pressKey(k);
      return;
    }
    KEY_TARGETS[mode].current?.pressKey(k);
  }

  // The empty-state ladder and the featured chips went with the results panel
  // they were written for.


  return (
    <PaletteContext.Provider value={palette}>
    <PrefsContext.Provider value={prefs}>
    <OskContext.Provider value={kbOpen}>
    <KeySinkContext.Provider value={registerKeySink}>
    <div className="min-h-screen bg-slate-950 text-white relative overflow-x-clip">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]" />

      {/* keyboard users can jump the mode tabs and land on the puzzle */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-amber-400 focus:text-ink focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Top nav bar — gone entirely with one game. A bar holding a single
          tab is a switch with one position, and dropping to just the wordmark
          would only print the site's name directly above the h1 that already
          says it. The page header below carries the identity instead. */}
      {/* Not on the screen pointed at a room. A row of ten word games above a
          trivia question is chrome, and on a projector it is also a way out of
          the session sitting in front of forty people. It was a compact menu
          here before the page was widened; widening it made the full row
          appear, which is my doing rather than something to leave. The footer
          still has Home, so the way back out has not gone. */}
      {shownModes.length > 1 && !forTheRoom && (
      <nav
        aria-label="Game modes"
        className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10"
      >
        {/* Nine tabs do not fit on one row at this width: the horizontal layout
            wanted 888px inside a 768px bar, so it never fit at any viewport —
            it squeezed, and "Word Ladder" ran out of its column on a phone.
            Wrapping to two and three rows fixed the overflow and cost a third
            of a phone screen, which is worse: this bar is sticky, so that is a
            third of every screen, on every page, forever.

            So the bar stops being a row of tabs when it cannot be one. Below
            lg it is the game you are in plus a menu holding the rest — one
            row, one height, however many games there are. The bar runs a
            little wider than the content at lg and above, which is the width
            at which nine full-size labels genuinely fit. */}
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-2 sm:px-5 flex items-center justify-center">
          <div className="hidden lg:grid flex-1 gap-1 py-1.5"
            style={{ gridTemplateColumns: `repeat(${shownModes.length}, minmax(0, 1fr))` }}
          >
            {MODES.filter((m) => shownModes.includes(m.id)).map((m) => {
              const Icon = MODE_ICONS[m.id];
              return (
                <RouteLink
                  key={m.id}
                  to={pathOf({
                    kind: 'game',
                    view: currentView,
                    slug: MODE_SLUG[m.id],
                    daily: dailyByMode[m.id],
                  })}
                  onGo={() => {
                    // picking a game from the nav is also how you leave home
                    setAtHome(false);
                    setMode(m.id);
                  }}
                  title={m.blurb}
                  className={`flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg whitespace-nowrap text-xs font-semibold transition-colors
                    ${!atHome && mode === m.id
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{GAME_NAME[m.id].short}</span>
                </RouteLink>
              );
            })}
          </div>

          {/* the same nine games, one row high */}
          <div className="lg:hidden flex-1 py-1.5">
            <GameMenu
              modes={MODES.filter((m) => shownModes.includes(m.id))}
              icons={MODE_ICONS}
              current={atHome ? null : mode}
              href={(id) =>
                pathOf({
                  kind: 'game',
                  view: currentView,
                  slug: MODE_SLUG[id],
                  daily: dailyByMode[id],
                })
              }
              onGo={(id) => {
                setAtHome(false);
                setMode(id);
              }}
            />
          </div>
        </div>
      </nav>
      )}

      {/* Two widths. A board and a page of prose are read at arm's length and
          want a measure; the presenter's screen and the scoreboard are pointed
          at a room and want the wall. Without this the panel's own max-width
          was moot — main clamped it to 728px and the QR could not be made
          bigger than the column it sat in. */}
      <main
        id="main"
        tabIndex={-1}
        className={`relative mx-auto px-5 py-10 sm:py-16 outline-none ${
          forTheRoom ? 'max-w-6xl' : 'max-w-3xl'
        } ${kbOpen ? 'pb-64 sm:pb-64' : ''}`}
      >
        {/* header */}
        <header className="text-center mb-8">
          {/* The wordmark is a lockup rather than an image file: the mark is
              the only part that has to be drawn, and the name is real text, so
              it themes itself, follows the text-size setting, and can't render
              in the wrong font on someone else's machine. The mark is alt=""
              because the text beside it already names the heading.
              Dimensions on the tag so it can't shove the page down as it
              loads. */}
          <h1 className="mb-4 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1">
            {/* The mark is the company swish, drawn transparent — so the
                rounded tile and drop shadow that framed the old filled logo
                are gone. Framing a glyph that has no edges only draws a box
                around empty corners. */}
            <img
              src="/mark.svg"
              alt=""
              width={500}
              height={500}
              className="w-12 h-12 sm:w-16 sm:h-16 shrink-0"
            />
            {/* bg-clip-text paints inside the element's box, so a descender
                needs padding below the line or it gets sliced off. The
                matching negative margin keeps that padding out of the layout,
                so the name still sits centred against the mark. */}
            <span className="pb-[0.4em] -mb-[0.4em] text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent">
              {SITE_NAME}
            </span>
          </h1>
          {/* The event this run is for, when there is one. Empty is the
              ordinary state and renders nothing rather than an empty line —
              which is why this is a guard and not a string that defaults to
              something cheerful. */}
          {subtitle && (
            <p className="-mt-2 mb-4 text-sm sm:text-base font-semibold uppercase tracking-[0.18em] text-accent">
              {subtitle}
            </p>
          )}
          {/* A notice the site can put up and take down. Under the subtitle
              because it is the more perishable of the two — the subtitle names
              the month, this names the afternoon — and it renders nothing at
              all when there is none rather than reserving the space. */}
          {announcement && (
            <p className="mb-4 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-slate-200">
              {announcement}
            </p>
          )}
          {/* The strapline describes whichever game is loaded behind all this,
              which on a report page is a game nobody asked for — a ticket
              opened from an email introduced itself as "Play the themed tiling
              puzzle". The wordmark stays, since it is the way home. */}
          {!atHome && !reportPage && (
            <p className="text-slate-400 max-w-md mx-auto text-sm sm:text-base">
              {MODES.find((m) => m.id === mode)?.playDescription}
            </p>
          )}
        </header>

        {/* A report page is the whole page. Gating the games and the home
            view left every other section standing — the Solve/Play/Learn
            switch, the difficulty tabs, the dictionary and length pickers —
            so a reader arriving from an email got a report wearing the
            chrome of a word game. One conditional rather than a dozen,
            because a dozen is a list somebody will add the thirteenth to.
            The header and footer stay: they are the way back out. */}
        {reportPage ? (
          <>
          {reportPage?.kind === 'ticket' && <TicketView ticket={reportPage.ticket} />}
          {reportPage?.kind === 'reportQueue' && <ReportQueueView />}
          {/* Switched off means refused at the address too, the same as a
              game. Hiding the link alone would leave a session playable to
              whoever had the QR code from last week, which is the opposite of
              what switching sessions off means. */}
          {!sessionsOn &&
            (reportPage?.kind === 'live' ||
              reportPage?.kind === 'sessions' ||
              reportPage?.kind === 'join' ||
              reportPage?.kind === 'scores') && (
              <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">
                Sessions are switched off at the moment.
              </p>
            )}

          {sessionsOn && reportPage?.kind === 'live' && (
            <LiveSession session={reportPage.session} host={reportPage.host} />
          )}
          {sessionsOn && reportPage?.kind === 'sessions' && <SessionEditor session={reportPage.session} />}
          {reportPage?.kind === 'admin' && <AdminSettings
              tab={reportPage.tab}
              tabLink={(tab) => pageLink({ kind: 'admin', tab })}
            />}
          {sessionsOn && reportPage?.kind === 'join' && <JoinSession code={reportPage.code} />}
          {sessionsOn && reportPage?.kind === 'scores' && <Scoreboard session={reportPage.session} />}
          {reportPage?.kind === 'reportAction' && (
            <ReportActionView
              id={reportPage.id}
              token={reportPage.token}
              action={reportPage.action}
            />
          )}

          </>
        ) : (
          <>
          {atHome && (
            <HomeView
              modes={shownModes}
              onOpen={(m) => {
                setAtHome(false);
                setMode(m);
                // not goToView: that reads `mode`, which is still the game
                // we're leaving until this render commits
                setLearnMode(false);
                requestDaily(m, true);
              }}
              onBoards={() => {
                openOverlay({ kind: 'stats', tab: 'boards' });
              }}
            />
          )}

          {!atHome && (
          <>
          {/* Only where there's a Learn tab to point at, and only until it's
              been answered either way. `currentView` keeps it off the Learn tab
              itself, where it would be telling someone about the page they're
              already reading. */}
          {!onboarded &&
            // signed in, the account gets the deciding vote — wait for it rather
            // than flashing "new here?" at someone who answered on another device
            (!session || settingsPulled) &&
            shownViews.includes('learn') &&
            currentView !== 'learn' && (
            <OnboardingCard
              game={GAME_NAME[mode].full}
              onLearn={() => {
                goToView('learn');
                setOnboarded(true);
              }}
              onDismiss={() => setOnboarded(true)}
            />
          )}

          {/* solve / play / learn toggle — gone entirely when only one is left,
              since a switch with one position is just clutter. Hiding Solve and
              Learn is how the site becomes a game site rather than a tool with
              games attached. */}
          <section className={`mb-7 text-center ${shownViews.length > 1 ? '' : 'hidden'}`}>
            {/* wraps rather than overflowing: at 320px with the largest text
                this row is wider than the viewport, and the page clips its
                horizontal overflow, so Learn was cut off with no way to reach
                it */}
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
                {(
                  [
                    { view: 'play', label: 'Play', Icon: Gamepad2 },
                    { view: 'learn', label: 'Learn', Icon: BookOpen },
                  ] as const
                )
                  .filter(({ view }) => shownViews.includes(view))
                  .map(({ view, label, Icon }) => {
                  const active = currentView === view;
                  return (
                    <RouteLink
                      key={label}
                      to={pathOf({
                        kind: 'game',
                        view,
                        slug: MODE_SLUG[mode],
                        daily: dailyByMode[mode],
                      })}
                      onGo={() => goToView(view)}
                      className={`inline-flex items-center gap-1.5 px-4 sm:px-5 h-10 rounded-lg text-sm font-semibold transition-all duration-150
                        ${active
                          ? 'bg-emerald-400 text-ink shadow-lg shadow-emerald-500/30'
                          : 'text-slate-300 hover:bg-white/10'}`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </RouteLink>
                  );
                })}
            </div>
          </section>

          {showDifficultySwitch && (
            <section className="mb-7 text-center">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
                Difficulty
              </label>
              <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
                {offeredDifficulties.map((id) => (
                  <button
                    key={id}
                    onClick={() => setDifficulty(id)}
                    aria-pressed={level === id}
                    className={`px-3.5 h-9 rounded-lg text-sm font-semibold transition-colors
                      ${level === id
                        ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                        : 'text-slate-300 hover:bg-white/10'}`}
                  >
                    {DIFFICULTY_LABEL[id]}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* The same rung as Difficulty above, and the reason the two sit
              together: Difficulty is what a *play* board is built from, Word
              list is what a *solve* answer is drawn from. One question, asked
              once, in the wording the current view understands — which is why
              they are mutually exclusive rather than stacked.

              It used to render down among the game blocks, which put it above
              the board for five games and below the first control for the other
              five, purely by where each game happened to sit in this file.
              Nobody chose that. Hidden when one dictionary has been set for the
              whole site, since there'd be nothing left for it to pick. */}
          {!playActive && solverDictionary === 'per-game' && (
          <section className="mb-7 text-center">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Word list
            </label>
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {DICTIONARIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDictionaryId(d.id)}
                  title={d.blurb}
                  className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-150
                    ${dictionaryId === d.id
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {d.id === 'easy' && <BookOpen className="w-3.5 h-3.5" />}
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {DICTIONARIES.find((d) => d.id === dictionaryId)?.blurb}
            </p>
          </section>
          )}

          {learnMode && (
            <div className="mb-8">
              <LearnMode
                ref={learnRef}
                mode={mode}
                standardWords={standardWordsArr}
                palette={palette}
                theme={resolveTheme(theme)}
              />
            </div>
          )}

          {/* The report pages replace the board rather than sitting above it.
              Gating only the home page left /report/<ticket> rendering a ticket
              *and* a playable puzzle underneath it — which is what a reader on a
              report page least expects to find. */}
          {!learnMode && (
          <>
          {squaresPlayActive && (
          <div className="mb-8">
            <SquaresGame ref={squaresRef} standardWords={acceptWordsArr ?? standardWordsArr} />
          </div>
          )}

          {cryptogramPlayActive && (
          <div className="mb-8">
            <CryptogramGame ref={cryptogramRef} />
          </div>
          )}

          {mode === 'bridge' && !learnMode && (
          <div className="mb-8">
            <BridgeGame ref={bridgeRef} />
          </div>
          )}

          {mode === 'ladder' && !learnMode && (
          <div className="mb-8">
            <LadderGame ref={ladderRef} />
          </div>
          )}

          {weavePlayActive && (
          <div className="mb-8">
            <WeaveGame ref={weaveRef} standardWords={acceptWordsArr ?? standardWordsArr} navKeys={navKeys} />
          </div>
          )}


          {mode === 'pattern' && (
          <>
          {/* length selector — gone when the range allows only one, the same way
              the view switch goes when one tab is left */}
          <section className={`mb-7 text-center ${shownLengths.length > 1 ? '' : 'hidden'}`}>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Word length
            </label>
            <div className="flex flex-wrap gap-2 justify-center">
              {shownLengths.map((n) => (
                <button
                  key={n}
                  onClick={() => setLength(n)}
                  className={`w-11 h-11 rounded-xl text-sm font-semibold transition-all duration-150
                    ${length === n
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30 scale-105'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          <div className="mb-8">
            <GuessGame
              ref={gameRef}
              length={length}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              fullWords={acceptWordsArr ?? fullWordsArr}
              onLetterStates={setLetterStates}
            />
          </div>
          </>
          )}

          {descramblePlayActive && (
          <div className="mb-8">
            <ScrambleGame
              ref={scrambleRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              onLetterStates={setLetterStates}
            />
          </div>
          )}

          {beePlayActive && (
          <div className="mb-8">
            <HiveGame
              ref={hiveRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              onLetterStates={setLetterStates}
            />
          </div>
          )}

          {gridPlayActive && (
          <div className="mb-8">
            <GridGame
              ref={gridRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              displayWord={showWord}
              onLetterStates={setLetterStates}
            />
          </div>
          )}

          {boxedPlayActive && (
          <div className="mb-8">
            <BoxGame
              ref={boxRef}
              standardWords={acceptWordsArr ?? standardWordsArr}
              commonWords={commonWordsArr}
              practiceWords={practiceWordsArr}
              onLetterStates={setLetterStates}
            />
          </div>
          )}

          {/* The boxed solver's board, its chord tracing and the results panel
              that every solver shared all stood here. They were the last of the
              solve view, which stopped being reachable when 'solve' came out of
              VIEWS -- and stayed in the bundle for a fortnight after. */}
          </>
          )}
          </>
          )}

          </>
        )}

        {/* pb keeps the last row clear of the floating keyboard button */}
        <footer className="mt-14 pb-24 sm:pb-4 text-center text-xs text-slate-500">
          {/* The dictionary-size line lived here and described the solver:
              "searching 67,122 English words". With the solvers gone it was
              describing work nothing does, on every page including a report
              and a live session. */}
          {/* wraps into centered rows rather than one overflowing line */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            <RouteLink
              {...pageLink({ kind: 'home' })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </RouteLink>
            {/* The footer is on every page by construction, which is the whole
                reason this lives here: the previous home was a link on the
                daily board, gated on a date the game had to volunteer, and six
                of the ten games keep their date somewhere the gate never saw.
                A control whose only job is to be findable cannot be somewhere
                it might not appear. */}
            {owner && (
              <RouteLink
                {...pageLink({ kind: 'reportQueue' })}
                className="inline-flex items-center gap-1.5 text-accent hover:brightness-110 transition"
              >
                <FlagIcon className="w-3.5 h-3.5" aria-hidden="true" />
                Open reports
              </RouteLink>
            )}
            {/* The way into a session, on every page. Only while something is
                running: a link that is usually a dead end teaches people to
                ignore it, and this one has to be believed on the one afternoon
                a month it matters. */}
            {liveNow > 0 && sessionsOn && (
              <RouteLink
                {...pageLink({ kind: 'join' })}
                className="inline-flex items-center gap-1.5 text-accent hover:brightness-110 transition"
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                {liveNow === 1 ? 'Join the session' : `Join a session (${liveNow})`}
              </RouteLink>
            )}
            {canSetUp && sessionsOn && (
              <RouteLink
                {...pageLink({ kind: 'sessions' })}
                className="inline-flex items-center gap-1.5 text-accent hover:brightness-110 transition"
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                Sessions
              </RouteLink>
            )}
            {canAdmin && (
              <RouteLink
                {...pageLink({ kind: 'admin', tab: nav.last.admin })}
                className="inline-flex items-center gap-1.5 text-accent hover:brightness-110 transition"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                Site settings
              </RouteLink>
            )}
            <ReportMenu
              context={{
                game: FEED_NAME[mode],
                gameLabel: GAME_NAME[mode].full,
                date: dateByMode[mode],
                board: boardByMode[mode],
                level,
              }}
            />
            <RouteLink
              {...overlayLink({ kind: 'stats', tab: nav.last.stats })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Stats
            </RouteLink>
            <RouteLink
              {...overlayLink({ kind: 'settings', tab: nav.last.settings })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </RouteLink>
            <RouteLink
              {...overlayLink({ kind: 'panel', panel: 'keys' })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" />
              Keys
            </RouteLink>
            {supabase && (
              <RouteLink
                // Signed out there is only one tab to be on, and /sign-in is
                // the friendlier address for it — but it has to be the address
                // the click actually goes to, which is why the target is pinned
                // rather than read from the remembered tab.
                {...(session
                  ? overlayLink({ kind: 'account', tab: nav.last.account })
                  : { to: '/sign-in', onGo: () => openOverlay({ kind: 'account', tab: 'personal' }) })}
                className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
              >
                <UserRound className="w-3.5 h-3.5" />
                {session ? 'Account' : 'Sign in'}
              </RouteLink>
            )}
            <RouteLink
              {...overlayLink({ kind: 'panel', panel: 'about' })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              About &amp; FAQ
            </RouteLink>
            <RouteLink
              {...overlayLink({ kind: 'legal', doc: nav.last.legal })}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Scale className="w-3.5 h-3.5" />
              Legal
            </RouteLink>
          </div>
        </footer>
      </main>

      {authNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-md w-[calc(100%-2rem)] rounded-xl bg-rose-950/95 border border-rose-500/40 px-4 py-3 shadow-2xl flex items-start gap-3">
          <p className="text-sm text-rose-200 flex-1">
            Sign-in didn&apos;t complete: {authNotice}. Request a fresh link, or use the
            emailed code instead.
          </p>
          <button
            onClick={() => setAuthNotice(null)}
            aria-label="Dismiss"
            className="text-rose-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {statsOpen && (
        <StatsModal
          signedIn={!!session}
          view={statsTab}
          onView={(tab) => openOverlay({ kind: 'stats', tab })}
          onClose={closeOverlay}
        />
      )}

      {accountOpen && (
        <AccountModal
          session={session}
          tab={accountTab}
          onTab={(tab) => openOverlay({ kind: 'account', tab })}
          onClose={closeOverlay}
        />
      )}

      {/* One question now, and it needs no link out: the analytics half was
          the part that had a privacy policy to read before answering. */}
      <ConsentBanner />

      {keysOpen && (
        <KeyboardHelp
          navKeys={navKeys}
          shownModes={shownModes}
          onClose={closeOverlay}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          tab={settingsTab}
          onTab={(tab) => openOverlay({ kind: 'settings', tab })}
          startPage={startPage}
          onStartPage={setStartPage}
          theme={theme}
          palette={palette}
          navKeys={navKeys}
          textScale={textScale}
          hiddenModes={hiddenModes}
          hiddenViews={hiddenViews}
          lengthRange={lengthRange}
          practiceAllowed={practiceAllowed}
          highlightMatches={highlightMatches}
          signedIn={!!session}
          onTheme={setTheme}
          onPalette={setPalette}
          onNavKeys={setNavKeys}
          onTextScale={setTextScale}
          onToggleMode={(m) =>
            setHiddenModes((prev) =>
              prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
            )
          }
          onLengthRange={setLengthRange}
          onPracticeAllowed={setPracticeAllowed}
          onHighlightMatches={setHighlightMatches}
          wordFilter={wordFilter}
          onWordFilter={setWordFilter}
          onToggleView={(v) =>
            setHiddenViews((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
            )
          }
          onClose={closeOverlay}
        />
      )}

      {/* about & FAQ modal */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About and FAQ"
            ref={aboutRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
          >
            {/* outside the scroll, so it can't slide away mid-read */}
            <button
              onClick={closeOverlay}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-8">
            <h2 className="text-xl font-bold mb-5">About {SITE_NAME}</h2>

            <div className="space-y-5 text-sm text-slate-300">
              <p>
                {SITE_NAME} is a word game site for Amherst Communications staff: a fresh
                puzzle every morning, practice boards whenever you want one, and
                interactive guides for the games you have not met before.
              </p>
              <p className="text-slate-400">
                It runs on our own server, reachable only from inside the company. It is
                for fun — play it, ignore it, or take the leaderboard far too seriously.
              </p>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  FAQ
                </h3>
                <div className="space-y-3 text-slate-400">
                  <div>
                    <p className="text-slate-300 font-medium">
                      Are the daily puzzles the same as the NYT&apos;s?
                    </p>
                    <p>
                      No — every daily here is ours, generated on our own server, so
                      playing never spoils (or copies) anyone else&apos;s puzzle.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      What do Easy, Hard and Extreme change?
                    </p>
                    <p>
                      They&apos;re three separate puzzles each day, not one puzzle with a
                      setting — each difficulty keeps its own progress, statistics,
                      streaks and leaderboards, and you can play all three. What changes
                      depends on the game: Guess, Scramble, Hive and Boxed draw their
                      answers from progressively less common words; Squares and Weave
                      grow their boards; Grid keeps its dice and widens what scores.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Which words count?</p>
                    <p>
                      Each difficulty is scored against its own word list — Easy is
                      everyday English, Hard adds the less common words, Extreme takes
                      nearly everything. What a puzzle <em>accepts</em> is deliberately
                      one size more generous than the list its <em>answers</em> come
                      from, so the answer is always something you might recognise while
                      your long shots get the benefit of the doubt.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Why was my word rejected?
                    </p>
                    <p>
                      The lists are built from open dictionaries (SCOWL and friends —
                      see Legal for credits), lowercase letters only: no proper nouns,
                      no hyphens or apostrophes, no accents. Nothing is checked against
                      any publisher&apos;s list, so our Hive and the NYT&apos;s bee will
                      disagree at the margins. If a real word is missing, report it —
                      the lists do get amended.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Do you filter offensive words?
                    </p>
                    <p>
                      From what we publish, yes: no puzzle will hand you a slur as its
                      answer. From what you type, no — refusing to publish a word and
                      refusing to accept one you played are different things, and only
                      the first is ours to decide.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Do I need an account?</p>
                    <p>
                      You already have one. Reaching this site at all means signing in
                      with your Amherst account, and the site signs you in again behind
                      the scenes so your statistics <em>and</em> today&apos;s unfinished
                      puzzles follow you between devices — start on a phone, finish on a
                      laptop, and a daily you have already played won&apos;t come back as
                      a fresh board somewhere else. There is no separate password to
                      remember and nothing to create.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Where does my data live?</p>
                    <p>
                      On a server inside the company, and in your browser. The letters
                      you type are checked where you type them and never leave your
                      device — only the result does, once you finish. Your completed
                      games sync to your account on the same internal server; nothing
                      about how you play goes to anyone outside Amherst.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">When do new dailies arrive?</p>
                    <p>
                      At 2:00&nbsp;a.m. Central, every day — the boards themselves are
                      generated a fortnight ahead, so a new one is waiting the moment the
                      date turns over.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      How do I report something?
                    </p>
                    <p>
                      <ReportMenu
                        context={{
                          game: FEED_NAME[mode],
                          gameLabel: GAME_NAME[mode].full,
                          date: dateByMode[mode],
                          board: boardByMode[mode],
                          level,
                        }}
                        label="Report a problem"
                        showIcon={false}
                        className="font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      />{' '}
                      at the bottom of any page. It covers a puzzle with something offensive on
                      it, a display name, a privacy concern, a broken page, and anything
                      else. You don&apos;t need an account, and for a puzzle or a player
                      there is nothing to copy out — we look the board or the name up
                      ourselves, so all you need to say is what&apos;s wrong with it. A
                      practice board is the exception: it was dealt in your browser and
                      never published, so reporting one sends the board along with you.
                    </p>
                    <p className="mt-2">
                      You get a reference back. Keep it and{' '}
                      <a
                        href="/report"
                        className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      >
                        look it up any time
                      </a>{' '}
                      to see whether it&apos;s still open and what was decided. Leave an
                      email address as well and we&apos;ll write to you when it&apos;s
                      dealt with.
                    </p>
                    <p className="mt-2">
                      That address is used for those two emails and nothing else. It
                      isn&apos;t attached to the report anyone reads — not on the page
                      where reports get handled, and not in the daily summary, which says
                      only that somebody asked to be told — and it&apos;s deleted once the
                      outcome has gone out. Nothing else about a reporter is stored at
                      all: even the limits on how many reports we take are counted per
                      reported thing rather than per person, so there is nothing to count
                      you by.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      I&apos;ve found a security problem.
                    </p>
                    <p>
                      Please tell us rather than anywhere public — that publishes the
                      hole to everyone before it is fixed. The report form above has a
                      security option; it goes straight to the internal queue and gives
                      you a reference you can check. Nothing about it leaves the company.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Found a bug, or have an idea?
                    </p>
                    <p>
                      Use the report form above — <em>a problem with the site</em> or{' '}
                      <em>something else</em>. It reaches the same queue, needs nothing
                      installed, and you get a reference back.
                    </p>
                  </div>
                </div>
              </div>

              <p>
                The code is free and open-source, released under the{' '}
                <a
                  href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  MIT License
                </a>{' '}
                and lives on{' '}
                <a
                  href="https://github.com/rptetzloff/anagrimoire"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  GitHub
                </a>
                .
              </p>

              <p>
                Also by me:{' '}
                <a
                  href="https://wordlock.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  wordlock.net
                </a>
                , a password generator.
              </p>

              <p className="text-slate-500 text-xs">
                Vibe-coded with{' '}
                <a
                  href="https://claude.com/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-300 underline underline-offset-2"
                >
                  Claude
                </a>
                .
              </p>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* legal, privacy & licenses modal */}
      {legalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Legal and licenses"
            ref={legalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
          >
            {/* outside the scroll — the privacy policy is the longest thing on
                the site, and losing the close button partway down it is grim */}
            <button
              onClick={closeOverlay}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-8">
            <h2 className="text-xl font-bold mb-4">Legal</h2>

            <div className="inline-flex flex-wrap rounded-xl bg-white/5 border border-white/10 p-1 gap-1 mb-5">
              {(
                [
                  ['notices', 'Notices'],
                  ['privacy', 'Privacy'],
                  ['terms', 'Terms'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => openOverlay({ kind: 'legal', doc: id })}
                  aria-current={legalTab === id ? 'page' : undefined}
                  className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${legalTab === id
                      ? 'bg-emerald-400 text-ink'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {legalTab === 'privacy' && <PrivacyPolicy />}
            {legalTab === 'terms' && <Terms />}

            <div className={`space-y-5 text-sm text-slate-300 ${legalTab === 'notices' ? '' : 'hidden'}`}>
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Disclaimer
                </h3>
                <p className="text-slate-400">
                  Amherst Communications is not affiliated with, endorsed by, or sponsored
                  by The New York Times Company (Wordle, Spelling Bee, Letter Boxed,
                  Strands), Hasbro or Mattel (Scrabble, Boggle), Tribune Content Agency
                  (Jumble), or any other puzzle publisher. All game names and trademarks
                  are the property of their respective owners and are used here only to
                  describe the kinds of puzzles this site offers.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Word lists
                </h3>
                <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                  <li>
                    All three word lists — Easy, Hard and Extreme — are built from{' '}
                    <a
                      href="https://github.com/jacksonrayhamilton/wordlist-english"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      wordlist-english
                    </a>{' '}
                    (MIT) and, for the largest tier, from{' '}
                    <a
                      href="http://wordlist.aspell.net/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      SCOWL
                    </a>{' '}
                    itself © Kevin Atkinson — each difficulty cuts deeper into
                    SCOWL&apos;s frequency sizes (55, 70, 80), and every word a game
                    asks or accepts comes from these.
                  </li>
                  <li>
                    Words we won&apos;t use as puzzle answers are drawn from the{' '}
                    <a
                      href="https://github.com/en-wl/wordlist"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      English Speller Database
                    </a>{' '}
                    © 2000–2026 Kevin Atkinson, which marks offensive and vulgar
                    words, and from the{' '}
                    <a
                      href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      LDNOOBW list
                    </a>{' '}
                    (CC BY 4.0). They filter what we publish, never what
                    you&apos;re allowed to type — though the word lists
                    themselves contain no slurs, at any tier.
                  </li>
                  <li>
                    Word categories in our shared data files come from{' '}
                    <a
                      href="https://wordnet.princeton.edu/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      WordNet
                    </a>
                    &reg; © Princeton University, used under the{' '}
                    <a
                      href="https://wordnet.princeton.edu/license-and-commercial-use"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      WordNet License
                    </a>
                    . They label words (animal, food, plant&hellip;) and never
                    decide what a puzzle asks or accepts.
                  </li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  No word list is guaranteed to match any game&apos;s official dictionary.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  License
                </h3>
                <p className="text-slate-400">
                  The site&apos;s code is released under the{' '}
                  <a
                    href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                  >
                    MIT License
                  </a>
                  .
                </p>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* on-screen keyboard */}
      {kbOpen ? (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur border-t border-white/10 px-2 pt-3 pb-4">
          <button
            onClick={() => setKbOpen(false)}
            aria-label="Hide keyboard"
            className="absolute -top-11 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 border border-white/15 text-slate-400 hover:text-white hover:bg-slate-700 hover:border-white/30 shadow-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-full max-w-md mx-auto flex flex-col gap-1.5">
            {[
              'qwertyuiop'.split(''),
              'asdfghjkl'.split(''),
              [
                ...(playActive || learnMode || keySink ? ['enter'] : []),
                ...(mode === 'descramble' ? ['?'] : []),
                ...'zxcvbnm'.split(''),
                'backspace',
              ],
            ].map((row, r) => (
              <div key={r} className={`flex w-full gap-1 sm:gap-1.5 ${r === 1 ? 'px-[4.5%]' : ''}`}>
                {row.map((k) => {
                  const state = !/^[a-z]$/.test(k)
                    ? undefined
                    : keySink
                      ? keySink.letters[k]
                      : playActive
                        ? letterStates[k]
                        : undefined;
                  const tone =
                    state === 'correct'
                      ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
                      : state === 'present'
                        ? 'bg-amber-400/80 hover:bg-amber-400 text-ink'
                        : state === 'absent'
                          ? 'bg-white/[0.04] hover:bg-white/10 text-slate-600'
                          : 'bg-white/10 hover:bg-white/20 active:bg-white/30 text-white';
                  return (
                    <button
                      key={k}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => (keySink ? keySink.press(k) : pressKey(k))}
                      aria-label={k === 'backspace' ? 'Backspace' : k === 'enter' ? 'Enter' : `Key ${k}`}
                      /* The colour says whether a letter is used up, spent or
                         still open, and a colour is not available to a screen
                         reader or to a test. */
                      data-state={state ?? 'open'}
                      aria-description={
                        state === 'correct'
                          ? 'in the word, in the right place'
                          : state === 'present'
                            ? 'in the word'
                            : state === 'absent'
                              ? 'not in the word'
                              : undefined
                      }
                      className={`h-11 min-w-0 rounded-md text-sm font-semibold uppercase transition-colors flex items-center justify-center ${tone}
                        ${k === 'backspace' || k === 'enter' ? 'flex-[1.5]' : 'flex-1'}`}
                    >
                      {k === 'backspace' ? (
                        <Delete className="w-4 h-4" />
                      ) : k === 'enter' ? (
                        <CornerDownLeft className="w-4 h-4" />
                      ) : (
                        k
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setKbOpen(true)}
          aria-label="Show keyboard"
          title="Show on-screen keyboard"
          className="fixed bottom-4 right-4 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 border border-white/15 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/30 shadow-lg transition-colors"
        >
          <Keyboard className="w-5 h-5" />
        </button>
      )}
    </div>
    </KeySinkContext.Provider>
    </OskContext.Provider>
    </PrefsContext.Provider>
    </PaletteContext.Provider>
  );
}

export default App;
