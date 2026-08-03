import { useRef } from 'react';
import { X } from 'lucide-react';
import KeyDiagram from '@/KeyDiagram';
import type { NavKeys } from '@/storage';
import { useModalA11y } from '@/useModalA11y';

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-white/10 border border-white/20 text-[0.6875rem] font-mono font-semibold text-slate-200 whitespace-nowrap">
      {children}
    </kbd>
  );
}

function Row({ keys, children }: { keys: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="flex flex-wrap gap-1 shrink-0 w-[8.5rem]">
        {keys.map((k, i) => (
          <Key key={i}>{k}</Key>
        ))}
      </span>
      <span className="text-sm text-slate-400 flex-1">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-accent uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function KeyboardHelp({
  navKeys,
  onClose,
}: {
  navKeys: NavKeys;
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
        aria-label="Keyboard controls"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-slate-900 border border-white/10 p-6 sm:p-8 text-left shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-bold mb-1">Keyboard controls</h2>
        <p className="text-xs text-slate-500 mb-5">
          Everything here is playable without a mouse.
        </p>

        <div className="space-y-5">
          <Section title="Getting around">
            <Row keys={['Tab', '⇧ Tab']}>
              Move between controls. The very first Tab offers “Skip to content”, which
              jumps past the mode tabs to the puzzle.
            </Row>
            <Row keys={['Enter', 'Space']}>Activate the focused button.</Row>
            <Row keys={['Esc']}>Close whichever dialog is open.</Row>
          </Section>

          <Section title="Typing games">
            <p className="text-xs text-slate-500 mb-1">
              Guess the Word, Scramble, Hive, Boxed, and Grid all take typed words.
            </p>
            <Row keys={['A – Z']}>Add a letter to the current word.</Row>
            <Row keys={['Enter']}>Submit it.</Row>
            <Row keys={['⌫']}>
              Delete the last letter — in Boxed, once the word is empty this un-commits
              the previous word so you can rework the chain.
            </Row>
          </Section>

          <Section title="Weave board">
            <p className="text-xs text-slate-500 mb-2">
              Tab to the board — it&apos;s a single stop — then steer a cursor. Each cell
              you can reach shows its key in the corner.
            </p>
            <div className="flex items-start gap-3 mb-1">
              <KeyDiagram scheme={navKeys} />
              <span className="text-sm text-slate-400 flex-1">
                Move the cursor, diagonals included. Swap this ring between the number pad
                and <span className="font-mono">Q W E / A D / Z S X</span> in Settings.
              </span>
            </div>
            <Row keys={['↑', '↓', '←', '→']}>Move the cursor straight, in any scheme.</Row>
            <Row keys={['Enter']}>
              Start a word at the cursor, then submit it once it&apos;s three letters or
              more.
            </Row>
            <Row keys={['⌫']}>
              Step back one cell. Moving back onto the previous cell does the same.
            </Row>
            <Row keys={['Esc']}>Clear the word you&apos;re tracing and start over.</Row>
          </Section>

          <Section title="On-screen keyboard">
            <p className="text-sm text-slate-400">
              The keyboard button in the bottom-right corner opens a tappable keyboard,
              handy on a phone or when a physical one isn&apos;t around. While it&apos;s
              open, the device&apos;s own keyboard stays out of the way.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
