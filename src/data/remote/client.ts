import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The Supabase client. Only src/data/remote may import supabase-js (lint rule).
 * The anon key is public by design; Row Level Security protects every table.
 * Without configuration the app runs fully local and sync stays off.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const configured = !!(url || anonKey);

/**
 * Set when the build has Supabase settings that cannot work (typically a
 * wrong value pasted into the hosting environment). The app then stays
 * closed and shows this on the login screen instead of a cryptic fetch error.
 */
export const configError: string | null = !configured
  ? null
  : !url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url.replace(/\/$/, ''))
    ? 'Appen är felkonfigurerad: VITE_SUPABASE_URL är inte en Supabase-adress. Rätta miljövariabeln och bygg om.'
    : !anonKey || !/^[A-Za-z0-9._-]+$/.test(anonKey) || anonKey.split('.').length !== 3
      ? 'Appen är felkonfigurerad: VITE_SUPABASE_ANON_KEY är inte den publika nyckeln (anon). Rätta miljövariabeln och bygg om.'
      : null;

export const supabase: SupabaseClient<Database> | null =
  configured && !configError
    ? createClient<Database>(url!.replace(/\/$/, ''), anonKey!, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

/** True when the build is meant to use a backend, even if its settings are broken (the app stays closed). */
export function isRemoteConfigured(): boolean {
  return configured;
}
