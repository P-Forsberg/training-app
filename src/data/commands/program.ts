import { addDaysIso } from '@/domain/dates';
import { INTENT_LABEL, type RunIntent } from '@/domain/sessionIntent';
import { CanonicalProgram, type CanonicalProgramInput } from '@/import/canonical';
import { canonicalToRows } from '@/import/canonicalToRows';
import { EXERCISE_CATALOG } from '../exerciseCatalog.generated';
import { db } from '../local/db';
import type { ExerciseRow, ImportProfileRow, ProgramRow } from '../rows';
import { baseColumns, getOwnerId, newId, nowStamp } from '../session';
import { commit, softDeleted, type Change } from '../sync/commit';

const EPOCH = '1970-01-01T00:00:00.000Z';

/** Puts the bundled global exercise catalog into the local store (idempotent, not synced). */
export async function seedExerciseCatalog(): Promise<void> {
  const existing = await db.exercises.bulkGet(EXERCISE_CATALOG.map((e) => e.id));
  const missing = EXERCISE_CATALOG.filter((_, i) => !existing[i]);
  if (!missing.length) return;
  const rows: ExerciseRow[] = missing.map((e) => ({
    id: e.id,
    owner: null,
    canonical_name: e.canonicalName,
    aliases: e.aliases,
    category: e.category,
    movement_pattern: e.movementPattern,
    is_barbell: e.isBarbell,
    notes: null,
    created_at: EPOCH,
    updated_at: EPOCH,
    server_updated_at: EPOCH,
    deleted_at: null,
  }));
  await db.exercises.bulkPut(rows);
}

async function deactivateOthers(keepId: string, owner: string): Promise<Change[]> {
  const active = await db.programs.filter((p) => p.is_active && p.id !== keepId && p.owner === owner && !p.deleted_at).toArray();
  return active.map((p) => ({ table: 'programs', row: { ...p, is_active: false } }));
}

/**
 * Saves a reviewed program. Only called after the user has approved the review
 * view. The whole import is one mutation batch and can be undone in one step.
 */
export async function importProgram(input: CanonicalProgramInput): Promise<{ programId: string; batchId: string; newExercises: number }> {
  const program = CanonicalProgram.parse(input);
  const owner = await getOwnerId();
  await seedExerciseCatalog();
  const exercises = await db.exercises.toArray();
  const { programId, changes, newExercises } = canonicalToRows(program, exercises, { owner, newId, now: nowStamp });
  const deactivate = await deactivateOthers(programId, owner);
  const { batchId } = await commit([...changes, ...deactivate], { layer: 'planned', mutationBatch: {} });
  return { programId, batchId: batchId!, newExercises: newExercises.length };
}

/** Local choice to view a program shared with me (I cannot write its is_active flag). */
export const ACTIVE_PROGRAM_OVERRIDE = 'active_program_override';

export async function setActiveProgram(programId: string): Promise<void> {
  const owner = await getOwnerId();
  const program = await db.programs.get(programId);
  if (!program) throw new Error('Programmet finns inte längre.');
  if (program.owner !== owner) {
    await db.meta.put({ key: ACTIVE_PROGRAM_OVERRIDE, value: programId });
    return;
  }
  await db.meta.delete(ACTIVE_PROGRAM_OVERRIDE);
  const changes: Change[] = [{ table: 'programs', row: { ...program, is_active: true } }, ...(await deactivateOthers(programId, owner))];
  await commit(changes, { layer: 'planned' });
}

export async function unshareProgram(shareId: string): Promise<void> {
  const share = await db.program_shares.get(shareId);
  if (!share) return;
  await commit([{ table: 'program_shares', row: softDeleted(share) }], { layer: 'logged' });
}

export async function updateProgram(programId: string, patch: Partial<Pick<ProgramRow, 'name' | 'race_date' | 'discipline'>>): Promise<void> {
  const program = await db.programs.get(programId);
  if (!program) throw new Error('Programmet finns inte längre.');
  await commit([{ table: 'programs', row: { ...program, ...patch } }], { layer: 'planned', mutationBatch: {} });
}

export async function deleteProgram(programId: string): Promise<void> {
  const program = await db.programs.get(programId);
  if (!program) return;
  await commit([{ table: 'programs', row: softDeleted({ ...program, is_active: false }) }], { layer: 'planned', mutationBatch: {} });
}

/**
 * Shifts a whole program N weeks (race moved, late start). Only planned rows
 * move; logs keep their dates. One mutation batch, so it can be undone.
 */
export async function shiftProgram(programId: string, weeks: number): Promise<string | undefined> {
  if (!Number.isInteger(weeks) || weeks === 0) return undefined;
  const days = weeks * 7;
  const program = await db.programs.get(programId);
  if (!program) throw new Error('Programmet finns inte längre.');
  const programWeeks = (await db.program_weeks.where('program_id').equals(programId).toArray()).filter((w) => !w.deleted_at);
  const sessions = (await db.planned_sessions.where('program_id').equals(programId).toArray()).filter((s) => !s.deleted_at);
  const shiftNotes = (meta: unknown) => {
    const m = (meta ?? {}) as { dayNotes?: Record<string, string> };
    if (!m.dayNotes) return meta;
    return { ...m, dayNotes: Object.fromEntries(Object.entries(m.dayNotes).map(([d, v]) => [addDaysIso(d, days), v])) };
  };
  const changes: Change[] = [
    { table: 'programs', row: { ...program, start_date: addDaysIso(program.start_date, days) } },
    ...programWeeks.map((w) => ({
      table: 'program_weeks' as const,
      row: { ...w, start_date: addDaysIso(w.start_date, days), meta: shiftNotes(w.meta) as typeof w.meta },
    })),
    ...sessions.map((s) => ({ table: 'planned_sessions' as const, row: { ...s, date: addDaysIso(s.date, days) } })),
  ];
  const { batchId } = await commit(changes, { layer: 'planned', mutationBatch: {} });
  return batchId;
}

/**
 * Sets the type of a planned run (Lugnt, Tempo, …) by writing its title.
 * A plan change made by the user: one mutation batch, can be undone.
 */
export async function setRunIntent(plannedSessionId: string, intent: RunIntent | null): Promise<void> {
  const session = await db.planned_sessions.get(plannedSessionId);
  if (!session) throw new Error('Passet finns inte längre i planen.');
  if (session.owner !== (await getOwnerId())) throw new Error('Programmet är delat med dig och kan bara ändras av den som äger det.');
  await commit([{ table: 'planned_sessions', row: { ...session, title: intent ? INTENT_LABEL[intent] : null } }], {
    layer: 'planned',
    mutationBatch: {},
  });
}

export async function saveImportProfile(name: string, adapter: string, mapping: unknown): Promise<void> {
  const owner = await getOwnerId();
  const existing = await db.import_profiles.filter((p) => p.name === name && p.adapter === adapter && !p.deleted_at).first();
  const row: ImportProfileRow = existing
    ? { ...existing, mapping: mapping as ImportProfileRow['mapping'] }
    : { ...baseColumns(owner), name, adapter, mapping: mapping as ImportProfileRow['mapping'] };
  await commit([{ table: 'import_profiles', row }], { layer: 'logged' });
}
