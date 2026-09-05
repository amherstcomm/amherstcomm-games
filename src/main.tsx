import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { refreshSettings, setting } from '@/settings';
import { wireOfficeZone } from '@/schedule';
import './index.css';

// schedule.ts cannot import settings.ts — settings.ts imports it, for the
// fallback — so the lookup is handed in here instead of reached for there.
wireOfficeZone(() => setting('office_zone'));

// Not awaited, deliberately. The page paints from the build value and whatever
// this browser saw last time; the answer lands a moment later and moves nothing
// unless it disagrees. Blocking the first paint on a network call would trade a
// rare flicker for a guaranteed wait, and for a white screen whenever the
// database is the thing that is down.
void refreshSettings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
