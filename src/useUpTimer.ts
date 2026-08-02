import { useEffect, useRef, useState } from 'react';

// Accumulates elapsed time while `active` is true and the tab is visible.
// Calls commit(deltaMs) roughly every second and flushes the partial second
// on pause/unmount, so time only counts while the player can actually see
// the board — it stops when they tab away and resumes when they come back.
export function useUpTimer(active: boolean, commit: (deltaMs: number) => void) {
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden
  );
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const running = active && visible;
  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      commitRef.current(now - last);
      last = now;
    }, 1000);
    return () => {
      window.clearInterval(id);
      commitRef.current(Date.now() - last);
    };
  }, [running]);
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
