// Where the app is, as one value instead of nine booleans.
//
// It was nine `useState`s and a priority ladder: legal beats stats beats
// settings beats account beats panel beats the report pages beats home beats
// the game. Nothing stopped two of them being true at once, and the ladder
// picked a winner — which meant the address depended on an order written in one
// place and the rendering on booleans read in twenty.
//
// Then it was a page with a stack of overlays on it: Stats, Settings, Account,
// Legal, About and Keys were panels over the game, and the consent banner could
// open Legal over Settings. Since the layout spec (November 2026) every one of
// them is a page of its own, and the banner links nowhere -- so there is one
// thing: the page you are on, and the tab each tabbed page was last left on.

import type {
  AccountTab,
  AdminTab,
  GiveawayView,
  LegalDoc,
  Panel,
  Route,
  SettingsTab,
  Slug,
  StatsTab,
  View,
} from '@/routes';

export type Page =
  | { kind: 'home' }
  /** which game, and how, is App's business — see GameCtx */
  | { kind: 'game' }
  | { kind: 'ticket'; ticket: string }
  | { kind: 'reportAction'; id: string; token: string; action: string }
  | { kind: 'reportQueue' }
  | { kind: 'tournament'; slug: Slug | null }
  | { kind: 'contest'; contest: string | null }
  | { kind: 'giveaways'; giveaway: string | null; view: GiveawayView }
  | { kind: 'auctions'; auction: string | null }
  | { kind: 'whiteboard'; question: string | null }
  | { kind: 'recognition' }
  | { kind: 'suggestions' }
  | { kind: 'live'; session: string; host: boolean }
  | { kind: 'sessions'; session?: string }
  | { kind: 'admin'; tab: AdminTab }
  | { kind: 'join'; code?: string }
  | { kind: 'scores'; session: string }
  // Pages since the layout spec (November 2026), each with its own address,
  // where they were panels over the game.
  | { kind: 'stats'; tab: StatsTab }
  | { kind: 'panel'; panel: Panel }
  | { kind: 'settings'; tab: SettingsTab }
  | { kind: 'account'; tab: AccountTab }
  | { kind: 'legal'; doc: LegalDoc };

/** The tab each tabbed page was last left on. They remember, and leaving one
 *  does not forget — going back to Stats after visiting Boards shows Boards.
 *  That was an accident of `applyRoute` leaving tab state alone, and it is
 *  worth keeping, so it is stated here instead. */
export type Tabs = {
  stats: StatsTab;
  settings: SettingsTab;
  account: AccountTab;
  legal: LegalDoc;
  // A page rather than an overlay, and remembered for the same reason: an
  // administrator halfway through writing a month leaves for the site and comes
  // back to the word lists, not to the first tab.
  admin: AdminTab;
};

export type Nav = { page: Page; last: Tabs };

/** What the game underneath is showing. App owns this — `mode` is read at
 *  ninety-odd sites and persisted, so it does not move. */
export type GameCtx = { slug: Slug; view: View; daily: boolean };

export const DEFAULT_TABS: Tabs = {
  stats: 'overall',
  settings: 'site',
  account: 'personal',
  legal: 'notices',
  admin: 'site',
};

/** The address, from the state: the page, with the game's details when it is
 *  a game. */
export function routeOf(nav: Nav, game: GameCtx): Route {
  return nav.page.kind === 'game' ? { kind: 'game', ...game } : nav.page;
}

/** What visiting a page teaches the tabs it remembers. */
function remember(last: Tabs, p: Page): Tabs {
  switch (p.kind) {
    case 'stats':
      return { ...last, stats: p.tab };
    case 'settings':
      return { ...last, settings: p.tab };
    case 'account':
      return { ...last, account: p.tab };
    case 'legal':
      return { ...last, legal: p.doc };
    case 'admin':
      return { ...last, admin: p.tab };
    default:
      return last;
  }
}

/** The state, from an address. The other half of the pair, so the two can be
 *  checked against each other rather than trusted to agree.
 *
 *  `friend` is inbound only — it opens the account panel on its friends tab and
 *  the address corrects itself, which is why `routeOf` never emits one. */
