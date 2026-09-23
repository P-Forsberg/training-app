import type { SyncedTable } from '../rows';
import { supabase } from './client';

/**
 * Remote implementation used by the sync engine: batched upserts and
 * incremental pulls. Nothing in the UI calls this directly.
 */

export interface RemoteError {
  /** True for network failures and 5xx: retry later, the queue is fine. */
  transient: boolean;
  message: string;
  code?: string;
}

export interface RemoteStore {
  upsert(table: SyncedTable, rows: Record<string, unknown>[]): Promise<RemoteError | null>;
  pull(table: SyncedTable, since: string, limit: number): Promise<{ rows: Record<string, unknown>[]; error: RemoteError | null }>;
}

function toError(e: { message: string; code?: string; status?: number } | null, status?: number): RemoteError | null {
  if (!e) return null;
  const s = status ?? e.status ?? 0;
  // 404 means the table is missing (migrations not applied yet): wait, don't discard writes.
  const transient = s === 0 || s === 404 || s >= 500 || s === 408 || s === 429 || /fetch|network|timeout/i.test(e.message);
  return { transient, message: e.message, code: e.code };
}

export const supabaseStore: RemoteStore = {
  async upsert(table, rows) {
    if (!supabase) return { transient: true, message: 'not configured' };
    try {
      // Generic table name: the typed client cannot narrow a union of tables.
      const { error, status } = await (supabase.from(table) as unknown as {
        upsert(r: unknown[], o: { onConflict: string }): Promise<{ error: { message: string; code?: string } | null; status: number }>;
      }).upsert(rows, { onConflict: 'id' });
      return toError(error, status);
    } catch (e) {
      return { transient: true, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async pull(table, since, limit) {
    if (!supabase) return { rows: [], error: { transient: true, message: 'not configured' } };
    try {
      const { data, error, status } = await supabase
        .from(table)
        .select('*')
        .gt('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit);
      return { rows: (data ?? []) as unknown as Record<string, unknown>[], error: toError(error, status) };
    } catch (e) {
      return { rows: [], error: { transient: true, message: e instanceof Error ? e.message : String(e) } };
    }
  },
};
