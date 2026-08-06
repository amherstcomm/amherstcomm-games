// Optional Supabase backing for accounts and stat sync. The client exists
// only when both env vars are configured at build time — without them the
// site runs fully local, exactly as before, and every auth surface hides.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { store } from '@/siteStorage';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The session token goes through the same gate as everything else, so
// "remember nothing" also means "don't stay signed in". Without this,
// supabase-js writes straight to localStorage and the promise would be false.
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: {
            getItem: (k) => store.getItem(k),
            setItem: (k, v) => store.setItem(k, v),
            removeItem: (k) => store.removeItem(k),
          },
        },
      })
    : null;
