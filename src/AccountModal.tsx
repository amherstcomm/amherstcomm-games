import { useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Github, LogOut, Mail, X } from 'lucide-react';
import { supabase } from '@/supabase';
import { useModalA11y } from '@/useModalA11y';

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
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
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
