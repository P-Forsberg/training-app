import { db } from '../local/db';
import type { Row, WritableTable } from '../rows';
import { nowStamp } from '../session';
import { commit, type Change } from '../sync/commit';

/**
 * Undoes one mutation batch (an import, an accepted AI proposal, a plan edit)
 * in a single step: every row goes back to its `before` state, and rows that
 * the batch created are soft-deleted.
 */
export async function undoBatch(batchId: string): Promise<void> {
  const mutations = (await db.mutations.where('batch_id').equals(batchId).toArray())
    .filter((m) => !m.undone_at && !m.deleted_at)
    .sort((a, b) => b.seq - a.seq);
  if (!mutations.length) throw new Error('Det finns inget att ångra för den här ändringen.');

  const changes: Change[] = [];
  const seen = new Set<string>();
  for (const m of mutations) {
    const table = m.entity as WritableTable;
    const key = `${table}:${m.entity_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const current = await db.rows(table).get(m.entity_id);
    if (m.before) {
      // Restore the earlier version but keep bookkeeping columns current.
      const before = m.before as unknown as Row<typeof table>;
      changes.push({
        table,
        row: { ...before, owner: current?.owner ?? before.owner, created_at: current?.created_at ?? before.created_at },
      } as Change);
    } else if (current) {
      changes.push({ table, row: { ...current, deleted_at: nowStamp() } } as Change);
    }
  }

  const stamp = nowStamp();
  for (const m of mutations) changes.push({ table: 'mutations', row: { ...m, undone_at: stamp } });

  const proposalId = mutations.find((m) => m.proposal_id)?.proposal_id;
  if (proposalId) {
    const proposal = await db.proposals.get(proposalId);
    if (proposal) changes.push({ table: 'proposals', row: { ...proposal, status: 'undone' } });
  }

  await commit(changes, { layer: 'planned' });
}

/** The most recent batch that can still be undone, for a global "Ångra" action. */
export async function lastUndoableBatch(): Promise<string | undefined> {
  const all = await db.mutations.toArray();
  const open = all.filter((m) => !m.undone_at && !m.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return open[0]?.batch_id;
}
