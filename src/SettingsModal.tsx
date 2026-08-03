import { useRef } from 'react';
import { Check, Contrast, Keyboard, Monitor, Moon, Sun, X } from 'lucide-react';
import type { NavKeys } from '@/storage';
import type { Palette, ThemeMode } from '@/theme';
import { useModalA11y } from '@/useModalA11y';

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

// the eight keys as they sit on a keyboard, so the layout is obvious at a
// glance; the centre shows where the cursor is
const NAV_KEY_GRID: Record<NavKeys, string[]> = {
  numpad: ['7', '8', '9', '4', '', '6', '1', '2', '3'],
  wasd: ['Q', 'W', 'E', 'A', '', 'D', 'Z', 'S', 'X'],
};

function KeyDiagram({ scheme }: { scheme: NavKeys }) {
  return (
    <div className="grid grid-cols-3 gap-1 w-fit" aria-hidden="true">
      {NAV_KEY_GRID[scheme].map((k, i) =>
        k ? (
          <span
            key={i}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-white/10 border border-white/15 text-[11px] font-mono font-semibold text-slate-200"
          >
            {k}
          </span>
        ) : (
          <span
            key={i}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-dashed border-amber-400/50 text-[10px] text-accent"
          >
            ●
          </span>
        )
      )}
    </div>
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
  navKeys,
  signedIn,
  onTheme,
  onPalette,
  onNavKeys,
  onClose,
}: {
  theme: ThemeMode;
  palette: Palette;
  navKeys: NavKeys;
  signedIn: boolean;
  onTheme: (t: ThemeMode) => void;
  onPalette: (p: Palette) => void;
  onNavKeys: (n: NavKeys) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);

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
        className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-6 sm:p-8 text-left shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-bold mb-5">Settings</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Appearance
            </h3>
            <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
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
              <Keyboard className="w-3.5 h-3.5" />
              Board navigation
            </h3>
            <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
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

          <p className="text-xs text-slate-500 border-t border-white/10 pt-4">
            {signedIn
              ? 'These settings are saved to your account and follow you across devices.'
              : 'Saved in this browser. Sign in to carry them across devices.'}
          </p>
        </div>
      </div>
    </div>
  );
}
