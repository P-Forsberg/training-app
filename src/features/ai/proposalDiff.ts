import { z } from 'zod';
import { undoBatch } from '@/data/commands/undo';
import { db } from '@/data/local/db';
import type { ExerciseRow, ProposalRow, Row, WritableTable } from '@/data/rows';
import { baseColumns, getOwnerId, nowStamp } from '@/data/session';
import { commit, serial, type Change } from '@/data/sync/commit';
import { buildExerciseIndex, matchExercise } from '@/domain/exerciseMatch';

/**
 * AI proposals. The AI never changes the plan: it stores a diff in
 * `proposals`. Accepting applies the diff through the command layer as one
 * mutation batch (so it can be undone in one step); rejecting only changes status.
 */

const ENTITIES = ['programs', 'program_weeks', 'planned_sessions', 'planned_items'] as const;

const Op = z.object({
  entity: z.enum(ENTITIES),
  entityId: z.string(),
  op: z.enum(['insert', 'update', 'delete']),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});
export const ProposalDiff = z.object({ ops: z.array(Op) });
export type ProposalDiff = z.infer<typeof ProposalDiff>;
export type ProposalOp = z.infer<typeof Op>;

export class StaleProposalError extends Error {
  constructor() {
    super('Planen har ändrats sedan förslaget skapades. Be assistenten om ett nytt förslag.');
    this.name = 'StaleProposalError';
  }
}

/** Receives proposals created server-side. They already exist remotely, so no outbox entry. */
export async function storeIncomingProposals(rows: ProposalRow[]): Promise<void> {
  if (rows.length) await db.proposals.bulkPut(rows);
}

const sameInstant = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && Date.parse(a) === Date.parse(b);

async function applyProposalImpl(proposalId: string): Promise<string> {
  const proposal = await db.proposals.get(proposalId);
  if (!proposal) throw new Error('Förslaget finns inte längre.');
  if (proposal.status !== 'pending') throw new Error('Förslaget är redan hanterat.');
  const diff = ProposalDiff.parse(proposal.diff);
  const owner = await getOwnerId();

  // Exercises in new items are matched against the catalog; unknown names become the user's own.
  const exercises = (await db.exercises.toArray()).filter((e) => !e.deleted_at && (e.owner === null || e.owner === owner));
  const index = buildExerciseIndex(exercises.map((e) => ({ ...e, canonicalName: e.canonical_name })));
  const created: ExerciseRow[] = [];
  const resolve = (raw: string): { id: string | null; known: boolean } => {
    const name = raw.split(/\s[-–—]\s|:\s/)[0]?.trim();
    if (!name) return { id: null, known: false };
    const hit = matchExercise(name, index);
    if (hit) return { id: hit.exercise.id, known: true };
    const existing = created.find((c) => c.canonical_name.toLowerCase() === name.toLowerCase());
    if (existing) return { id: existing.id, known: false };
    const row: ExerciseRow = { ...baseColumns(owner), canonical_name: name, aliases: [], category: null, movement_pattern: null, is_barbell: false, notes: null };
    created.push(row);
    return { id: row.id, known: false };
  };

  const changes: Change[] = [];
  for (const op of diff.ops) {
    const table = op.entity as WritableTable;
    const current = (await db.rows(table).get(op.entityId)) as Record<string, unknown> | undefined;
    if (op.op !== 'insert') {
      // Someone (you, another device) changed the row after the AI read it.
      if (!current || !op.before || !sameInstant(current.updated_at, op.before.updated_at)) throw new StaleProposalError();
    } else if (current) {
      throw new StaleProposalError();
    }
    const after: Record<string, unknown> = { ...(op.after as Record<string, unknown>), owner };
    if (table === 'planned_items' && op.op === 'insert' && after.kind === 'exercise' && !after.exercise_id) {
      const r = resolve(String(after.raw_text ?? ''));
      after.exercise_id = r.id;
      if (!r.known) after.parse_confidence = Math.min(Number(after.parse_confidence ?? 1), 0.8);
    }
    if (op.op !== 'insert' && current) after.created_at = current.created_at;
    after.server_updated_at = nowStamp();
    changes.push({ table, row: after as unknown as Row<typeof table> } as Change);
  }

  const exerciseChanges: Change[] = created.map((row) => ({ table: 'exercises', row }));
  const statusChange: Change = { table: 'proposals', row: { ...proposal, status: 'accepted', applied_at: nowStamp() } };
  const { batchId } = await commit([...exerciseChanges, ...changes, statusChange], { layer: 'planned', mutationBatch: { proposalId } });
  return batchId!;
}

