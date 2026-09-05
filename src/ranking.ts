// Dragging one thing into a different place in a list.
//
// The two decisions are here rather than in the component because both are
// arithmetic with edges, and neither needs a browser to be wrong: where a list
// ends up after something is moved, and which row the finger is currently over.
//
// Pointer events rather than the HTML5 drag-and-drop API, which is what makes
// this arithmetic ours to do. `dragstart` does not fire on most mobile
// browsers, and this is a question people answer on a phone.

/** The list with the item at `from` moved to `to`.
 *
 *  A move, not a swap. The buttons beside each row swap with a neighbour, which
 *  is the same thing when the two are adjacent and a different thing entirely
 *  when they are not — dragging the top item to the bottom should push
 *  everything else up one, not exchange the ends. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  // Clamped after the removal, because the valid destinations are the places in
  // the shorter list: dropping past the end lands on the end.
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** Which row a pointer at `y` is over, given each row's vertical midpoint in
 *  the order they are drawn.
 *
 *  Midpoints rather than edges: an item crosses into the next place when it
 *  passes the *middle* of the row it is displacing, which is the point at which
 *  the two have visibly swapped. Using edges makes the list flicker between two
 *  arrangements while a finger sits on a boundary.
 *
 *  Empty means there is nothing to be over, and -1 says so rather than 0, which
 *  would be a real position. */
export function rowAt(midpoints: number[], y: number): number {
  if (midpoints.length === 0) return -1;
  let index = 0;
  for (const m of midpoints) {
    if (y > m) index += 1;
  }
  return Math.min(index, midpoints.length - 1);
}
