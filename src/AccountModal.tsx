import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, Github, LogOut, Mail, X } from 'lucide-react';
import { supabase } from '@/supabase';
import { clearMyStats, deleteAccount } from '@/account';
import {
  fetchDisplayName,
  setDisplayName,
  NAME_MESSAGES,
  type NameResult,
} from '@/leaderboard';
import { useModalA11y } from '@/useModalA11y';

// A different word per action, so a hand that has learned one doesn't finish
// the other on autopilot, and a fresh code beside it — a phrase you can type
// from memory is a phrase you can type without meaning to.
const CONFIRM_WORD = { stats: 'clear', account: 'delete' } as const;

// No O/0 or I/1/l. This gets read off the screen and typed back, and a code
// you have to squint at is a worse gate rather than a stronger one.
function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join('');
}

export default function AccountModal({
  session,
  onClose,
}: {
  session: Session | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);

  // The name lives in profiles rather than the synced settings blob, because
  // it has to be unique across accounts — that's a database constraint, not a
  // preference.
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved' | Exclude<NameResult, 'ok'>>(
    'idle'
  );

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchDisplayName().then((n) => {
      if (!alive) return;
      setName(n);
      setNameDraft(n ?? '');
    });
    return () => {
      alive = false;
    };
  }, [session]);

  async function saveName() {
    if (nameState === 'saving') return;
    setNameState('saving');
    const result = await setDisplayName(nameDraft.trim());
    if (result === 'ok') {
      const saved = nameDraft.trim() || null;
      setName(saved);
      setNameDraft(saved ?? '');
      setNameState('saved');
    } else {
      setNameState(result);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !email.trim() || status === 'sending') return;
    setStatus('sending');
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong sending the email — please try again.');
    } else {
      setStatus('sent');
    }
  }

  // OAuth needs no email at all — the whole page redirects to the provider
  async function oauth(provider: 'github' | 'google') {
    if (!supabase) return;
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong starting the sign-in — please try again.');
    }
  }

  // fallback for when the magic link can't complete (e.g. an email scanner
  // pre-clicked it): verify with the code from the same email
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !code.trim() || verifying) return;
    setVerifying(true);
    setCodeError('');
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setVerifying(false);
    if (err) setCodeError(err.message || 'That code didn’t verify — request a fresh email and try again.');
    else onClose();
  }

  async function signOut() {
    await supabase?.auth.signOut();
    onClose();
  }

  // Leaving. Nothing here fires on a single click: each one opens a panel
  // saying what it takes, and deletion also wants the word typed out.
  const [danger, setDanger] = useState<null | 'stats' | 'account'>(null);
  const [typed, setTyped] = useState('');
  // not `code` — that's the sign-in one-time code a few lines up
  const [confirmCode, setConfirmCode] = useState('');
  const [wipeLocal, setWipeLocal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dangerError, setDangerError] = useState('');
  const [statsCleared, setStatsCleared] = useState(false);

  function openDanger(which: 'stats' | 'account') {
    setDanger(which);
    setConfirmCode(newCode());
    setTyped('');
    setDangerError('');
    setStatsCleared(false);
  }

  // Every space and capital thrown away before comparing. Reading "clear NAXB"
  // off the screen, there's no way to tell whether it wants one space, four, or
  // none — and getting the letters right is the whole of the work being asked
  // for. Gating on typography would just be a second puzzle.
  const expected = danger === null ? '' : `${CONFIRM_WORD[danger]} ${confirmCode}`;
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const typedOk = danger !== null && norm(typed) === norm(expected);

  async function confirmClearStats() {
    if (busy || !typedOk) return;
    setBusy(true);
    setDangerError('');
    const ok = await clearMyStats();
    setBusy(false);
    if (ok) {
      setDanger(null);
      setStatsCleared(true);
    } else {
      setDangerError('Couldn’t clear that just now — try again in a moment.');
    }
  }

  async function confirmDeleteAccount() {
    if (busy || !typedOk) return;
    setBusy(true);
    setDangerError('');
    const ok = await deleteAccount(wipeLocal);
    if (!ok) {
      setBusy(false);
      setDangerError(
        'Couldn’t delete the account just now. Try again, or email privacy@anagrimoire.com and it will be done by hand.'
      );
      return;
    }
    // Reload rather than unwind by hand: the sync hooks, the stats view and
    // the session listener are all holding a user that no longer exists, and
    // a fresh load is the one way to be sure none of them writes again.
    window.location.reload();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
      >
        {/* outside the scroll, so it can't slide away mid-read */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto p-6 sm:p-8">
        {session ? (
          <>
            <h2 className="text-xl font-bold mb-1">Account</h2>
            <p className="text-sm text-slate-400 mb-5">
              Signed in as <span className="text-slate-200">{session.user.email}</span>
            </p>
            <div className="mb-6">
              <label
                htmlFor="display-name"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
              >
                Display name
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="display-name"
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setNameState('idle');
                  }}
                  maxLength={24}
                  placeholder="Not shown to anyone"
                  className="flex-1 min-w-[10rem] h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 text-sm"
                />
                <button
                  onClick={saveName}
                  disabled={nameState === 'saving' || nameDraft.trim() === (name ?? '')}
                  className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-emerald-400 text-ink hover:bg-emerald-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {nameState === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500" aria-live="polite">
                {nameState === 'saved'
                  ? name
                    ? `Saved. You appear as ${name} on the leaderboards.`
                    : 'Cleared. You no longer appear on the leaderboards.'
                  : nameState !== 'idle' && nameState !== 'saving'
                    ? NAME_MESSAGES[nameState]
                    : 'The only thing other players can see. Setting one puts you on the leaderboards; clearing it takes you off. Everything else about your account stays private.'}
              </p>
            </div>

            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>

            <div className="mt-6 pt-5 border-t border-white/10">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                Leaving
              </h3>

              {danger === null && (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Two different things, and most people want the first. Neither can be
                    undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openDanger('stats')}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      Clear my statistics
                    </button>
                    <button
                      onClick={() => openDanger('account')}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-rose-500/40 text-rose-300 hover:bg-rose-400/10 transition-colors"
                    >
                      Delete my account
                    </button>
                  </div>
                  {statsCleared && (
                    <p className="mt-2 text-xs text-emerald-300" role="status">
                      Cleared. Your account is still here — start playing and it fills up
                      again.
                    </p>
                  )}
                </>
              )}

              {danger === 'stats' && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-sm text-slate-300 mb-2">
                    Clear your statistics?
                  </p>
                  <p className="text-xs text-slate-400 mb-3">
                    Deletes every result on your account, the daily boards stored with
                    it, and the totals this browser had before you signed in. Your
                    account, your email and your display name all stay. A daily you
                    still have open here will save itself again as you keep playing.
                  </p>

                  <label htmlFor="clear-confirm" className="block text-xs text-slate-400 mb-1.5">
                    Type{' '}
                    <span className="text-slate-200 font-semibold">
                      clear <span className="tracking-[0.2em]">{confirmCode}</span>
                    </span>{' '}
                    to confirm — spaces and capitals don&apos;t matter
                  </label>
                  <input
                    id="clear-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className="w-full h-10 px-3 mb-3 rounded-lg bg-black/30 border border-white/15 text-slate-200 text-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={confirmClearStats}
                      disabled={busy || !typedOk}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-rose-400 text-ink hover:bg-rose-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy ? 'Clearing…' : 'Clear statistics'}
                    </button>
                    <button
                      onClick={() => setDanger(null)}
                      disabled={busy}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                  {dangerError && (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      {dangerError}
                    </p>
                  )}
                </div>
              )}

              {danger === 'account' && (
                <div className="rounded-xl bg-rose-950/60 border border-rose-500/40 p-4">
                  <p className="text-sm text-rose-100 mb-2">Delete your account?</p>
                  <p className="text-xs text-slate-300 mb-3">
                    Everything attached to it goes at once — results, daily boards,
                    display name, settings, and the sign-in itself. It cannot be undone,
                    and signing in later with{' '}
                    <span className="text-slate-200">{session.user.email}</span> starts a
                    brand new account rather than finding this one.
                  </p>

                  <label className="flex items-start gap-2 mb-3 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wipeLocal}
                      onChange={(e) => setWipeLocal(e.target.checked)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-rose-400"
                    />
                    <span>
                      Also erase this browser&apos;s saved boards and statistics. Leave
                      it unticked to keep playing here without an account — those stay on
                      this device either way, and clearing the site&apos;s data in your
                      browser removes them whenever you like.
                    </span>
                  </label>

                  <label
                    htmlFor="delete-confirm"
                    className="block text-xs text-slate-400 mb-1.5"
                  >
                    Type{' '}
                    <span className="text-rose-200 font-semibold">
                      delete <span className="tracking-[0.2em]">{confirmCode}</span>
                    </span>{' '}
                    to confirm — spaces and capitals don&apos;t matter
                  </label>
                  <input
                    id="delete-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className="w-full h-10 px-3 mb-3 rounded-lg bg-black/30 border border-rose-500/40 text-slate-200 placeholder:text-slate-600 text-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={confirmDeleteAccount}
                      disabled={busy || !typedOk}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-rose-400 text-ink hover:bg-rose-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy ? 'Deleting…' : 'Delete account'}
                    </button>
                    <button
                      onClick={() => setDanger(null)}
                      disabled={busy}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                  {dangerError && (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      {dangerError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1">Sign in</h2>
            <p className="text-sm text-slate-400 mb-5">
              No password needed. Accounts are optional — they carry your statistics
              and today&apos;s unfinished puzzles between devices, so you can start on
              a phone and finish on a laptop. Without one, everything still works,
              but each browser keeps its own separate progress.
            </p>
            <div className="space-y-2 mb-5">
              <button
                onClick={() => oauth('github')}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors"
              >
                <Github className="w-4 h-4" />
                Continue with GitHub
              </button>
              <button
                onClick={() => oauth('google')}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[0.6875rem] text-slate-500 uppercase tracking-wider">or by email</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            {status === 'sent' ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-300">
                  Check your email — click the sign-in link, or enter the code from the
                  email below.
                </p>
                <form onSubmit={verifyCode} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="one-time code"
                    className="w-full h-11 px-4 rounded-lg bg-white/5 border border-white/15 text-white tracking-[0.3em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={verifying || code.length < 6}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-semibold bg-emerald-400 text-ink shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 transition-colors disabled:opacity-50"
                  >
                    {verifying ? 'Verifying…' : 'Verify code'}
                  </button>
                  {codeError && <p className="text-sm text-danger">{codeError}</p>}
                </form>
              </div>
            ) : (
              <form onSubmit={sendMagicLink} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 px-4 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60 transition-colors"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-semibold bg-emerald-400 text-ink shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 transition-colors disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {status === 'sending' ? 'Sending…' : 'Send magic link'}
                </button>
                {status === 'error' && <p className="text-sm text-danger">{error}</p>}
              </form>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
