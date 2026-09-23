import { supabase } from './client';

/** Shares a program by e-mail (server function share_program). Requires network. */
export async function shareProgramRemote(programId: string, email: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Delning kräver inloggning och synk.' };
  const { error } = await supabase.rpc('share_program', { p_program_id: programId, p_email: email });
  if (!error) return {};
  if (error.code === 'P0002') return { error: 'Det finns inget konto med den e-postadressen. Be personen logga in i appen först.' };
  if (error.code === '22023') return { error: 'Du kan inte dela med dig själv.' };
  if (error.code === '42501') return { error: 'Programmet måste vara synkat till ditt konto innan det kan delas. Försök igen om en stund.' };
  return { error: `Delningen misslyckades: ${error.message}` };
}