export function navOf(route: Route, last: Tabs = DEFAULT_TABS): { nav: Nav; game: GameCtx | null } {
  const page = (p: Page): Nav => ({ page: p, last: remember(last, p) });

  switch (route.kind) {
    case 'home':
      return { nav: page({ kind: 'home' }), game: null };
    case 'game':
      return {
        nav: page({ kind: 'game' }),
        game: { slug: route.slug, view: route.view, daily: route.daily },
      };
    case 'ticket':
      return { nav: page({ kind: 'ticket', ticket: route.ticket }), game: null };
    case 'reportAction':
      return {
        nav: page({ kind: 'reportAction', id: route.id, token: route.token, action: route.action }),
        game: null,
      };
    case 'reportQueue':
      return { nav: page({ kind: 'reportQueue' }), game: null };
    case 'live':
      return {
        nav: page({ kind: 'live', session: route.session, host: route.host }),
        game: null,
      };
    case 'panel':
      return { nav: page({ kind: 'panel', panel: route.panel }), game: null };
    case 'stats':
      return { nav: page({ kind: 'stats', tab: route.tab }), game: null };
    case 'settings':
      return { nav: page({ kind: 'settings', tab: route.tab }), game: null };
    case 'account':
      return { nav: page({ kind: 'account', tab: route.tab }), game: null };
    case 'legal':
      return { nav: page({ kind: 'legal', doc: route.doc }), game: null };
    case 'sessions':
      return { nav: page({ kind: 'sessions', session: route.session }), game: null };
    // A page either way. With a game named, App renders that game inside the
    // round's channel; without one, the round's own page. Neither is a game
    // route, because neither is the daily and the address bar should not say
    // it is.
    case 'tournament':
      return { nav: page({ kind: 'tournament', slug: route.slug }), game: null };
    case 'contest':
      return { nav: page({ kind: 'contest', contest: route.contest }), game: null };
    case 'giveaways':
      return { nav: page({ kind: 'giveaways', giveaway: route.giveaway, view: route.view }), game: null };
    case 'auctions':
      return { nav: page({ kind: 'auctions', auction: route.auction }), game: null };
    case 'whiteboard':
      return { nav: page({ kind: 'whiteboard', question: route.question }), game: null };
    case 'recognition':
      return { nav: page({ kind: 'recognition' }), game: null };
    case 'suggestions':
      return { nav: page({ kind: 'suggestions' }), game: null };
    case 'admin':
      return { nav: page({ kind: 'admin', tab: route.tab }), game: null };
    case 'join':
      return { nav: page({ kind: 'join', code: route.code }), game: null };
    case 'scores':
      return { nav: page({ kind: 'scores', session: route.session }), game: null };
    case 'friend':
      return { nav: page({ kind: 'account', tab: 'friends' }), game: null };
  }
  // Unreachable, and that is the point: `route` is `never` here only while
  // every kind is handled above, so adding one to Route without adding it here
  // fails to compile.
  //
  // It did not, once. `sessions` was added to Route, parsePath and pathOf, all
  // three typechecked, and navOf fell out of the bottom returning undefined —
  // so the address did not render wrong, it took the whole application down
  // with "cannot destructure property 'nav'". tsc allows a switch to fall
  // through a missing case because noImplicitReturns is off, and the round-trip
  // test in routes.test.ts covers pathOf against parsePath, neither of which is
  // this function. Nothing in the repo would have caught it; a blank page did.
  return assertNever(route);
}

function assertNever(route: never): never {
  throw new Error(`unhandled route: ${JSON.stringify(route)}`);
}

export type NavAction =
  /** the browser moved first — Back, Forward, or a typed address */
  | { type: 'apply'; route: Route }
  | { type: 'page'; page: Page };

export function navReducer(nav: Nav, action: NavAction): Nav {
  switch (action.type) {
    case 'apply': {
      // A route names one place. Tabs are kept: arriving at /stats/boards
      // should not forget which settings tab you were on, and `applyRoute`
      // never did.
      return navOf(action.route, nav.last).nav;
    }
    case 'page':
      return { ...nav, page: action.page, last: remember(nav.last, action.page) };
  }
}
