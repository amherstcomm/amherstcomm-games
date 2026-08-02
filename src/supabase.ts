// Optional Supabase backing for accounts and stat sync. The client exists
// only when both env vars are configured at build time — without them the
// site runs fully local, exactly as before, and every auth surface hides.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
