// Preferences the games need but App has no other reason to hand them.
//
// A context rather than six more props: every game would take the same value,
// pass it nowhere, and use it once. PaletteContext exists for the same reason.

import { createContext, useContext } from 'react';

export type Prefs = {
  /** false hides every Daily/Practice switch and pins the games to the daily */
  practiceAllowed: boolean;
  /** Whether picking a mark on a cryptogram lights up every other copy of it.
   *
   *  On by default. The marks are printed on the board either way, so this
   *  spares the scanning rather than revealing anything — but seeing a mark's
   *  spread at a glance is part of frequency analysis, which is why solvers
   *  disagree about it and why this is a choice rather than a decision. */
  highlightMatches: boolean;
};

export const DEFAULT_PREFS: Prefs = { practiceAllowed: true, highlightMatches: true };

export const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

export const usePrefs = () => useContext(PrefsContext);
