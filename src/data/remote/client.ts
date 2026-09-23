import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The Supabase client. Only src/data/remote may import supabase-js (lint rule).
 * The anon key is public by design; Row Level Security protects every table.
 * Without configuration the app runs fully local and sync stays off.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

export function isRemoteConfigured(): boolean {
  return supabase !== null;
}
