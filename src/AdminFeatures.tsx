// What this deployment is offering, and from when.
//
// Ten games, four ways to play each, three difficulties. The list of what
// exists comes from src/games.ts rather than from the database, which stores
// only the exceptions — so a game nobody has touched shows as on without a row
// saying so, and adding an eleventh game does not need a migration.
//
// A switch and a window, because they answer different questions. Most of these
// will only ever be switched, and asking somebody to reason about dates to turn
// one game off would be the form getting in the way. The window is for the one
// thing an event actually wants: a game a week, appearing on its own.
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ALL_SLUGS, ALL_VIEWS, SLUG_NAME, gameFeature } from '@/games';
import { DIFFICULTIES } from '@/difficulty';
import { refreshAvailability } from '@/availability';
import { readFeatureWindows, setFeatureWindow, type FeatureWindow } from '@/features';
import { fromOfficeInput, toOfficeInput } from '@/schedule';

const FIELD =
  'rounded-lg bg-white/5 border border-white/15 px-2 py-1 text-xs text-slate-100 ' +
  'focus:outline-none focus:border-accent';

type Row = { feature: string; label: string };

/** The one refusal worth translating.
 *
 *  PostgREST answers a call to a function that does not exist with a schema-cache
 *  message about `public.feature_windows_sheet`, which is true and tells nobody
 *  what to do. It means the database has not caught up with the build, which is
 *  a two-word instruction rather than a mystery. */
function explain(reason: string): string {
  return /schema cache|does not exist|not find the function/i.test(reason)
    ? 'This needs supabase/schema.sql re-running — the database has not caught up with this build yet.'
    : reason;
}

/** Everything that can be switched, in the order somebody thinks about it. */
function everything(): { heading: string; rows: Row[] }[] {
  return [
    {
      heading: 'Games',
      // By slug, which is what the site filters on and what the address bar
      // uses. Keyed by mode first, and the three games whose mode has a
      // different name — guess/pattern, scramble/descramble, hive/bee — could
      // be switched off and stayed on screen.
      rows: ALL_SLUGS.map((slug) => ({ feature: gameFeature(slug), label: SLUG_NAME[slug] })),
    },
    {
      heading: 'Ways to play',
      // The views have no display names anywhere — they are the words on the
      // tabs — so the slug is the label.
      rows: ALL_VIEWS.map((v) => ({ feature: `view:${v}`, label: v })),
    },
    {
      heading: 'Difficulties',
      rows: DIFFICULTIES.map((d) => ({ feature: `difficulty:${d}`, label: d })),
    },
    {
      // Not a game and not a way of playing one. A deployment may want the quiz
      // and nothing else — every game off and sessions alone is a real thing to
      // run during an event — or the games and no quiz.
      heading: 'The rest of the site',
      rows: [{ feature: 'site:sessions', label: 'Sessions and joining' }],
    },
  ];
}

function Switch({
  row,
  set,
  onChanged,
  note,
}: {
  row: Row;
  set: FeatureWindow | undefined;
  onChanged: (feature: string, next: Partial<FeatureWindow>) => void;
  note: string;
}) {
  // No row means available, which is what makes an empty table the ordinary
  // state — so "nothing set" reads as on rather than as unknown.
  const enabled = set?.enabled ?? true;
  const startsAt = set?.starts_at ?? null;
  const endsAt = set?.ends_at ?? null;

  return (
    <li className="rounded-lg border border-white/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={`Offer ${row.label}`}
            onChange={(e) => onChanged(row.feature, { enabled: e.target.checked })}
          />
          {row.label}
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <label className="flex items-center gap-1">
            from
            <input
              type="datetime-local"
              className={FIELD}
              aria-label={`${row.label} from`}
              value={toOfficeInput(startsAt)}
              onChange={(e) =>
                onChanged(row.feature, { starts_at: fromOfficeInput(e.target.value)?.toISOString() ?? null })
              }
            />
          </label>
          <label className="flex items-center gap-1">
            until
            <input
              type="datetime-local"
              className={FIELD}
              aria-label={`${row.label} until`}
              value={toOfficeInput(endsAt)}
              onChange={(e) =>
                onChanged(row.feature, { ends_at: fromOfficeInput(e.target.value)?.toISOString() ?? null })
              }
            />
          </label>
        </div>
      </div>
      {/* Said rather than left to be worked out: a window that has not opened
          reads as "switched on and missing" otherwise. */}
      {enabled && startsAt && new Date(startsAt) > new Date() && (
        <p className="text-xs text-accent mt-1">Not offered until then.</p>
      )}
      {enabled && endsAt && new Date(endsAt) <= new Date() && (
        <p className="text-xs text-accent mt-1">No longer offered.</p>
      )}
      {note && <p className="text-xs text-rose-300 mt-1">{note}</p>}
    </li>
  );
}

export default function AdminFeatures() {
  const [set, setSet] = useState<Record<string, FeatureWindow> | null>(null);
  const [refused, setRefused] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const pull = useCallback(async () => {
    const res = await readFeatureWindows();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setSet({});
      return;
    }
    setRefused('');
    setSet(Object.fromEntries((res.features ?? []).map((f) => [f.feature, f])));
  }, []);
  useEffect(() => void pull(), [pull]);

  async function change(feature: string, next: Partial<FeatureWindow>) {
    const now = set?.[feature];
    const merged: FeatureWindow = {
      feature,
      enabled: next.enabled ?? now?.enabled ?? true,
      starts_at: next.starts_at !== undefined ? next.starts_at : (now?.starts_at ?? null),
      ends_at: next.ends_at !== undefined ? next.ends_at : (now?.ends_at ?? null),
    };
    const res = await setFeatureWindow(merged);
    setNotes((n) => ({ ...n, [feature]: res.ok ? '' : (res.reason ?? 'That did not work') }));
    if (!res.ok) return;
    await pull();
    // The rest of the site reads a separate store; without this the menu above
    // this very form keeps offering what was just switched off.
    await refreshAvailability();
  }

  // The heading first, always. This used to return the refusal on its own, so a
  // section that could not load rendered as a stray line of grey text with no
  // title — which reads as the panel not being there at all rather than as the
  // panel being unavailable. Reported exactly that way: "did you forget to wire
  // it in? it's legit not there."
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">What is on offer</h2>
      <p className="text-sm text-slate-400 mb-4">
        Everything is on unless you say otherwise. Times are the company&rsquo;s,
        and something switched off is gone from the menu and from its own
        address. Switching every game off is allowed — the site then offers
        sessions and nothing else.
      </p>

      {set === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
      {refused && <p className="text-sm text-rose-300">{explain(refused)}</p>}
      {set !== null && !refused && (

      <div className="space-y-5">
          {everything().map((group) => (
            <div key={group.heading}>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                {group.heading}
              </p>
              <ul className="space-y-2">
                {group.rows.map((row) => (
                  <Switch
                    key={row.feature}
                    row={row}
                    set={set[row.feature]}
                    note={notes[row.feature] ?? ''}
                    onChanged={change}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
