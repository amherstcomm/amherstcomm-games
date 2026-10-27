// Featured on the home page: what is there now, what is waiting or over and
// why, and putting something new there. Whoever runs a kind of thing may
// feature it -- the server says which kinds this reader may.
import { useCallback, useEffect, useRef, useState } from 'react';
import Waiting from '@/Waiting';
import {
  KIND_WORD,
  pictureLink,
  readFeaturesSheet,
  removeFeature,
  saveFeature,
  uploadFeaturePicture,
  type Choice,
  type FeatureForm,
  type FeatureKind,
  type FeatureRow,
} from '@/featured';

const KINDS: FeatureKind[] = ['session', 'giveaway', 'contest', 'tournament'];
const FIELD = 'w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 text-sm text-slate-200';
const BUTTON =
  'inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';

/** A timestamp as a datetime-local field holds it. */
function localInput(t: string | null): string {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const when = (t: string) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

type Sheet = { can: Record<FeatureKind, boolean>; features: FeatureRow[]; choices: Record<FeatureKind, Choice[]> };

export default function AdminFeatured() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [refused, setRefused] = useState('');
  const [editing, setEditing] = useState<FeatureForm | null>(null);

  const load = useCallback(async () => {
    const got = await readFeaturesSheet();
    if (!got.ok) return setRefused(got.reason === 'not allowed' ? 'Featuring things is for the people who run them.' : got.reason);
    setSheet(got);
  }, []);
  useEffect(() => void load(), [load]);

  if (refused) return <p className="text-sm text-slate-400">{refused}</p>;
  if (!sheet) return <Waiting what="what is featured" onRetry={() => void load()} />;
  const allowed = KINDS.filter((k) => sheet.can[k]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Cards at the top of the home page, in the order below. Each goes by itself when its dates pass
        or the thing is over: a session closed, a giveaway drawn, a contest past voting, a tournament ended.
      </p>

      {editing ? (
        <Editor sheet={sheet} start={editing} allowed={allowed}
                onDone={() => {
                  setEditing(null);
                  void load();
                }} />
      ) : (
        allowed.length > 0 && (
          <button type="button" className={PRIMARY}
                  onClick={() => setEditing({ kind: allowed[0], ref: '', blurb: '', image: null, startsAt: '', endsAt: '',
                                              position: sheet.features.length })}>
            Feature something
          </button>
        )
      )}

      {sheet.features.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing is featured.</p>
      ) : (
        <ul className="space-y-3" aria-label="Featured">
          {sheet.features.map((f) => (
            <Row key={f.id} f={f} mine={sheet.can[f.kind]}
                 onEdit={() => setEditing({ kind: f.kind, ref: f.ref, blurb: f.blurb, image: f.image,
                                            startsAt: localInput(f.starts_at), endsAt: localInput(f.ends_at),
                                            position: f.position })}
                 onRemoved={() => void load()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ f, mine, onEdit, onRemoved }: { f: FeatureRow; mine: boolean; onEdit: () => void; onRemoved: () => void }) {
  const [said, setSaid] = useState('');
  return (
    <li className="rounded-xl border border-white/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-sm font-semibold text-slate-200 break-words">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent mr-2">{KIND_WORD[f.kind]}</span>
          {f.title ?? 'Gone'}
        </p>
        <p className={`text-xs ${f.showing ? 'text-emerald-300' : 'text-slate-400'}`}>
          {f.showing ? 'On the home page' : `Not showing: ${f.why_not}`}
        </p>
      </div>
      {f.blurb && <p className="text-xs text-slate-300 mt-1 break-words">{f.blurb}</p>}
      <p className="text-xs text-slate-500 mt-1">
        {f.starts_at ? `From ${when(f.starts_at)}` : 'From now'} · {f.ends_at ? `until ${when(f.ends_at)}` : 'until it is over'}
        {f.image && ' · with a picture'} · position {f.position}
      </p>
      {mine && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-accent hover:underline" onClick={onEdit}>Change</button>
          <button type="button" className="text-rose-300 hover:underline"
                  aria-label={`Stop featuring ${f.title ?? 'this'}`}
                  onClick={async () => {
                    const res = await removeFeature(f.id);
                    if (!res.ok) return setSaid(res.reason);
                    onRemoved();
                  }}>
            Stop featuring
          </button>
        </div>
      )}
      {said && <p className="text-xs text-rose-300 mt-1">{said}</p>}
    </li>
  );
}

function Editor({
  sheet,
  start,
  allowed,
  onDone,
}: {
  sheet: Sheet;
  start: FeatureForm;
  allowed: FeatureKind[];
  onDone: () => void;
}) {
  const [form, setForm] = useState<FeatureForm>(start);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof FeatureForm>(k: K, v: FeatureForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const existing = sheet.features.some((f) => f.kind === start.kind && f.ref === start.ref && start.ref);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    if (form.image) void pictureLink(form.image).then((u) => alive && setPreview(u));
    return () => {
      alive = false;
    };
  }, [form.image]);

  const choices = sheet.choices[form.kind] ?? [];

  return (
    <section className="rounded-xl border border-white/15 p-4 space-y-3" aria-label="Feature something">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          What kind
          <select className={`${FIELD} mt-1`} value={form.kind} disabled={!!existing}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as FeatureKind, ref: '' }))}>
            {allowed.map((k) => <option key={k} value={k}>{KIND_WORD[k]}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Which one
          <select className={`${FIELD} mt-1`} value={form.ref} disabled={!!existing}
                  onChange={(e) => set('ref', e.target.value)}>
            <option value="">Choose…</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.state})</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-400">
        A line of your own (optional, up to 200 characters)
        <input className={`${FIELD} mt-1`} maxLength={200} value={form.blurb}
               placeholder="e.g. Win Bucks tickets: answer five questions"
               onChange={(e) => set('blurb', e.target.value)} />
      </label>
      <div className="space-y-2">
        <p className="text-xs text-slate-400">A picture (optional; cropped to a wide 16:9)</p>
        {preview && <img src={preview} alt="The card's picture" className="w-full max-w-sm aspect-[16/9] object-cover rounded-lg" />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={busy} onClick={() => file.current?.click()}>
            {form.image ? 'Change the picture' : 'Add a picture'}
          </button>
          {form.image && (
            <button type="button" className={BUTTON} disabled={busy} onClick={() => set('image', null)}>
              No picture
            </button>
          )}
        </div>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Card picture"
               onChange={async (e) => {
                 const f = e.target.files?.[0];
                 e.target.value = '';
                 if (!f) return;
                 setBusy(true);
                 const up = await uploadFeaturePicture(f);
                 setBusy(false);
                 if (!up.ok) return setSaid(up.reason);
                 set('image', up.path);
               }} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-slate-400">
          From (empty for now)
          <input className={`${FIELD} mt-1`} type="datetime-local" value={form.startsAt}
                 onChange={(e) => set('startsAt', e.target.value)} />
        </label>
        <label className="block text-xs text-slate-400">
          Until (empty for until it is over)
          <input className={`${FIELD} mt-1`} type="datetime-local" value={form.endsAt}
                 onChange={(e) => set('endsAt', e.target.value)} />
        </label>
        <label className="block text-xs text-slate-400">
          Position (lowest first)
          <input className={`${FIELD} mt-1`} type="number" value={form.position}
                 onChange={(e) => set('position', Number(e.target.value))} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !form.ref}
                onClick={async () => {
                  setBusy(true);
                  const res = await saveFeature(form);
                  setBusy(false);
                  if (!res.ok) return setSaid(res.reason);
                  onDone();
                }}>
          {existing ? 'Save' : 'Feature it'}
        </button>
        <button type="button" className={BUTTON} onClick={onDone}>Cancel</button>
      </div>
      {said && <p className="text-xs text-rose-300" role="status">{said}</p>}
    </section>
  );
}
