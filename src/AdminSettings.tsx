// The knobs a deployment turns without rebuilding itself.
//
// Deliberately plain. This is a page one person visits about twice a year, and
// the useful things it can be are honest about what is set, clear about what
// happens when a field is empty, and impossible to break the site from — which
// is why the refusals come from the server and are printed verbatim rather than
// being pre-empted here. A form that validates client-side and a server that
// validates properly disagree eventually, and the one people see is the wrong
// one.
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { readSiteSettings, setSiteSetting, type SettingRow } from '@/settingsAdmin';
import { refreshSettings } from '@/settings';
import { ADMIN_TABS, ADMIN_TITLE, pathOf, type AdminTab } from '@/routes';
import RouteLink from '@/RouteLink';
import AdminPeople from '@/AdminPeople';
import AdminWordLists from '@/AdminWordLists';
import AdminFeatures from '@/AdminFeatures';
import AdminWeaveThemes from '@/AdminWeaveThemes';
import AdminPassages from '@/AdminPassages';
import AdminPins from '@/AdminPins';
import ThemeCoverage from '@/ThemeCoverage';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

/** What each field is, in the words of somebody about to change it — the
 *  server's `description` says what the key is *for*, which is a different
 *  sentence and a worse label. */
const LABEL: Record<string, string> = {
  subtitle: 'Event subtitle',
  announcement: 'Notice on the home page',
  contact_email: 'Contact address',
  office_zone: 'Company timezone',
};

/** What an empty field means. Every one of these is "nothing", and each is a
 *  different nothing — a page that says so is a page nobody has to test by
 *  emptying a box and reloading. */
const WHEN_EMPTY: Record<string, string> = {
  subtitle: 'Nothing under the site name.',
  announcement: 'No notice on the home page.',
  contact_email: 'The pages that would offer an address are written without one.',
  office_zone: 'Falls back to what the site was built with.',
};

const PLACEHOLDER: Record<string, string> = {
  subtitle: 'Employee Ownership Month',
  announcement: 'Round 3 opens Friday at noon',
  contact_email: 'games@amherstcomm.net',
  office_zone: 'America/Chicago',
};

function Field({ row, onSaved }: { row: SettingRow; onSaved: () => void }) {
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  // Somebody else's change, or this one landing: either way the row is the
  // truth and a field nobody is editing should show it.
  useEffect(() => setValue(row.value), [row.value]);

  const dirty = value.trim() !== row.value.trim();

  async function save() {
    setBusy(true);
    setNote('');
    const res = await setSiteSetting(row.key, value);
    setBusy(false);
    if (!res.ok) {
      // Printed as the server said it. It knows things this form does not —
      // which zone names the platform can resolve, for one.
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
    onSaved();
  }

  return (
    <div className="rounded-xl border border-white/15 p-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-200">
          {LABEL[row.key] ?? row.key}
        </span>
        <span className="block text-xs text-slate-400 mt-0.5 mb-2">{row.description}</span>
        <input
          className={FIELD}
          value={value}
          placeholder={PLACEHOLDER[row.key] ?? ''}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty && !busy) void save();
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button className={BUTTON} disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {row.value !== '' && (
          <button
            className={BUTTON}
            disabled={busy}
            onClick={() => {
              setValue('');
              void (async () => {
                setBusy(true);
                const res = await setSiteSetting(row.key, '');
                setBusy(false);
                if (!res.ok) setNote(res.reason ?? 'That did not work');
                else onSaved();
              })();
            }}
          >
            Clear
          </button>
        )}
        {saved && <span className="text-xs text-emerald-300">Saved</span>}
        {note && <span className="text-xs text-rose-300">{note}</span>}
      </div>

      <p className="text-xs text-slate-500 mt-3">
        {value.trim() === '' ? WHEN_EMPTY[row.key] : null}
        {row.updated_at && value.trim() !== '' ? (
          <>
            Set by {row.updated_by ?? 'somebody'} on{' '}
            {new Date(row.updated_at).toLocaleDateString()}.
          </>
        ) : null}
      </p>
    </div>
  );
}

