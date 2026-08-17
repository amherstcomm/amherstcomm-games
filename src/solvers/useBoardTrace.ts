// Hovering a result draws it back onto the board.
//
// Three solvers do this: Grid and Weave draw a path through adjacent cells,
// Boxed draws criss-cross chords between sides. It was written twice in
// App.tsx — once for the shared grid/weave path and once for boxed — with the
// same skeleton: a piece of state saying
// what is traced, a set of measured points, a ref to the board, a layout effect
// turning one into the other, and five pointer handlers. Only two things
// actually differed: what "traced" means, and how it is measured.
//
// So that is what the hook takes. Everything else was duplicated, including the
// bug-shaped part: `centreOf` appeared twice with the same rect arithmetic, and
// a fix to one would not have reached the other.
//
// This lives beside the solvers rather than inside the shared results panel,
// even though the panel is what raises the hover. The panel's job is to list
// words; the trace belongs to the board that can draw it. Putting it in the
// panel is what made Weave and Grid inseparable from a component that has
// nothing to do with either.
//
// It also removes a live hazard. Grid and Weave shared one `gridBoardRef`
// between two different JSX blocks — safe only because exactly one is ever
// mounted, which nothing stated and nothing checked. One hook instance per
// board makes that structural instead of circumstantial.
import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';

export type Pt = { x: number; y: number };

/** A tile's centre, relative to the board box rather than the viewport, because
 *  the overlay that draws the trace is positioned against the board. */
export function centreOf(el: Element, board: DOMRect): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - board.left, y: r.top + r.height / 2 - board.top };
}

/** Show on hover, hide on leave — and the same on touch, where hover does not
 *  exist and a press-hold is the nearest thing a finger can say.
 *
 *  `onPointerCancel` is the one that is easy to leave out and hard to notice
 *  missing: a press that turns into a scroll fires cancel and never fires up,
 *  so without it the trace would stay drawn. Carried over from the original
 *  rather than added here — noted because the reason was not written down. */
export function hoverHandlers(
  show: () => void,
  hide: () => void
): ButtonHTMLAttributes<HTMLButtonElement> {
  return {
    onMouseEnter: show,
    onMouseLeave: hide,
    onPointerDown: show,
    onPointerUp: hide,
    onPointerCancel: hide,
  };
}

/**
 * @param measure  what to draw for a target, given the board element. Returns a
 *                 list of polylines — one for a path, several for a chain of
 *                 words that each want their own colour.
 */
export function useBoardTrace<T>(measure: (target: T, board: HTMLDivElement) => Pt[][]) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<T | null>(null);
  const [points, setPoints] = useState<Pt[][]>([]);

  // Layout effect, not effect: this reads geometry, and doing it after paint
  // shows one frame of the trace in the wrong place on a board that just
  // resized.
  useLayoutEffect(() => {
    if (target === null || !boardRef.current) {
      setPoints([]);
      return;
    }
    setPoints(measure(target, boardRef.current));
    // `measure` is a fresh closure each render — depending on it would remeasure
    // every render and defeat the point. The caller re-hovers to remeasure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const clear = () => setTarget(null);

  return {
    boardRef,
    /** what is being traced right now, or null — boards use this to tint tiles */
    target,
    /** one polyline per drawn word, in board-relative coordinates */
    points,
    handlersFor: (t: T) => hoverHandlers(() => setTarget(t), clear),
    clear,
  };
}
