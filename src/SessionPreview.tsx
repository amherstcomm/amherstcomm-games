// A session as the people answering it will see it, before it opens.
//
// The same question screens the live page uses, fed from the editor's sheet
// rather than from current_item, so there is nothing to start and nothing to
// clean up afterwards: every pick stays in this page and is gone when it
// closes. That is the whole promise -- a preview that wrote an answer would
// put the author in the results of the survey they were checking.
import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { KIND_LABEL, readSheet, secondsOf, type Sheet, type SheetItem } from '@/authoring';
import type { LiveItem } from '@/live';
import { pathOf } from '@/routes';
import { Ask, Choice, Guess, Match, Rank } from '@/LiveSession';
import NpsQuestion from '@/NpsQuestion';
import CompareQuestion from '@/CompareQuestion';
import AnonymityBanner from '@/AnonymityBanner';

const BUTTON =
  'inline-flex items-center justify-center px-3 h-10 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15';

/** The item as current_item would serve it, less the clock and the shuffle. */
function asLive(it: SheetItem): LiveItem {
  return {
    state: 'open',
    mode: 'open',
    id: it.id,
    position: it.position,
    kind: it.kind,
    prompt: it.prompt,
    payload: it.payload,
    seconds: null,
    mine: null,
    answer: null,
  } as LiveItem;
}

export default function SessionPreview({ session }: { session: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [at, setAt] = useState(0);
  const [note, setNote] = useState('');
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    void readSheet(session).then(setSheet);
  }, [session]);

  if (!sheet) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">Loading…</p>;
  if (!sheet.ok || !sheet.session) {
    return (
      <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">
        This session could not be loaded{sheet.reason ? `: ${sheet.reason}` : ''}.
      </p>
    );
  }

  const meta = sheet.session;
  const items = [...(sheet.items ?? [])].sort((a, b) => a.position - b.position);
  const full = meta.privacy === 'full';
  const item = items[Math.min(at, items.length - 1)];

  function go(to: number) {
    setNote('');
    setFinished(false);
    setAt(Math.max(0, Math.min(items.length - 1, to)));
  }
  // What Send does here: says what would have happened, and moves on.
  function sent() {
    if (at + 1 >= items.length) {
      setFinished(true);
      setNote('');
    } else {
      setNote(`Question ${at + 1} would have been sent. Nothing was.`);
      setAt(at + 1);
    }
  }

  const shown = item ? asLive(item) : null;
  const seconds = item ? secondsOf(item.payload) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        <a href={pathOf({ kind: 'sessions' })} className="hover:text-accent">Sessions</a>
        {' / '}
        <a href={pathOf({ kind: 'sessions', session })} className="hover:text-accent">{meta.title}</a>
      </p>
      <h1 className="text-2xl font-bold text-white mt-1">Preview</h1>

      <div role="note" className="mt-3 mb-6 rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex items-start gap-3">
        <Eye className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-sm text-slate-300">
          This is what people will see. Answer as they would: nothing you pick here is sent or counted,
          {meta.state === 'draft' ? ' and the session stays closed.' : ' and the session is not changed.'}
        </p>
      </div>

      {full && (
        <AnonymityBanner minResults={meta.min_results ?? 5} showComments={meta.show_comments !== false}
                         splitFloor={meta.split_floor ?? 3} />
      )}

      {!items.length ? (
        <p className="text-sm text-slate-400">
          No questions yet.{' '}
          <a href={pathOf({ kind: 'sessions', session })} className="text-accent hover:underline">
            Add some in the editor
          </a>
          .
        </p>
      ) : finished ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-lg text-white font-semibold">That was the last question.</p>
          <p className="text-sm text-slate-400">
            People who answer it will be told they are done. Nothing from this preview was sent.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button type="button" className={BUTTON} onClick={() => go(0)}>Start again</button>
            <a className={BUTTON} href={pathOf({ kind: 'sessions', session })}>Back to the editor</a>
          </div>
        </div>
      ) : (
        item && shown && (
          <>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Question {at + 1} of {items.length} · {KIND_LABEL[item.kind as keyof typeof KIND_LABEL] ?? item.kind}
              </p>
              {seconds != null && <p className="text-xs text-slate-500">{seconds}s on the clock</p>}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-3 text-white">{item.prompt}</h2>
            {meta.shuffle && ['choice', 'survey'].includes(item.kind) && (
              <p className="text-xs text-slate-500 mb-3">The options are shuffled for each person.</p>
            )}

            <div key={item.id}>
              {(item.kind === 'choice' || item.kind === 'survey') && (
                <Choice item={shown} onSend={sent} sending={false} />
              )}
              {item.kind === 'match' && <Match item={shown} onSend={sent} sending={false} />}
              {item.kind === 'number' && <Guess item={shown} onSend={sent} sending={false} />}
              {item.kind === 'rank' && <Rank item={shown} onSend={sent} sending={false} />}
              {item.kind === 'nps' && (
                <NpsQuestion item={shown} onSend={sent} sending={false} fullyAnonymous={full} />
              )}
              {item.kind === 'compare' && (
                <CompareQuestion
                  item={shown}
                  mode="open"
                  fullyAnonymous={full}
                  onSend={sent}
                  sending={false}
                  onBack={at > 0 ? () => go(at - 1) : undefined}
                  nextLabel={at + 1 >= items.length ? 'Finish' : 'Next question'}
                />
              )}
              {item.kind === 'open' && (
                <Ask onSend={sent} sending={false} fullyAnonymous={full}
                     privateAnswers={(item.payload as { private?: boolean }).private === true} />
              )}
              {/* A word game is marked by the server guess by guess, so there
                  is nothing to play without the session running. */}
              {item.kind === 'game' && (
                <p className="text-sm text-slate-400">
                  A word game. It is played here once the session opens; each guess is checked as it is made.
                </p>
              )}
            </div>

            {note && <p role="status" className="mt-4 text-sm text-slate-300">{note}</p>}

            <nav aria-label="Questions" className="mt-8 flex items-center justify-between gap-2">
              {at > 0 ? (
                <button type="button" className={BUTTON} onClick={() => go(at - 1)}>← Previous</button>
              ) : (
                <span aria-hidden="true" className="w-24" />
              )}
              <a className="text-sm text-accent hover:underline" href={pathOf({ kind: 'sessions', session })}>
                Back to the editor
              </a>
              <button type="button" className={BUTTON}
                      onClick={() => (at + 1 >= items.length ? setFinished(true) : go(at + 1))}>
                {at + 1 >= items.length ? 'Finish' : 'Skip →'}
              </button>
            </nav>
          </>
        )
      )}
    </div>
  );
}