/** The site's own settings: the half of this page that is a form. */
function SiteSettings() {
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [refused, setRefused] = useState('');

  const pull = useCallback(async () => {
    const res = await readSiteSettings();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setRows([]);
      return;
    }
    setRefused('');
    setRows(res.settings ?? []);
  }, []);
  useEffect(() => void pull(), [pull]);

  // Both, and in this order: the page's own list, and the store the rest of the
  // site reads. Without the second, changing the subtitle leaves the masthead
  // above this very form showing the old one until a reload.
  const afterSave = useCallback(() => {
    void pull();
    void refreshSettings();
  }, [pull]);

  if (rows === null) return <Loader2 className="w-4 h-4 animate-spin text-slate-500 m-8" />;
  if (refused) return <p className="text-sm text-slate-400">{refused}</p>;

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Site settings</h2>
      <p className="text-sm text-slate-400 mb-4">
        Changes take effect for everybody on their next page load. Nothing here
        needs a rebuild.
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <Field key={row.key} row={row} onSaved={afterSave} />
        ))}
      </div>
    </section>
  );
}

/** Which panel each tab draws. One table rather than a chain of conditionals,
 *  so a tab added to ADMIN_TABS and forgotten here fails to compile instead of
 *  rendering an empty page. */
const PANEL: Record<AdminTab, () => JSX.Element> = {
  site: SiteSettings,
  // Gated on games.setup rather than site.settings — an editor who can build a
  // session can write the words it draws from — and each panel draws its own
  // refusal, because a deployment is free to hand the capabilities out
  // separately and only the server knows which it did.
  games: AdminFeatures,
  lists: AdminWordLists,
  // Beside the word lists rather than inside them: a Weave theme is a set that
  // tiles a board, a word list is a bag of words, and making one shape serve
  // both made a worse version of each.
  weave: AdminWeaveThemes,
  // The cryptogram's own, and the only panel here whose content is prose: a
  // passage is a sentence rather than a set of words, and the thing it needs
  // said while it is being written is its length in letters.
  passages: AdminPassages,
  // Between the things a month is written from and the page that counts them:
  // it is the one surface where somebody looks at a single day rather than at a
  // list or at a range.
  pins: AdminPins,
  // After both, because it is about both: a month is themed by several lists
  // and several Weave themes with overlapping windows, and whether it is
  // covered is a question no single one of them can answer.
  coverage: ThemeCoverage,
  people: AdminPeople,
};

/**
 * Six jobs at one address, one at a time.
 *
 * It was one scroll: settings, then games, then lists, then themes, then
 * coverage, then people. Each is a page's worth on its own and the last of them
 * was two thousand pixels down — and every one of them fetches on mount, so
 * opening the page to change the subtitle also read every word list, every
 * theme and everybody's roles.
 *
 * The tab is in the address (`/admin/lists`) rather than in a piece of state,
 * for the reason the rest of the site already does it: one state, one address.
 * A month is written over several sittings, and "the word lists" has to be a
 * thing somebody can bookmark, send to the other administrator, and come back
 * to. The bare `/admin` still works and settles on the first tab.
 */
export default function AdminSettings({
  tab,
  // The address *and* the click, from one value — the routing hook lives in
  // App, and an anchor whose href and handler are worked out separately is four
  // links that disagree, which this codebase has already had.
  tabLink,
}: {
  tab: AdminTab;
  tabLink: (tab: AdminTab) => { to: string; onGo: () => void };
}) {
  const Panel = PANEL[tab];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        <a href={pathOf({ kind: 'home' })} className="hover:text-accent">
          Home
        </a>
      </p>
      <h1 className="text-2xl font-bold text-white mt-1 mb-4">Administration</h1>

      {/* Links rather than buttons: they are addresses, so they open in a new
          tab, they can be copied, and the back button walks them. */}
      <nav className="inline-flex flex-wrap rounded-xl bg-white/5 border border-white/10 p-1 gap-1 mb-6">
        {ADMIN_TABS.map((id) => (
          <RouteLink
            key={id}
            {...tabLink(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`px-3 h-9 inline-flex items-center rounded-lg text-sm font-semibold transition-colors
              ${tab === id ? 'bg-accent text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}
          >
            {ADMIN_TITLE[id]}
          </RouteLink>
        ))}
      </nav>

      {/* Keyed by the tab, so leaving one and coming back re-reads rather than
          showing what was true ten minutes ago — and so a half-typed list is
          not carried onto a different panel. */}
      <Panel key={tab} />
    </div>
  );
}
