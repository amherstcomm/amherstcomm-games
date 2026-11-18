// The whiteboard page: this week's question, the board of who answered what,
// a box to suggest the next one, the weeks gone -- and, for whoever writes the
// questions, the writing.
import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import PersonFace, { PictureActions } from '@/PersonFace';
import { useCanTakeDown } from '@/useCanTakeDown';
import Waiting from '@/Waiting';
import RouteLink from '@/RouteLink';
import {
  answerChoice,
  answered,
  answerWords,
  deleteQuestion,
  dismissSuggestion,
  mondays,
  readBoard,
  readSheet,
  removeAnswer,
  saveQuestion,
  suggestQuestion,
  weekWord,
  withdrawAnswer,
  type Board,
  type BoardAnswer,
  type Question,
  type QuestionForm,
  type Sheet,
} from '@/whiteboard';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-4 h-9 rounded-lg text-sm font-semibold ' +
  'bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';
const CARD = 'rounded-xl border border-white/15 bg-white/5 p-4';
const LABEL = 'block text-xs font-semibold text-slate-400 mb-1';
const MAX_WORDS = 280;

export type WhiteboardLink = (p: { kind: 'whiteboard'; question: string | null }) => { to: string; onGo: () => void };

export default function WhiteboardView({ question, link }: { question: string | null; link: WhiteboardLink }) {
  const [board, setBoard] = useState<Board | null>(null);
  const load = useCallback(async () => setBoard(await readBoard(question)), [question]);
  useEffect(() => {
    setBoard(null);
    void load();
  }, [load]);

  if (!board) return <Waiting what="the whiteboard" onRetry={() => void load()} />;
  if (!board.ok) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-200">Whiteboard</h1>
        <p className="text-sm text-slate-400 mt-3">
          {board.reason === 'not signed in' ? 'Sign in to see this week’s question and answer it.' : 'The whiteboard did not load.'}
        </p>
      </div>
    );
  }

  const q = board.question ?? null;
  const manage = !!board.can_manage;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        {question && (
          <RouteLink {...link({ kind: 'whiteboard', question: null })} className="text-sm text-accent hover:brightness-110">
            ← This week
          </RouteLink>
        )}
        <h1 className="text-xl font-semibold text-slate-200 mt-1">Whiteboard</h1>
        <p className="text-sm text-slate-400">A question a week, to get to know each other a little.</p>
      </div>

      {q ? (
        <QuestionCard board={board} q={q} manage={manage} onChange={load} />
      ) : (
        <p className={`${CARD} text-sm text-slate-300`}>
          {question ? 'There is no such question.' : 'There is no question up this week. Suggest one below.'}
        </p>
      )}

      {manage && <Writer thisWeek={board.week_of ?? ''} onChange={load} />}

      <Suggest />

      {(board.past ?? []).length > 0 && (
        <section aria-label="Weeks gone">
          <h2 className="text-sm font-semibold text-slate-200">Weeks gone</h2>
          <ul className="mt-2 space-y-2">
            {board.past!.map((p) => (
              <li key={p.id}>
                <RouteLink
                  {...link({ kind: 'whiteboard', question: p.id })}
                  className="block rounded-xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10"
                >
                  <span className="block text-xs text-slate-400 first-letter:uppercase">
                    {weekWord(p.week_of)} · {p.answers} {p.answers === 1 ? 'answer' : 'answers'}
                  </span>
                  <span className="block text-sm font-semibold text-slate-200 mt-0.5">{p.prompt}</span>
                </RouteLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuestionCard({ board, q, manage, onChange }: { board: Board; q: Question; manage: boolean; onChange: () => Promise<void> }) {
  const mine = board.mine ?? null;
  const [changing, setChanging] = useState(false);
  const [words, setWords] = useState(mine?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const open = q.state === 'open';
  const asking = open && (!mine || changing);
  const count = board.count ?? 0;

  async function send(res: Promise<{ ok: boolean; reason?: string }>) {
    setBusy(true);
    const got = await res;
    setBusy(false);
    if (!got.ok) return setNote(got.reason ?? 'That did not go in');
    setNote(null);
    setChanging(false);
    await onChange();
  }

  return (
    <section className={CARD} aria-label="This week’s question">
      <p className="text-xs uppercase tracking-wider text-accent font-semibold first-letter:uppercase">
        {q.week_of ? weekWord(q.week_of) : 'Not scheduled'}
        {q.state === 'closed' && ' · over'}
        {q.state === 'later' && ' · not asked yet'}
      </p>
      <h2 className="text-2xl font-bold text-white mt-1 text-balance">{q.prompt}</h2>

      {asking && (
        <div className="mt-4">
          {q.kind === 'choice' ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Your answer">
              {q.options.map((o, n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  aria-pressed={mine?.choice === n}
                  className={`px-4 h-11 rounded-full text-sm font-semibold border transition ${
                    mine?.choice === n
                      ? 'bg-accent text-slate-950 border-accent'
                      : 'bg-white/5 border-white/20 text-slate-200 hover:bg-white/15'
                  } disabled:opacity-50`}
                  onClick={() => void send(answerChoice(q.id, n))}
                >
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!words.trim()) return setNote('Write an answer first.');
                void send(answerWords(q.id, words));
              }}
            >
              <label className="block">
                <span className={LABEL}>Your answer</span>
                <textarea className={FIELD} rows={3} maxLength={MAX_WORDS} value={words}
                          onChange={(e) => setWords(e.target.value)} />
              </label>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 tabular-nums">{words.length} / {MAX_WORDS}</span>
                <button type="submit" className={PRIMARY} disabled={busy}>
                  {mine ? 'Save my answer' : 'Answer'}
                </button>
              </div>
            </form>
          )}
          {changing && (
            <button type="button" className="text-xs text-accent hover:underline mt-3" onClick={() => setChanging(false)}>
              Keep my answer
            </button>
          )}
          {!mine && (
            <p className="text-sm text-slate-400 mt-3">
              {count > 0 ? `${answered(count)}. ` : 'Nobody has answered yet. '}Answer to see who said what.
            </p>
          )}
        </div>
      )}

      {note && <p className="text-sm text-rose-300 mt-3" role="status">{note}</p>}

      {mine && open && !changing && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-emerald-300 font-semibold">
            You said: {q.kind === 'choice' ? q.options[mine.choice ?? 0] : '“' + (mine.body ?? '') + '”'}
          </span>
          <button type="button" className="text-accent hover:underline" onClick={() => {
            setWords(mine.body ?? '');
            setChanging(true);
          }}>
            Change my answer
          </button>
          <button type="button" className="text-slate-400 hover:underline" disabled={busy}
                  onClick={() => window.confirm('Take your answer off the board?') && void send(withdrawAnswer(q.id))}>
            Take it back
          </button>
        </div>
      )}

      {board.answers && (
        <div className="mt-6">
          <p className="text-xs text-slate-400">{answered(board.answers.length)}.</p>
          {q.kind === 'choice' ? (
            <ChoiceBoard q={q} answers={board.answers} manage={manage} onChange={onChange} />
          ) : (
            <WordsBoard q={q} answers={board.answers} manage={manage} onChange={onChange} />
          )}
        </div>
      )}
      {q.ends_at && open && (
        <p className="text-xs text-slate-500 mt-4">Answers can change until the week ends, Sunday night.</p>
      )}
    </section>
  );
}

function TakeDown({ q, a, onChange }: { q: Question; a: BoardAnswer; onChange: () => Promise<void> }) {
  return (
    <button
      type="button"
      aria-label={`Take ${a.name}’s answer down`}
      title="Take it down"
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-rose-300 hover:bg-white/10"
      onClick={async () => {
        if (!window.confirm(`Take ${a.name}’s answer off the board?`)) return;
        const res = await removeAnswer(q.id, a.user);
        if (!res.ok) window.alert(res.reason ?? 'That did not work');
        await onChange();
      }}
    >
      <X className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}

/** One person on the board: their picture, which grows with their name above
 *  it on hover or a tap. Tapped, it carries what the reader may do: a writer
 *  takes the answer down; an administrator takes the picture down; anybody
 *  else can report the picture. */
function Face({ a, q, manage, admin, onChange }: {
  a: BoardAnswer; q: Question; manage: boolean; admin: boolean; onChange: () => Promise<void>;
}) {
  return (
    <PersonFace user={a.user} name={a.name} avatar={a.avatar}
                actions={(close) => (
                  <>
                    {manage && <TakeDown q={q} a={a} onChange={onChange} />}
                    <PictureActions user={a.user} name={a.name} avatar={a.avatar} admin={admin} close={close}
                                    onTakenDown={() => void onChange()} />
                  </>
                )} />
  );
}

/** The pictures of who picked each choice, grouped under it. */
function ChoiceBoard({ q, answers, manage, onChange }: { q: Question; answers: BoardAnswer[]; manage: boolean; onChange: () => Promise<void> }) {
  const total = answers.length || 1;
  const admin = useCanTakeDown();
  return (
    <ul className="mt-2 space-y-4">
      {q.options.map((o, n) => {
        const here = answers.filter((a) => a.choice === n);
        const share = Math.round((here.length / total) * 100);
        return (
          <li key={n} aria-label={`${o}: ${here.length}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-200">{o}</h3>
              <span className="text-xs text-slate-400 tabular-nums">{here.length} · {share}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden" aria-hidden="true">
              <div className="h-full bg-accent rounded-full" style={{ width: `${share}%` }} />
            </div>
            {here.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Who picked ${o}`}>
                {here.map((a) => (
                  <li key={a.user}>
                    <Face a={a} q={q} manage={manage} admin={admin} onChange={onChange} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Each picture beside what that person wrote; the name, as on the other
 *  board, on hover or a tap. */
function WordsBoard({ q, answers, manage, onChange }: { q: Question; answers: BoardAnswer[]; manage: boolean; onChange: () => Promise<void> }) {
  const admin = useCanTakeDown();
  if (answers.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-3 sm:grid-cols-2">
      {answers.map((a) => (
        <li key={a.user} className="flex gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
          <span className="shrink-0">
            <Face a={a} q={q} manage={manage} admin={admin} onChange={onChange} />
          </span>
          <p className="min-w-0 flex-1 self-center text-sm text-slate-200 break-words whitespace-pre-line">{a.body}</p>
        </li>
      ))}
    </ul>
  );
}

function Suggest() {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className={CARD} aria-label="Suggest a question">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return setNote('Write a question first.');
          setBusy(true);
          const res = await suggestQuestion(text);
          setBusy(false);
          if (!res.ok) return setNote(res.reason ?? 'That did not go in');
          setText('');
          setNote('Thanks. Whoever writes the questions will see it.');
        }}
      >
        <label className="block">
          <span className="block text-sm font-semibold text-slate-200 mb-2">Got a question you would like everybody to answer?</span>
          <input className={FIELD} value={text} maxLength={200} placeholder="Pineapple on pizza: yes or no?"
                 onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-300" role="status">{note}</p>
          <button type="submit" className={BUTTON} disabled={busy}>Suggest it</button>
        </div>
      </form>
    </section>
  );
}

// --- writing them --------------------------------------------------------------

const blank = (weekOf = '', prompt = '', suggestion: string | null = null): QuestionForm => ({
  id: null, prompt, kind: 'choice', options: ['', ''], weekOf, suggestion,
});

function Writer({ thisWeek, onChange }: { thisWeek: string; onChange: () => Promise<void> }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionForm | null>(null);
  const load = useCallback(async () => {
    const got = await readSheet();
    if (!got.ok) return setProblem(got.reason ?? 'That did not load');
    setSheet(got);
  }, []);
  useEffect(() => void load(), [load]);

  const after = async () => {
    setForm(null);
    await load();
    await onChange();
  };

  if (problem) return <p className="text-sm text-rose-300">{problem}</p>;
  if (!sheet) return null;
  const taken = new Set(sheet.questions.map((q) => q.week_of).filter(Boolean));
  const nextFree = mondays(thisWeek, 26).find((m) => !taken.has(m)) ?? '';

  return (
    <section className="space-y-4" aria-label="Writing the questions">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-200">Writing the questions</h2>
        {!form && (
          <button type="button" className={BUTTON} onClick={() => setForm(blank(nextFree))}>
            <Plus className="w-4 h-4" aria-hidden="true" /> New question
          </button>
        )}
      </div>

      {form && <Editor start={form} thisWeek={thisWeek} taken={taken} onDone={after} onCancel={() => setForm(null)} />}

      {sheet.suggestions.length > 0 && (
        <div className={CARD}>
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Suggested</h3>
          <ul className="mt-2 divide-y divide-white/10">
            {sheet.suggestions.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-200 min-w-0 break-words">
                  {s.prompt} <span className="text-xs text-slate-500">— {s.from ?? 'somebody'}</span>
                </span>
                <span className="flex gap-2">
                  <button type="button" className={BUTTON} onClick={() => setForm(blank(nextFree, s.prompt, s.id))}>Use it</button>
                  <button type="button" className={BUTTON}
                          onClick={async () => {
                            await dismissSuggestion(s.id);
                            await load();
                          }}>
                    Dismiss
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {sheet.questions.map((q) => (
          <li key={q.id} className="rounded-xl border border-white/15 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-xs text-slate-400 first-letter:uppercase">
                {q.week_of ? weekWord(q.week_of) : 'Not scheduled'}
                {q.week_of === thisWeek && ' · up now'} · {q.kind === 'choice' ? `${q.options.length} choices` : 'written answers'}
                {' '}· {q.answers} {q.answers === 1 ? 'answer' : 'answers'}
              </span>
              <span className="block text-sm text-slate-200 break-words">{q.prompt}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" className={BUTTON}
                      onClick={() => setForm({ id: q.id, prompt: q.prompt, kind: q.kind,
                                               options: q.kind === 'choice' ? q.options : ['', ''],
                                               weekOf: q.week_of ?? '', suggestion: null })}>
                Change
              </button>
              <button type="button" className={BUTTON}
                      onClick={async () => {
                        const sure = window.confirm(`Delete “${q.prompt}”${q.answers > 0 ? ` and its ${q.answers} answers` : ''}?`);
                        if (!sure) return;
                        const res = await deleteQuestion(q.id);
                        if (!res.ok) window.alert(res.reason ?? 'That did not work');
                        await after();
                      }}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Editor({ start, thisWeek, taken, onDone, onCancel }: {
  start: QuestionForm; thisWeek: string; taken: Set<string | null>; onDone: () => Promise<void>; onCancel: () => void;
}) {
  const [f, setF] = useState<QuestionForm>(start);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof QuestionForm>(k: K, v: QuestionForm[K]) => setF((x) => ({ ...x, [k]: v }));
  // This week and the next half year, and the one it already has if that has gone.
  const weeks = mondays(thisWeek, 26);
  if (f.weekOf && !weeks.includes(f.weekOf)) weeks.unshift(f.weekOf);

  return (
    <form
      className={`${CARD} space-y-3`}
      aria-label={f.id ? 'Change the question' : 'New question'}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveQuestion(f);
        setBusy(false);
        if (!res.ok) return setProblem(res.reason ?? 'That did not save');
        await onDone();
      }}
    >
      <label className="block">
        <span className={LABEL}>Question</span>
        <input className={FIELD} value={f.prompt} maxLength={200} onChange={(e) => set('prompt', e.target.value)} />
      </label>
      <fieldset>
        <legend className={LABEL}>How people answer</legend>
        <div className="flex flex-wrap gap-4 text-sm text-slate-200">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="kind" checked={f.kind === 'choice'} onChange={() => set('kind', 'choice')} />
            Pick an answer
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="kind" checked={f.kind === 'text'} onChange={() => set('kind', 'text')} />
            Write a short answer
          </label>
        </div>
      </fieldset>
      {f.kind === 'choice' && (
        <fieldset className="space-y-2">
          <legend className={LABEL}>Answers to pick from (two to six)</legend>
          {f.options.map((o, n) => (
            <div key={n} className="flex gap-2">
              <input className={FIELD} value={o} maxLength={60} aria-label={`Answer ${n + 1}`}
                     onChange={(e) => set('options', f.options.map((x, k) => (k === n ? e.target.value : x)))} />
              {f.options.length > 2 && (
                <button type="button" className={BUTTON} aria-label={`Remove answer ${n + 1}`}
                        onClick={() => set('options', f.options.filter((_, k) => k !== n))}>
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {f.options.length < 6 && (
            <button type="button" className={BUTTON} onClick={() => set('options', [...f.options, ''])}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Another answer
            </button>
          )}
        </fieldset>
      )}
      <label className="block">
        <span className={LABEL}>Week</span>
        <select className={FIELD} value={f.weekOf} onChange={(e) => set('weekOf', e.target.value)}>
          <option value="">Not scheduled yet</option>
          {weeks.map((m) => (
            <option key={m} value={m} disabled={taken.has(m) && m !== start.weekOf}>
              {weekWord(m).replace(/^the/, 'The')}{m === thisWeek ? ' (this week)' : ''}{taken.has(m) && m !== start.weekOf ? ' — has one' : ''}
            </option>
          ))}
        </select>
      </label>
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY} disabled={busy}>{f.id ? 'Save' : 'Add it'}</button>
        <button type="button" className={BUTTON} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
