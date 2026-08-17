// iOS Safari ignores inputmode="none" and raises its keyboard on focus anyway,
// stacking it on top of ours. The fields it affects have to stay focusable so
// the on-screen keyboard knows where to type, and read-only is the one state
// that keeps focus while reliably suppressing the device keyboard — writes
// still land, since the on-screen keyboard sets the value programmatically.
//
// Only on touch pointers, so a desktop user with the panel open can still type
// on a real keyboard. Read once at module load rather than through a media
// query listener: a pointer type does not change mid-session, and a device that
// gains a mouse still reports coarse.
//
// Its own module because two components need it — Tile and the letters field —
// and neither owns it. Exporting it from Tile.tsx would work and would cost a
// react-refresh warning for a non-component export, which is a real if small
// tax on every edit to that file.
export const COARSE_POINTER =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
