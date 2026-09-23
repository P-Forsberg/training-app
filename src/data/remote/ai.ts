import { supabase } from './client';

/** Calls the AI Edge Function. The Anthropic key only exists server-side. */
export async function callAi<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  if (!supabase) return { error: 'AI-assistenten kräver inloggning, och synk är inte konfigurerad i den här versionen.' };
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return { error: 'Logga in under Mer för att använda AI-assistenten.' };
  if (!navigator.onLine) return { error: 'AI-assistenten behöver nätverk. Allt annat fungerar offline.' };
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (error) {
    // FunctionsHttpError carries the function's JSON body in error.context.
    const ctx = (error as { context?: Response }).context;
    try {
      const parsed = ctx ? ((await ctx.json()) as { error?: string }) : undefined;
      if (parsed?.error) return { error: parsed.error };
    } catch {
      // fall through
    }
    return { error: 'AI-assistenten svarade inte. Kontrollera nätet och försök igen.' };
  }
  return { data: data as T };
}