async function rejectProposalImpl(proposalId: string): Promise<void> {
  const proposal = await db.proposals.get(proposalId);
  if (!proposal || proposal.status !== 'pending') return;
  await commit([{ table: 'proposals', row: { ...proposal, status: 'rejected' } }], { layer: 'planned' });
}

export const applyProposal = serial(applyProposalImpl);
export const rejectProposal = serial(rejectProposalImpl);

/** Undo an accepted proposal in one step. */
export async function undoProposal(proposalId: string): Promise<void> {
  const mutation = await db.mutations.where('proposal_id').equals(proposalId).first();
  if (!mutation) throw new Error('Det finns inget att ångra för förslaget.');
  await undoBatch(mutation.batch_id);
}

// ---------------------------------------------------------------------------
// Presentation: human-readable diff lines
// ---------------------------------------------------------------------------

export interface DiffLine {
  kind: 'add' | 'remove' | 'change';
  text: string;
  detail?: string;
}

const TYPE_LABEL: Record<string, string> = { run: 'Löppass', strength: 'Styrka', other: 'Pass', rest: 'Vila' };

function sessionLabel(row: Record<string, unknown> | null, fmt: (d: string) => string): string {
  if (!row) return 'Pass';
  return `${(row.title as string | null) ?? TYPE_LABEL[row.type as string] ?? 'Pass'} ${fmt(row.date as string)}`;
}

export function describeDiff(diff: ProposalDiff, fmt: (d: string) => string): DiffLine[] {
  const lines: DiffLine[] = [];
  const sessions = new Map<string, Record<string, unknown>>();
  for (const op of diff.ops) if (op.entity === 'planned_sessions') sessions.set(op.entityId, (op.after ?? op.before)!);

  for (const op of diff.ops) {
    const after = op.after ?? {};
    const before = op.before ?? {};
    switch (op.entity) {
      case 'programs':
        if (op.op === 'insert') lines.push({ kind: 'add', text: `Nytt program: ${String(after.name)}` });
        else if (before.start_date !== after.start_date) lines.push({ kind: 'change', text: `Programstart ${fmt(before.start_date as string)} → ${fmt(after.start_date as string)}` });
        break;
      case 'program_weeks':
        if (before.focus_text !== after.focus_text) lines.push({ kind: 'change', text: `Vecka ${String(after.week_no)}: nytt fokus`, detail: String(after.focus_text ?? '') });
        break;
      case 'planned_sessions':
        if (op.op === 'insert') lines.push({ kind: 'add', text: `Nytt pass: ${sessionLabel(after, fmt)}` });
        else if (op.op === 'delete') lines.push({ kind: 'remove', text: `Tas bort: ${sessionLabel(before, fmt)}` });
        else {
          const changes: string[] = [];
          if (before.date !== after.date) changes.push(`${fmt(before.date as string)} → ${fmt(after.date as string)}`);
          if (before.title !== after.title) changes.push(`namn: ${String(after.title ?? '–')}`);
          if (before.type !== after.type) changes.push(`typ: ${TYPE_LABEL[after.type as string] ?? String(after.type)}`);
          if (changes.length) lines.push({ kind: 'change', text: `${sessionLabel(before, fmt)}: ${changes.join(', ')}` });
        }
        break;
      case 'planned_items': {
        const parent = sessions.get(String(after.planned_session_id ?? before.planned_session_id));
        const where = parent ? ` (${sessionLabel(parent, fmt)})` : '';
        if (op.op === 'insert') lines.push({ kind: 'add', text: `${String(after.raw_text)}${where}` });
        else if (op.op === 'delete') lines.push({ kind: 'remove', text: `${String(before.raw_text)}${where}` });
        else if (before.raw_text !== after.raw_text) lines.push({ kind: 'change', text: `${String(before.raw_text)} → ${String(after.raw_text)}` });
        break;
      }
    }
  }
  // Long shifts touch hundreds of rows; summarize instead of listing all.
  if (lines.length > 30) {
    const moved = diff.ops.filter((o) => o.entity === 'planned_sessions' && o.op === 'update').length;
    return [...lines.filter((l) => !l.text.includes('→')).slice(0, 20), { kind: 'change', text: `${moved} pass får nytt datum` }];
  }
  return lines;
}
