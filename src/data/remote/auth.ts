import { supabase } from './client';

export interface AuthUser {
  id: string;
  email?: string;
}

export async function currentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email } : null;
}

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Sends a magic link. The link returns to the current origin. */
export async function sendMagicLink(email: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Inloggning är inte konfigurerad i den här versionen av appen.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  if (!error) return {};
  if (error.status === 429) return { error: 'För många försök. Vänta en minut och försök igen.' };
  return { error: `Länken kunde inte skickas: ${error.message}` };
}

export async function signInWithProvider(provider: 'google' | 'apple'): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Inloggning är inte konfigurerad i den här versionen av appen.' };
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}${location.pathname}` } });
  return error ? { error: `Inloggningen misslyckades: ${error.message}` } : {};
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email } : null);
  });
  return () => data.subscription.unsubscribe();
}
