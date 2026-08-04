// Preferences the games need but App has no other reason to hand them.
//
// A context rather than six more props: every game would take the same value,
// pass it nowhere, and use it once. PaletteContext exists for the same reason.

import { createContext, useContext } from 'react';

export type Prefs = {
  /** false hides every Daily/Practice switch and pins the games to the daily */
  practiceAllowed: boolean;
};

export const DEFAULT_PREFS: Prefs = { practiceAllowed: true };

export const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

export const usePrefs = () => useContext(PrefsContext);
