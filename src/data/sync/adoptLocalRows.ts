import { db } from '../local/db';
import { SYNCED_TABLES, type WritableTable } from '../rows';
import { LOCAL_OWNER, nowStamp, setOwnerId } from '../session';

/**
 * First sign-in on a device: rows created offline before sign-in (owner =
 * LOCAL_OWNER) are re-owned to the real user and queued for push.
 * Signing in as a different user than before clears the previous user's data.
 */
export async function adoptLocalRows(previousOwner: string, userId: string): Promise<void> {
  if (previousOwner === userId) return;

  if (previousOwner !== LOCAL_OWNER) {
    await clearUserData();
    await setOwnerId(userId);
    return;
  }

  const tables = SYNCED_TABLES.filter((t): t is WritableTable => t !== 'ai_usage');
  await db.transaction('rw', [...tables.map((t) => db.rows(t)), db.outbox, db.meta], async () => {
    await db.outbox.clear();
    for (const table of tables) {
      const store = db.rows(table) as unknown as {
        toArray(): Promise<Record<string, unknown>[]>;
        bulkPut(r: unknown[]): Promise<unknown>;
        bulkDelete(ids: string[]): Promise<void>;
      };
      const rows = (await store.toArray()).filter((r) => r.owner === LOCAL_OWNER);
      if (!rows.length) continue;
      const stamp = nowStamp();
      const adopted = rows.map((r) => {
        const next: Record<string, unknown> = { ...r, owner: userId, updated_at: stamp };
        if (table === 'profiles') next.id = userId;
        if (table === 'mutations') {
          // Keep undo snapshots consistent with the new owner.
          for (const k of ['before', 'after'] as const) {
            const snap = next[k] as Record<string, unknown> | null;
            if (snap && snap.owner === LOCAL_OWNER) next[k] = { ...snap, owner: userId };
          }
        }
        return next;
      });
      if (table === 'profiles') await store.bulkDelete(rows.map((r) => r.id as string));
      await store.bulkPut(adopted);
      for (const row of adopted) {
        const { server_updated_at: _s, ...payload } = row;
        await db.outbox.add({ table, row_id: row.id as string, payload, attempts: 0, last_error: null, created_at: nowStamp() });
      }
    }
    await db.meta.put({ key: 'owner_id', value: userId });
  });
  await setOwnerId(userId);
}

/** Removes every user row and the sync state. The global exercise catalog stays. */
export async function clearUserData(): Promise<void> {
  const tables = SYNCED_TABLES;
  await db.transaction('rw', [...tables.map((t) => db.rows(t)), db.outbox, db.dead_letter, db.sync_cursors], async () => {
    for (const t of tables) {
      if (t === 'exercises') {
        await db.exercises.filter((e) => e.owner !== null).delete();
      } else {
        await db.rows(t).clear();
      }
    }
    await db.outbox.clear();
    await db.dead_letter.clear();
    await db.sync_cursors.clear();
  });
}
