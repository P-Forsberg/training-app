import { z } from 'zod';
import { db } from '../local/db';
import { SYNCED_TABLES, type WritableTable } from '../rows';
import { getOwnerId } from '../session';
import { commit, type Change } from '../sync/commit';

/** JSON backup of everything the user owns. The global exercise catalog is not included. */
export const BACKUP_VERSION = 1;

const Backup = z.object({
  app: z.literal('training-app'),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

const EXPORTED: WritableTable[] = SYNCED_TABLES.filter((t): t is WritableTable => t !== 'ai_usage');

export async function exportBackup(): Promise<string> {
  const owner = await getOwnerId();
  const tables: Record<string, unknown[]> = {};
  for (const t of EXPORTED) {
    tables[t] = (await db.rows(t).toArray()).filter((r) => (r as { owner: string | null }).owner === owner);
  }
  return JSON.stringify({ app: 'training-app', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }, null, 1);
}

/**
 * Restores a backup into the current account. Rows keep their ids, so
 * restoring twice is harmless; owner is rewritten to the current user.
 */
export async function importBackup(json: string): Promise<{ rows: number }> {
  let parsed: z.infer<typeof Backup>;
  try {
    parsed = Backup.parse(JSON.parse(json));
  } catch {
    throw new Error('Filen är ingen säkerhetskopia från den här appen.');
  }
  const owner = await getOwnerId();
  const changes: Change[] = [];
  for (const t of EXPORTED) {
    for (const row of parsed.tables[t] ?? []) {
      const next = { ...row, owner } as Record<string, unknown>;
      if (t === 'profiles') next.id = owner;
      changes.push({ table: t, row: next } as unknown as Change);
    }
  }
  // Parent-first order is preserved because EXPORTED follows SYNCED_TABLES.
  await commit(changes, { layer: 'planned' });
  return { rows: changes.length };
}
