import { createContext, useContext } from 'react';

// Invisible input overlaid on a game's entry box so tapping it summons the
// phone's native keyboard. Play modes otherwise type via a document keydown
// listener, which only physical keyboards fire. A one-space sentinel value
// makes soft-keyboard backspace observable (many fire no usable keydown).
const SENTINEL = ' ';

// true while the site's on-screen keyboard is open — then the native
// keyboard stays suppressed, exactly like the solver tiles
export const OskContext = createContext(false);

export default function MobileKeyInput({
  onKey,
  label = 'Type your word',
}: {
  onKey: (k: string) => void;
  label?: string;
}) {
  const osk = useContext(OskContext);
  return (
    <input
      inputMode={osk ? 'none' : undefined}
      value={SENTINEL}
      onChange={(e) => {
        const v = e.target.value;
        if (v.length < SENTINEL.length) {
          onKey('backspace');
          return;
        }
        const c = v.replace(SENTINEL, '').toLowerCase().slice(-1);
        if (/^[a-z]$/.test(c)) onKey(c);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onKey('enter');
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          onKey('backspace');
        }
      }}
      autoCapitalize="none"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="go"
      aria-label={label}
      className="absolute inset-0 w-full h-full opacity-0 cursor-text"
    />
  );
}
