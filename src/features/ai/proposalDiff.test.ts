import { beforeEach, describe, expect, it } from 'vitest';
import { importProgram } from '@/data/commands/program';
import { db } from '@/data/local/db';
import type { ProposalRow } from '@/data/rows';
import { baseColumns, getOwnerId, resetOwnerCache } from '@/data/session';
import { parse } from '@/import/adapters/xlsxKullamannen';
import { CanonicalProgram } from '@/import/canonical';
import { syntheticKullamannen } from '@/import/fixtures/syntheticKullamannen';
import { applyProposal, describeDiff, rejectProposal, StaleProposalError, storeIncomingProposals, undoProposal, type ProposalDiff } from './proposalDiff';

async function setup() {
  db.close();
  await db.delete();
  await db.open();
  resetOwnerCache();
  const { programId } = await importProgram(CanonicalProgram.parse(parse(syntheticKullamannen(2), 'Test.xlsx')));
  const run = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run' && s.date === '2026-09-22')!;
  const items = await db.planned_items.where('planned_session_id').equals(run.id).toArray();
  return { programId, run, items };
}

async function proposal(programId: string, diff: ProposalDiff): Promise<ProposalRow> {
  const owner = await getOwnerId();
  const row: ProposalRow = { ...baseColumns(owner), program_id: programId, prompt: 'test', rationale: 'Testmotivering', diff: diff as unknown as ProposalRow['diff'], status: 'pending', applied_at: null };
  await storeIncomingProposals([row]);
  return row;
}

describe('proposalDiff', () => {
  beforeEach(async () => {
    await db.open();
  });

  it('accepting applies the diff; undo restores the plan in one step', async () => {
    const { programId, run, items } = await setup();
    const planBefore = JSON.stringify({ s: await db.planned_sessions.get(run.id), i: await db.planned_items.where('planned_session_id').equals(run.id).toArray() });
    const newItemId = crypto.randomUUID();
    const p = await proposal(programId, {
      ops: [
        { entity: 'planned_sessions', entityId: run.id, op: 'update', before: run, after: { ...run, date: '2026-09-23', day_of_week: 3 } },
        { entity: 'planned_items', entityId: items[0]!.id, op: 'delete', before: items[0]!, after: { ...items[0]!, deleted_at: '2026-09-20T00:00:00.000Z' } },
        {
          entity: 'planned_items',
          entityId: newItemId,
          op: 'insert',
          before: null,
          after: { ...items[0]!, id: newItemId, kind: 'exercise', raw_text: 'Goblet Squat – 3×10', exercise_id: null, deleted_at: null },
        },
      ],
    });

    await applyProposal(p.id);
    expect((await db.planned_sessions.get(run.id))!.date).toBe('2026-09-23');
    const inserted = (await db.planned_items.get(newItemId))!;
    expect(inserted.exercise_id).not.toBeNull();
    expect((await db.exercises.get(inserted.exercise_id!))!.canonical_name).toBe('Goblet Squat');
    expect((await db.proposals.get(p.id))!.status).toBe('accepted');

    await undoProposal(p.id);
    const planAfterUndo = JSON.stringify({ s: await db.planned_sessions.get(run.id), i: (await db.planned_items.where('planned_session_id').equals(run.id).toArray()).filter((i) => i.id !== newItemId) });
    const restored = JSON.parse(planAfterUndo) as { s: { date: string }; i: { deleted_at: string | null }[] };
    expect(restored.s.date).toBe('2026-09-22');
    expect(restored.i.every((i) => i.deleted_at === null)).toBe(true);
    expect((await db.planned_items.get(newItemId))!.deleted_at).not.toBeNull();
    expect((await db.proposals.get(p.id))!.status).toBe('undone');
    expect(JSON.parse(planBefore).s.date).toBe(restored.s.date);
  });

  it('refuses a proposal whose rows changed after it was made', async () => {
    const { programId, run } = await setup();
    const p = await proposal(programId, {
      ops: [{ entity: 'planned_sessions', entityId: run.id, op: 'update', before: { ...run, updated_at: '2000-01-01T00:00:00.000Z' }, after: { ...run, title: 'X' } }],
    });
    await expect(applyProposal(p.id)).rejects.toBeInstanceOf(StaleProposalError);
    expect((await db.planned_sessions.get(run.id))!.title).toBeNull();
    expect((await db.proposals.get(p.id))!.status).toBe('pending');
  });

  it('rejecting changes only the status', async () => {
    const { programId, run } = await setup();
    const p = await proposal(programId, { ops: [{ entity: 'planned_sessions', entityId: run.id, op: 'update', before: run, after: { ...run, title: 'X' } }] });
    await rejectProposal(p.id);
    expect((await db.proposals.get(p.id))!.status).toBe('rejected');
    expect((await db.planned_sessions.get(run.id))!.title).toBeNull();
  });

  it('describes a diff in plain Swedish', async () => {
    const { run, items } = await setup();
    const lines = describeDiff(
      {
        ops: [
          { entity: 'planned_sessions', entityId: run.id, op: 'update', before: run, after: { ...run, date: '2026-09-23' } },
          { entity: 'planned_items', entityId: items[0]!.id, op: 'delete', before: items[0]!, after: items[0]! },
        ],
      },
      (d) => d,
    );
    expect(lines[0]).toEqual({ kind: 'change', text: 'Löppass 2026-09-22: 2026-09-22 → 2026-09-23' });
    expect(lines[1]!.kind).toBe('remove');
  });
});
