// Whether the reader may take somebody's picture down: users.manage, asked once
// a page load however many pictures ask.
import { useEffect, useState } from 'react';
import { allows, myCapabilities } from '@/roles';

let asked: Promise<boolean> | null = null;

export function useCanTakeDown(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let alive = true;
    asked ??= myCapabilities().then((held) => allows(held, 'users.manage'));
    void asked.then((yes) => alive && setCan(yes));
    return () => {
      alive = false;
    };
  }, []);
  return can;
}
