import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, Mail, X } from 'lucide-react';
import { supabase } from '@/supabase';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      setError(err.message);
    } else {
      setStatus('sent');
    }
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
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-6 sm:p-8 text-left shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

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
              We&apos;ll email you a magic link — no password needed. Accounts are optional;
              they sync your stats across devices.
            </p>
            {status === 'sent' ? (
              <p className="text-sm text-emerald-300">
                Check your email — the sign-in link is on its way. You can close this window.
              </p>
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
                  className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-semibold bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 transition-colors disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {status === 'sending' ? 'Sending…' : 'Send magic link'}
                </button>
                {status === 'error' && <p className="text-sm text-rose-400">{error}</p>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
