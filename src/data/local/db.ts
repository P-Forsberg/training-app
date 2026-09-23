import Dexie, { type Table } from 'dexie';
import type { Row, SyncedTable } from '../rows';

export interface OutboxEntry {
  seq?: number;
  table: SyncedTable;
  row_id: string;
  /** Full row snapshot at the time of the write. All writes are upserts (soft delete). */
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface DeadLetter extends OutboxEntry {
  failed_at: string;
}

export interface SyncCursor {
  table: SyncedTable;
  cursor: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

type RowTables = { [T in SyncedTable]: Table<Row<T>, string> };

// Declaration merging gives every synced table a typed property (db.programs, db.logged_sets, …).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LocalDb extends RowTables {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LocalDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  dead_letter!: Table<DeadLetter, number>;
  sync_cursors!: Table<SyncCursor, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'training-app') {
    super(name);
    // Bump the version and add an upgrade() when the Postgres schema changes shape.
    this.version(1).stores({
      profiles: 'id, owner',
      exercises: 'id, owner, canonical_name',
      programs: 'id, owner, is_active',
      program_weeks: 'id, program_id, [program_id+week_no], start_date',
      program_notes: 'id, program_id',
      planned_sessions: 'id, program_id, program_week_id, date, [program_id+date]',
      planned_items: 'id, planned_session_id, program_id, exercise_id',
      shoes: 'id, owner',
      logged_sessions: 'id, owner, date, planned_session_id',
      logged_runs: 'id, logged_session_id, shoe_id',
      logged_sets: 'id, logged_session_id, exercise_id, planned_item_id',
      proposals: 'id, program_id, status',
      mutations: 'id, batch_id, proposal_id',
      program_shares: 'id, program_id',
      import_profiles: 'id, adapter',
      ai_usage: 'id, month',
      outbox: '++seq, table, row_id',
      dead_letter: '++seq',
      sync_cursors: 'table',
      meta: 'key',
    });
  }

  rows<T extends SyncedTable>(table: T): Table<Row<T>, string> {
    return (this as unknown as RowTables)[table];
  }
}

export const db = new LocalDb();
