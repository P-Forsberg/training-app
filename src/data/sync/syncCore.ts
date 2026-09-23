import { db, type OutboxEntry } from '../local/db';
import type { RemoteStore } from '../remote/remoteStore';
import { SYNCED_TABLES, type SyncedTable } from '../rows';
import { nowStamp } from '../session';

/**
 * Sync core, independent of Supabase so it can be tested with a fake store.
 *
 * Push: the outbox is sent in commit order (parents before children). Several
 * writes to the same row collapse into its latest snapshot at the position of
 * the first write. Consecutive rows of one table go in one upsert.
 *
 * Pull: per table, rows with server_updated_at newer than the cursor are
 * merged with last-write-wins on updated_at. A row with a pending local write
 * is left alone; the server's LWW trigger decides when it is pushed.
 * Logged rows are never merged field by field: whole rows win or lose.
 */

export const MAX_ATTEMPTS = 5;
const BATCH = 500;
const PULL_LIMIT = 1000;
/** Re-read a short window before the cursor so rows from concurrent transactions are not missed. */
const PULL_OVERLAP_MS = 5 * 60 * 1000;
const EPOCH = '1970-01-01T00:00:00.000Z';

export interface PushResult {
  pushed: number;
  failed: number;
  transientError?: string;
}

interface Collapsed {
  table: SyncedTable;
  rowId: string;
  payload: Record<string, unknown>;
  seqs: number[];
  attempts: number;
}

function collapse(entries: OutboxEntry[]): Collapsed[] {
  const byKey = new Map<string, Collapsed>();
  const order: Collapsed[] = [];
  for (const e of entries) {
    const key = `${e.table}:${e.row_id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.payload = e.payload;
      existing.seqs.push(e.seq!);
      existing.attempts = Math.max(existing.attempts, e.attempts);
    } else {
      const c: Collapsed = { table: e.table, rowId: e.row_id, payload: e.payload, seqs: [e.seq!], attempts: e.attempts };
      byKey.set(key, c);
      order.push(c);
    }
  }
  return order;
}

async function markFailed(items: Collapsed[], message: string): Promise<number> {
  let dead = 0;
  await db.transaction('rw', db.outbox, db.dead_letter, async () => {
    for (const item of items) {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        dead++;
        await db.dead_letter.add({
          table: item.table,
          row_id: item.rowId,
          payload: item.payload,
          attempts,
          last_error: message,
          created_at: nowStamp(),
          failed_at: nowStamp(),
        });
        await db.outbox.bulkDelete(item.seqs);
      } else {
        await db.outbox.bulkUpdate(item.seqs.map((seq) => ({ key: seq, changes: { attempts, last_error: message } })));
      }
    }
  });
  return dead;
}

export async function pushOutbox(store: RemoteStore, owner: string): Promise<PushResult> {
  const entries = await db.outbox.orderBy('seq').toArray();
  // Rows of another owner (e.g. created before sign-in and not yet adopted) are never pushed.
  const mine = entries.filter((e) => e.payload.owner === owner);
  const items = collapse(mine);
  let pushed = 0;
  let failed = 0;

  let i = 0;
  while (i < items.length) {
    const table = items[i]!.table;
    const batch: Collapsed[] = [];
    while (i < items.length && items[i]!.table === table && batch.length < BATCH) batch.push(items[i++]!);

    const error = await store.upsert(table, batch.map((b) => b.payload));
    if (!error) {
      await db.outbox.bulkDelete(batch.flatMap((b) => b.seqs));
      pushed += batch.length;
      continue;
    }
    if (error.transient) return { pushed, failed, transientError: error.message };

    // A permanent error in a batch: retry rows one by one to isolate the bad ones.
    for (const item of batch) {
      const single = await store.upsert(table, [item.payload]);
      if (!single) {
        await db.outbox.bulkDelete(item.seqs);
        pushed++;
      } else if (single.transient) {
        return { pushed, failed, transientError: single.message };
      } else {
        failed += await markFailed([item], `${single.code ?? ''} ${single.message}`.trim());
      }
    }
  }
  return { pushed, failed };
}

export interface PullResult {
  pulled: number;
  transientError?: string;
}

function minus(iso: string, ms: number): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(Math.max(0, t - ms)).toISOString() : EPOCH;
}

export async function pullAll(store: RemoteStore, tables: readonly SyncedTable[] = SYNCED_TABLES): Promise<PullResult> {
  let pulled = 0;
  for (const table of tables) {
    const cursorRow = await db.sync_cursors.get(table);
    let cursor = cursorRow?.cursor ?? EPOCH;
    let since = cursorRow ? minus(cursor, PULL_OVERLAP_MS) : EPOCH;

    for (;;) {
      const { rows, error } = await store.pull(table, since, PULL_LIMIT);
      if (error) {
        if (error.transient) return { pulled, transientError: error.message };
        // Permanent errors on pull (e.g. schema drift) are skipped for this table.
        break;
      }
      if (!rows.length) break;
      pulled += await mergeRows(table, rows);
      const last = rows[rows.length - 1]!.server_updated_at as string;
      if (last > cursor) cursor = last;
      if (rows.length < PULL_LIMIT) break;
      since = last;
    }
    await db.sync_cursors.put({ table, cursor });
  }
  return { pulled, transientError: undefined };
}

async function mergeRows(table: SyncedTable, rows: Record<string, unknown>[]): Promise<number> {
  const store = db.rows(table) as unknown as {
    bulkGet(ids: string[]): Promise<({ updated_at: string } | undefined)[]>;
    bulkPut(rows: unknown[]): Promise<unknown>;
  };
  let merged = 0;
  await db.transaction('rw', [db.rows(table), db.outbox], async () => {
    const ids = rows.map((r) => r.id as string);
    const locals = await store.bulkGet(ids);
    const pending = new Set((await db.outbox.where('row_id').anyOf(ids).toArray()).filter((e) => e.table === table).map((e) => e.row_id));
    const toPut: unknown[] = [];
    rows.forEach((remote, idx) => {
      const local = locals[idx];
      if (pending.has(remote.id as string)) return; // local write wins until pushed
      // Compare as instants: the server formats timestamps differently (+00:00, microseconds).
      if (!local || Date.parse(remote.updated_at as string) >= Date.parse(local.updated_at)) toPut.push(remote);
    });
    if (toPut.length) await store.bulkPut(toPut);
    merged = toPut.length;
  });
  return merged;
}
