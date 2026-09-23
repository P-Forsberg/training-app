import { db } from '../local/db';
import { PLANNED_TABLES, type Row, type WritableTable } from '../rows';
import { baseColumns, getOwnerId, newId, nowStamp } from '../session';
import { notifyLocalWrite } from './events';

/**
 * The only write path in the app. Writes rows to Dexie and queues them in the
 * outbox in the same transaction, so a closed tab never loses a write and the
 * sync engine can push later.
 */

export type Change = { [T in WritableTable]: { table: T; row: Row<T> } }[WritableTable];

export type Layer = 'planned' | 'logged';

export interface CommitOptions {
  /**
   * Which layer the command belongs to. Logging commands pass 'logged' and are
   * rejected if they touch any planned_* table. Plan changes pass 'planned'.
   */
  layer: Layer;
  /** Record planned-layer changes in `mutations` so they can be undone as one step. */
  mutationBatch?: { batchId?: string; proposalId?: string | null };
}

export class LayerViolationError extends Error {
  constructor(table: string) {
    super(`Logging may not write to the planned layer (${table}).`);
    this.name = 'LayerViolationError';
  }
}

const PLANNED = new Set<string>(PLANNED_TABLES);

function stripLocal(row: Record<string, unknown>): Record<string, unknown> {
  // server_updated_at is always set by the server.
  const { server_updated_at: _ignored, ...rest } = row;
  return rest;
}

export interface CommitResult {
  batchId?: string;
}

export async function commit(changes: Change[], options: CommitOptions): Promise<CommitResult> {
  if (options.layer === 'logged') {
    const bad = changes.find((c) => PLANNED.has(c.table));
    if (bad) throw new LayerViolationError(bad.table);
  }
  if (changes.length === 0) return {};

  const owner = await getOwnerId();
  const batchId = options.mutationBatch ? (options.mutationBatch.batchId ?? newId()) : undefined;
  const tables = new Set<string>(changes.map((c) => c.table));
  if (batchId) tables.add('mutations');
  const stores = [...tables].map((t) => db.rows(t as WritableTable));

  await db.transaction('rw', [...stores, db.outbox], async () => {
    let seq = 0;
    for (const change of changes) {
      const table = db.rows(change.table);
      const before = (await table.get(change.row.id)) as Record<string, unknown> | undefined;
      const row = { ...change.row, updated_at: nowStamp() } as Row<typeof change.table>;
      await (table as unknown as { put(r: unknown): Promise<unknown> }).put(row);
      await db.outbox.add({
        table: change.table,
        row_id: row.id,
        payload: stripLocal(row as unknown as Record<string, unknown>),
        attempts: 0,
        last_error: null,
        created_at: nowStamp(),
      });

      if (batchId && PLANNED.has(change.table)) {
        const mutation: Row<'mutations'> = {
          ...baseColumns(owner),
          batch_id: batchId,
          seq: seq++,
          entity: change.table,
          entity_id: row.id,
          before: (before ?? null) as Row<'mutations'>['before'],
          after: row as unknown as Row<'mutations'>['after'],
          proposal_id: options.mutationBatch?.proposalId ?? null,
          undone_at: null,
        };
        await db.mutations.put(mutation);
        await db.outbox.add({
          table: 'mutations',
          row_id: mutation.id,
          payload: stripLocal(mutation as unknown as Record<string, unknown>),
          attempts: 0,
          last_error: null,
          created_at: nowStamp(),
        });
      }
    }
  });

  notifyLocalWrite();
  return { batchId };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs read-then-write commands one at a time. Without this, a field saved on
 * blur and a button pressed right after could both read the old state (two
 * logs for one session, or a planned value overwriting a typed one).
 * Serialized commands must not call each other.
 */
export function serial<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => {
    const result = queue.then(() => fn(...args));
    queue = result.catch(() => undefined);
    return result;
  };
}

/** Soft delete: the row stays, deleted_at is set. */
export function softDeleted<T extends { deleted_at: string | null }>(row: T): T {
  return { ...row, deleted_at: nowStamp() };
}
