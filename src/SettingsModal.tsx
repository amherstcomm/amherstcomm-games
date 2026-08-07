import { useRef, useState } from 'react';
import { BarChart3, Check, Contrast, EyeOff, Keyboard, Monitor, Moon, Sun, Type, X } from 'lucide-react';
import KeyDiagram from '@/KeyDiagram';
import { GA_ID, disableAnalytics, initAnalytics } from '@/analytics';
import {
  clearAnalyticsCookies,
  consentGivenAt,
  gpcEnabled,
  readConsent,
  writeConsent,
  type Consent,
} from '@/consent';
import {
  lengthChoices,
  MAX_WORD_LEN,
  MIN_WORD_LEN,
  type LengthRange,
  type Mode,
  type NavKeys,
  type StartPage,
  type View,
} from '@/storage';
import type { DictionaryId } from '@/dictionaries';
import type { SettingsTab } from '@/routes';
import { level as storageLevel, setLevel, STORAGE_OPTIONS, type StorageLevel } from '@/siteStorage';
import type { Palette, TextScale, ThemeMode } from '@/theme';
import { useModalA11y } from '@/useModalA11y';

// the nav's own names, so the switch reads like the thing it switches
// 'mode' marks the entries that disappear when that game is hidden — pointing
// the front door at a game you've switched off would leave nowhere to land.

const START_OPTIONS: { id: StartPage; label: string; mode?: Mode }[] = [
  { id: 'home', label: 'Home page' },
  { id: 'last', label: 'Where I left off' },
  { id: 'pattern', label: 'Guess the Word', mode: 'pattern' },
  { id: 'descramble', label: 'Scramble', mode: 'descramble' },
  { id: 'bee', label: 'Hive', mode: 'bee' },
  { id: 'grid', label: 'Grid', mode: 'grid' },
  { id: 'boxed', label: 'Boxed', mode: 'boxed' },
  { id: 'weave', label: 'Weave', mode: 'weave' },
  { id: 'squares', label: 'Word Squares', mode: 'squares' },
];

const MODE_LABELS: { id: Mode; label: string }[] = [
  { id: 'pattern', label: 'Guess' },
  { id: 'descramble', label: 'Scramble' },
  { id: 'bee', label: 'Hive' },
  { id: 'grid', label: 'Grid' },
  { id: 'boxed', label: 'Boxed' },
  { id: 'weave', label: 'Weave' },
  { id: 'squares', label: 'Squares' },
];

const VIEW_LABELS: { id: View; label: string }[] = [
  { id: 'solve', label: 'Solve' },
  { id: 'play', label: 'Play' },
  { id: 'learn', label: 'Learn' },
];

const DICTIONARY_LABELS: { id: DictionaryId; label: string }[] = [
  { id: 'common', label: 'Common' },
  { id: 'standard', label: 'Standard' },
  { id: 'full', label: 'Full' },
];

const THEME_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'System', Icon: Monitor },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

const PALETTE_OPTIONS: { id: Palette; label: string; blurb: string; tones: string[] }[] = [
  {
    id: 'default',
    label: 'Default',
    blurb: 'Green, amber, and rose',
    tones: ['52 211 153', '251 191 36', '251 113 133', '125 211 252'],
  },
  {
    id: 'deuter',
    label: 'Red–green friendly',
    blurb: 'Deuteranopia and protanopia — blue and orange replace green and amber',
    tones: ['59 130 246', '230 159 0', '236 72 153', '86 180 233'],
  },
  {
    id: 'tritan',
    label: 'Blue–yellow friendly',
    blurb: 'Tritanopia — green against vermilion, the axis those eyes keep',
    tones: ['45 190 125', '232 106 58', '236 88 150', '165 228 240'],
  },
  {
    id: 'mono',
    label: 'Monochrome',
    blurb: 'No hue at all — states are separated by lightness',
    tones: ['235 235 235', '180 180 180', '130 130 130', '90 90 90'],
  },
];

