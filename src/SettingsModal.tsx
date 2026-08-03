import { useEffect } from 'react';
import { Check, Contrast, Monitor, Moon, Sun, X } from 'lucide-react';
import type { Palette, ThemeMode } from '@/theme';

const THEME_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'System', Icon: Monitor },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

// small live swatches so the palette choice is visible before committing
function Swatches({ palette }: { palette: Palette }) {
  const tones =
    palette === 'cvd'
      ? ['rgb(59 130 246)', 'rgb(230 159 0)', 'rgb(236 72 153)', 'rgb(86 180 233)']
      : ['rgb(52 211 153)', 'rgb(251 191 36)', 'rgb(251 113 133)', 'rgb(125 211 252)'];
  return (
    <span className="inline-flex gap-1 align-middle">
      {tones.map((c) => (
        <span
          key={c}
          className="w-3 h-3 rounded-full border border-white/20"
          style={{ backgroundColor: c }}
        />
      ))}
    </span>
  );
}

export default function SettingsModal({
  theme,
  palette,
  signedIn,
  onTheme,
  onPalette,
  onClose,
}: {
  theme: ThemeMode;
  palette: Palette;
  signedIn: boolean;
  onTheme: (t: ThemeMode) => void;
  onPalette: (p: Palette) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
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
              {(
                [
                  {
                    id: 'default' as const,
                    label: 'Default',
                    blurb: 'Green, amber, and rose',
                  },
                  {
                    id: 'cvd' as const,
                    label: 'Color-blind friendly',
                    blurb: 'Blue and orange instead of green and amber',
                  },
                ]
              ).map(({ id, label, blurb }) => (
                <button
                  key={id}
                  onClick={() => onPalette(id)}
                  aria-pressed={palette === id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors
                    ${palette === id
                      ? 'bg-amber-400/10 border-amber-400/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                >
                  <span className="flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      {label}
                      {palette === id && <Check className="w-3.5 h-3.5 text-accent" />}
                    </span>
                    <span className="block text-xs text-slate-500">{blurb}</span>
                  </span>
                  <Swatches palette={id} />
                </button>
              ))}
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
