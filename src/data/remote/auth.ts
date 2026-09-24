import { configError, supabase } from './client';

export { configError };

export interface AuthUser {
  id: string;
  email?: string;
}

/** Reads the stored session. Works offline: the session is kept on the device. */
export async function currentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email } : null;
}

export async function signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
  if (!supabase) return { error: configError ?? 'Inloggning är inte konfigurerad i den här versionen av appen.' };
  if (!navigator.onLine) return { error: 'Första inloggningen kräver nät. Därefter fungerar appen offline.' };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (!error) return {};
  switch (error.code) {
    case 'invalid_credentials':
      return { error: 'Fel e-post eller lösenord. Kontrollera stavningen, eller välj "Glömt lösenordet?".' };
    case 'email_not_confirmed':
      return { error: 'Kontot är inte bekräftat än. Öppna bekräftelselänken i mejlet, eller be den som skapade kontot att bekräfta det i Supabase.' };
    case 'user_banned':
      return { error: 'Kontot är spärrat.' };
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return { error: 'För många försök. Vänta en minut och försök igen.' };
  }
  if (error.status === 429) return { error: 'För många försök. Vänta en minut och försök igen.' };
  return { error: `Inloggningen misslyckades (${error.code ?? error.status ?? 'okänt fel'}): ${error.message}` };
}

/** Sends a reset link. The link opens the app, which then asks for a new password. */
export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Inloggning är inte konfigurerad i den här versionen av appen.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${location.origin}${location.pathname}`,
  });
  if (!error) return {};
  if (error.status === 429) return { error: 'För många försök. Vänta en minut och försök igen.' };
  return { error: `Länken kunde inte skickas: ${error.message}` };
}

export async function updatePassword(password: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Inloggning är inte konfigurerad.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return {};
  if (/weak|short|characters/i.test(error.message)) return { error: 'Lösenordet är för svagt. Använd minst 10 tecken.' };
  return { error: `Lösenordet kunde inte bytas: ${error.message}` };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export type AuthEvent = 'signed-in' | 'signed-out' | 'password-recovery' | 'other';

export function onAuthChange(cb: (user: AuthUser | null, event: AuthEvent) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const u = session?.user;
    const e: AuthEvent =
      event === 'PASSWORD_RECOVERY' ? 'password-recovery' : event === 'SIGNED_IN' ? 'signed-in' : event === 'SIGNED_OUT' ? 'signed-out' : 'other';
    cb(u ? { id: u.id, email: u.email } : null, e);
  });
  return () => data.subscription.unsubscribe();
}