function Pill({
  on,
  onClick,
  disabled,
  title,
  tone,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone: 'amber' | 'emerald';
  children: React.ReactNode;
}) {
  const lit =
    tone === 'amber'
      ? 'bg-amber-400/15 border-amber-400/40 text-amber-200'
      : 'bg-emerald-400/15 border-emerald-400/40 text-emerald-200';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={title}
      className={`px-2.5 h-8 rounded-lg text-xs font-semibold border transition-colors disabled:cursor-not-allowed
        ${on ? lit : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
    >
      {children}
    </button>
  );
}

function LengthPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (n: number) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm font-semibold"
    >
      {options.map((n) => (
        <option key={n} value={n} className="bg-slate-900">
          {n}
        </option>
      ))}
    </select>
  );
}

// small live swatches so the palette choice is visible before committing
function Swatches({ tones }: { tones: string[] }) {
  return (
    <span className="inline-flex gap-1 align-middle shrink-0">
      {tones.map((c) => (
        <span
          key={c}
          className="w-3 h-3 rounded-full border border-white/20"
          style={{ backgroundColor: `rgb(${c})` }}
        />
      ))}
    </span>
  );
}

export default function SettingsModal({
  theme,
  palette,
  textScale,
  navKeys,
  hiddenModes,
  hiddenViews,
  lengthRange,
  practiceAllowed,
  helpAllowed,
  solverDictionary,
  signedIn,
  onTheme,
  onPalette,
  onTextScale,
  onNavKeys,
  onToggleMode,
  onToggleView,
  onLengthRange,
  onPracticeAllowed,
  onHelpAllowed,
  onSolverDictionary,
  startPage,
  onStartPage,
  tab,
  onTab,
  onClose,
}: {
  theme: ThemeMode;
  palette: Palette;
  textScale: TextScale;
  navKeys: NavKeys;
  hiddenModes: Mode[];
  hiddenViews: View[];
  lengthRange: LengthRange;
  practiceAllowed: boolean;
  helpAllowed: boolean;
  solverDictionary: DictionaryId | 'per-game';
  signedIn: boolean;
  onTheme: (t: ThemeMode) => void;
  onPalette: (p: Palette) => void;
  onTextScale: (t: TextScale) => void;
  onNavKeys: (n: NavKeys) => void;
  onToggleMode: (m: Mode) => void;
  onToggleView: (v: View) => void;
  onLengthRange: (r: LengthRange) => void;
  onPracticeAllowed: (v: boolean) => void;
  onHelpAllowed: (v: boolean) => void;
  onSolverDictionary: (d: DictionaryId | 'per-game') => void;
  startPage: StartPage;
  onStartPage: (s: StartPage) => void;
  /** the open tab, held by App so it can live in the address bar */
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);

  // the open tab lives in App so it can live in the address bar too

  // Somewhere that requires asking, an unanswered visitor is off; everywhere
  // else analytics runs unless it's been turned off, which is the state this
  // control exists to make reachable.
  const gpc = gpcEnabled();
  // Unanswered is off. Nothing loads before a yes, so the control has to show
  // that state rather than a cheerful default.
  const [storage, setStorageState] = useState<StorageLevel>(storageLevel);
  const [analytics, setAnalyticsState] = useState<Consent>(() => readConsent() ?? 'denied');
  const [answeredAt, setAnsweredAt] = useState<Date | null>(consentGivenAt);

  function setAnalytics(value: Consent) {
    if (gpc) return;
    writeConsent(value);
    setAnalyticsState(value);
    setAnsweredAt(consentGivenAt());
    if (value === 'granted') {
      initAnalytics();
    } else {
      disableAnalytics();
      clearAnalyticsCookies();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
      >
        {/* Sits outside the scrolling area on purpose. This list is taller
            than a phone, and a close button inside it slides off the top the
            moment anyone scrolls. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto p-6 sm:p-8">
        <h2 className="text-xl font-bold mb-4">Settings</h2>

        {/* Two halves, because they answer different questions: how the site
            looks to you, and which of it you want. Long enough now that one
            list buried the games half under four appearance controls. */}
        <div className="inline-flex flex-wrap rounded-xl bg-white/5 border border-white/10 p-1 gap-1 mb-5">
          {(
            [
              { id: 'site', label: 'Site' },
              { id: 'games', label: 'Games' },
              { id: 'privacy', label: 'Privacy' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors
                ${tab === id ? 'bg-emerald-400 text-ink' : 'text-slate-300 hover:bg-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`space-y-6 ${tab === 'site' ? '' : 'hidden'}`}>
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Start on
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {START_OPTIONS.filter((o) => o.mode === undefined || !hiddenModes.includes(o.mode)).map(
                ({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => onStartPage(id)}
                    aria-pressed={startPage === id}
                    className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                      ${startPage === id
                        ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                        : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              What opens when you arrive without a link. Pick a game and the front
              page is skipped entirely.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Appearance
            </h3>
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {THEME_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => onTheme(id)}
                  aria-pressed={theme === id}
                  className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${theme === id
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              System follows your device&apos;s light or dark setting.
            </p>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              <Contrast className="w-3.5 h-3.5" />
              Colors
            </h3>
            <div className="space-y-2">
              {PALETTE_OPTIONS.map(({ id, label, blurb, tones }) => (
                <button
                  key={id}
                  onClick={() => onPalette(id)}
                  aria-pressed={palette === id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors
                    ${palette === id
                      ? 'bg-amber-400/10 border-amber-400/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      {label}
                      {palette === id && <Check className="w-3.5 h-3.5 text-accent" />}
                    </span>
                    <span className="block text-xs text-slate-500">{blurb}</span>
                  </span>
                  <Swatches tones={tones} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              <Type className="w-3.5 h-3.5" />
              Text size
            </h3>
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {(
                [
                  { id: 'normal' as const, label: 'Normal', size: 'text-sm' },
                  { id: 'large' as const, label: 'Large', size: 'text-base' },
                  { id: 'larger' as const, label: 'Larger', size: 'text-lg' },
                ]
              ).map(({ id, label, size }) => (
                <button
                  key={id}
                  onClick={() => onTextScale(id)}
                  aria-pressed={textScale === id}
                  className={`px-3 h-9 rounded-lg font-semibold transition-colors ${size}
                    ${textScale === id
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Scales the whole page. Your browser&apos;s own zoom and font-size settings
              still work on top of this.
            </p>
          </div>

        </div>

        {/* The two questions the banner asks, in one place — what stays on
            this device, and what leaves it. */}
        <div className={`space-y-6 ${tab === 'privacy' ? '' : 'hidden'}`}>
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              What may be kept
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {STORAGE_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    // takes effect immediately, including removing what the
                    // stricter setting no longer allows
                    setLevel(id);
                    setStorageState(id);
                  }}
                  aria-pressed={storage === id}
                  className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${storage === id
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {STORAGE_OPTIONS.find((o) => o.id === storage)?.blurb} Choosing less
              clears what was already here rather than merely stopping more.
            </p>
          </div>

          {GA_ID && (
            <div>
              <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                <BarChart3 className="w-3.5 h-3.5" />
                Analytics
              </h3>
              <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
                {(
                  [
                    { id: 'granted' as const, label: 'Allowed' },
                    { id: 'denied' as const, label: 'Off' },
                  ]
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setAnalytics(id)}
                    aria-pressed={analytics === id}
                    disabled={gpc}
                    className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                      ${analytics === id
                        ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                        : 'text-slate-300 hover:bg-white/10'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {gpc
                  ? 'Your browser sends a Global Privacy Control signal, so analytics is off and stays off.'
                  : 'Counts visits, never your letters or results. Turning it off also clears the cookies it left behind. Kept per browser, since cookies are.'}
              </p>
              {!gpc && answeredAt && (
                <p className="mt-1 text-xs text-slate-500">
                  You answered on{' '}
                  {answeredAt.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                  . We ask again after a year — an answer from long ago isn&apos;t really
                  a current one.
                </p>
              )}
            </div>
          )}
        </div>

        <div className={`space-y-6 ${tab === 'games' ? '' : 'hidden'}`}>
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              <EyeOff className="w-3.5 h-3.5" />
              Show
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MODE_LABELS.map(({ id, label }) => {
                const shown = !hiddenModes.includes(id);
                const last = shown && hiddenModes.length === MODE_LABELS.length - 1;
                return (
                  <Pill
                    key={id}
                    on={shown}
                    onClick={() => onToggleMode(id)}
                    disabled={last}
                    title={last ? 'At least one game has to stay' : undefined}
                    tone="amber"
                  >
                    {label}
                  </Pill>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VIEW_LABELS.map(({ id, label }) => {
                const shown = !hiddenViews.includes(id);
                const last = shown && hiddenViews.length === VIEW_LABELS.length - 1;
                return (
                  <Pill
                    key={id}
                    on={shown}
                    onClick={() => onToggleView(id)}
                    disabled={last}
                    title={last ? 'At least one tab has to stay' : undefined}
                    tone="emerald"
                  >
                    {label}
                  </Pill>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <Pill
                on={practiceAllowed}
                onClick={() => onPracticeAllowed(!practiceAllowed)}
                tone="emerald"
              >
                Practice
              </Pill>
              {/* only meaningful while there's a solver to reach */}
              {!hiddenViews.includes('solve') && (
                <Pill on={helpAllowed} onClick={() => onHelpAllowed(!helpAllowed)} tone="emerald">
                  Help &amp; reveal
                </Pill>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Tap to hide a game, a tab, the practice boards, or the buttons that
              hand a game to the solver. Nothing is deleted — statistics and
              streaks keep accruing, and unhiding brings everything back. One
              game and one tab have to stay.
            </p>

          </div>

          {!hiddenViews.includes('solve') && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                Solver dictionary
              </h3>
                <select
                  aria-label="Solver dictionary"
                  value={solverDictionary}
                  onChange={(e) =>
                    onSolverDictionary(e.target.value as DictionaryId | 'per-game')
                  }
                  className="h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm font-semibold"
                >
                  <option value="per-game" className="bg-slate-900">
                    Per game
                  </option>
                  {DICTIONARY_LABELS.map(({ id, label }) => (
                    <option key={id} value={id} className="bg-slate-900">
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  {solverDictionary === 'per-game'
                    ? 'Each solver remembers its own, which is what the picker above each one sets.'
                    : 'Every solver uses this one, and the per-solver picker goes away.'}
                </p>
            </div>
          )}

          {!hiddenModes.includes('pattern') && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                Pattern word lengths
              </h3>
                <div className="flex items-center gap-2 text-sm">
                  <LengthPicker
                    label="Shortest word length"
                    value={lengthRange.min}
                    // never let the pair cross over — an empty range would
                    // leave the picker with nothing to offer
                    options={lengthChoices({ min: MIN_WORD_LEN, max: lengthRange.max })}
                    onChange={(min) => onLengthRange({ ...lengthRange, min })}
                  />
                  <span className="text-slate-500">to</span>
                  <LengthPicker
                    label="Longest word length"
                    value={lengthRange.max}
                    options={lengthChoices({ min: lengthRange.min, max: MAX_WORD_LEN })}
                    onChange={(max) => onLengthRange({ ...lengthRange, max })}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {lengthRange.min === lengthRange.max
                    ? `Only ${lengthRange.min}-letter words, and the length row disappears.`
                    : 'Narrows the row of lengths Pattern offers. The rest keep their dailies and statistics.'}
                </p>
            </div>
          )}

          {/* steers Weave's board and nothing else, so it goes with Weave */}
          {!hiddenModes.includes('weave') && (
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              <Keyboard className="w-3.5 h-3.5" />
              Board navigation
            </h3>
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {(
                [
                  { id: 'numpad' as const, label: 'Number pad' },
                  { id: 'wasd' as const, label: 'WASD' },
                ]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => onNavKeys(id)}
                  aria-pressed={navKeys === id}
                  className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${navKeys === id
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <KeyDiagram scheme={navKeys} />
              <p className="text-xs text-slate-500 flex-1">
                Steers the cursor around Weave&apos;s board, diagonals included. Arrow
                keys always work too.
              </p>
            </div>
          </div>
          )}
        </div>

        <p className="text-xs text-slate-500 border-t border-white/10 pt-4 mt-6">
          {signedIn
            ? 'These settings are saved to your account and follow you across devices.'
            : 'Saved in this browser. Sign in to carry them across devices.'}
        </p>
        </div>
      </div>
    </div>
  );
}
