import { useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareText, type ShareResult } from '@/share';

// `build` is a function so the text is composed at click time, from whatever
// the board looks like then
export default function ShareButton({ build, label = 'Share' }: { build: () => string; label?: string }) {
  const [state, setState] = useState<ShareResult | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onShare() {
    const result = await shareText(build());
    setState(result);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(null), 2000);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onShare}
        className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
      >
        <Share2 className="w-4 h-4" />
        {label}
      </button>
      <span aria-live="polite" className="text-xs text-slate-500">
        {state === 'copied' && (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="w-3.5 h-3.5" />
            Copied
          </span>
        )}
        {state === 'failed' && <span className="text-danger">Couldn&apos;t copy</span>}
      </span>
    </span>
  );
}
