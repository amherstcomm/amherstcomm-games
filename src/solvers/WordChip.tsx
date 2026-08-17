// One answer, and a click copies it.
//
// Every solver that lists words draws them with this, which is why it is not
// inside ResultsPanel: Boxed's recommended chain and its multi-word solutions
// are chips too, and those are passed in as children rather than rendered by
// the panel. A chip that lived in the panel could not be used above it.
//
// `hoverProps` is how a board gets to draw the word — the panel does not know
// what a board is, so it takes the handlers and spreads them here.
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check } from 'lucide-react';

export default function WordChip({
  word,
  className,
  children,
  hoverProps,
}: {
  word: string;
  className: string;
  children?: ReactNode;
  hoverProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      {...hoverProps}
      onClick={() => {
        navigator.clipboard.writeText(word).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        });
      }}
      title="Click to copy"
      className={`px-3 py-2.5 rounded-lg text-center text-lg tracking-wide transition-colors ${className}`}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300 text-base font-medium">
          <Check className="w-4 h-4" /> Copied
        </span>
      ) : (
        children ?? word
      )}
    </button>
  );
}
