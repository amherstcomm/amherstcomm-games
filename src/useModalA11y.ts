import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Standard dialog keyboard behavior: focus moves into the dialog on open,
// Tab cycles within it instead of escaping to the page behind, Escape
// closes, and focus returns to whatever opened it. The dialog element needs
// tabIndex={-1} so it can receive that initial focus.
//
// `onClose` is held in a ref rather than depended on, and that is not tidying.
// Depending on it meant any parent that re-rendered while the dialog was open
// — which is every parent holding a field's state — tore the effect down and
// set it up again, and teardown *returns focus to the opener*. The visible
// result was a text field that lost focus after every single character, in a
// dialog whose own author had done nothing wrong. A hook that only works when
// its caller memoises is a hook that will be used incorrectly.
export function useModalA11y(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true
): void {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // the opener may be gone (e.g. a button that unmounted) — ignore then
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [ref, enabled]);
}
