import { beforeEach, describe, expect, it } from 'vitest';
import { CanonicalProgram } from '@/import/canonical';
import { parse } from '@/import/adapters/xlsxKullamannen';
import { syntheticKullamannen } from '@/import/fixtures/syntheticKullamannen';
import { db } from '../local/db';
import { resetOwnerCache } from '../session';
import { commit, LayerViolationError } from '../sync/commit';
import { completePlannedSession, createExercise, createShoe, editPlannedRunField, substituteExercise, logPlannedRun, toggleInterval, logPlannedSet, movePlannedSession, setPlannedStatus } from './logging';
import { importProgram } from './program';
import { undoBatch } from './undo';

async function freshDb() {
  db.close();
  await db.delete();
  await db.open();
  resetOwnerCache();
}

async function importSynthetic() {
  return importProgram(CanonicalProgram.parse(parse(syntheticKullamannen(4), 'Test.xlsx')));
}

describe('importProgram', () => {
  beforeEach(freshDb);

  it('writes the program, weeks, sessions and items locally and queues them', async () => {
    const { programId, newExercises } = await importSynthetic();
    const program = await db.programs.get(programId);
    expect(program).toMatchObject({ name: 'Test', is_active: true, start_date: '2026-09-21' });
    expect(await db.program_weeks.where('program_id').equals(programId).count()).toBe(4);
    expect(await db.program_notes.count()).toBe(3);
    const sessions = await db.planned_sessions.where('program_id').equals(programId).toArray();
    expect(sessions.length).toBeGreaterThan(20);
    expect(sessions.every((s) => s.day_of_week >= 1 && s.day_of_week <= 7)).toBe(true);
    expect(newExercises).toBe(1); // "Okänd testövning"
    const unknown = (await db.planned_items.toArray()).find((i) => i.raw_text?.startsWith('Okänd'));
    expect(unknown!.parse_confidence).toBeLessThan(1);
    expect(await db.outbox.count()).toBeGreaterThan(sessions.length);
  });

  it('matches known exercises against the bundled catalog', async () => {
    await importSynthetic();
    const items = await db.planned_items.toArray();
    const boxSquat = items.find((i) => i.raw_text === 'Box Squat – 1–3RM');
    const ex = await db.exercises.get(boxSquat!.exercise_id!);
    expect(ex).toMatchObject({ canonical_name: 'Box Squat', owner: null });
  });

  it('a second import becomes active and the first is deactivated', async () => {
    const a = await importSynthetic();
    const b = await importSynthetic();
    expect((await db.programs.get(a.programId))!.is_active).toBe(false);
    expect((await db.programs.get(b.programId))!.is_active).toBe(true);
  });

  it('can be undone in one step', async () => {
    const { programId, batchId } = await importSynthetic();
    await undoBatch(batchId);
    expect((await db.programs.get(programId))!.deleted_at).not.toBeNull();
    const live = (await db.planned_sessions.where('program_id').equals(programId).toArray()).filter((s) => !s.deleted_at);
    expect(live).toEqual([]);
    await expect(undoBatch(batchId)).rejects.toThrow();
  });
});

describe('logging never touches the planned layer', () => {
  beforeEach(freshDb);

  it('commit rejects planned tables for logging commands', async () => {
    const { programId } = await importSynthetic();
    const program = (await db.programs.get(programId))!;
    await expect(commit([{ table: 'programs', row: program }], { layer: 'logged' })).rejects.toBeInstanceOf(LayerViolationError);
  });

  it('logging a run and sets leaves planned rows byte-identical', async () => {
    const { programId } = await importSynthetic();
    const before = JSON.stringify(await db.planned_sessions.toArray()) + JSON.stringify(await db.planned_items.toArray());
    const run = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run')!;
    const strength = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'strength')!;
    const item = (await db.planned_items.where('planned_session_id').equals(strength.id).toArray())[0]!;

    const shoe = await createShoe({ name: 'Testsko', surface_type: 'trail' });
    await logPlannedRun(run.id, { distance_km: 7.5, surface: 'trail', shoe_id: shoe });
    await setPlannedStatus(run.id, 'done');
    await logPlannedSet(strength.id, item.id, 1, { weight_kg: 100, reps: 3, rpe: 8 });
    await movePlannedSession(strength.id, '2026-09-22');

    const after = JSON.stringify(await db.planned_sessions.toArray()) + JSON.stringify(await db.planned_items.toArray());
    expect(after).toBe(before);

    const logged = await db.logged_sessions.toArray();
    expect(logged).toHaveLength(2);
    const runLog = logged.find((l) => l.planned_session_id === run.id)!;
    expect(runLog.status).toBe('done');
    const runRow = (await db.logged_runs.toArray())[0]!;
    expect(runRow).toMatchObject({ distance_km: 7.5, surface: 'trail', shoe_id: shoe });
    const moved = logged.find((l) => l.planned_session_id === strength.id)!;
    expect(moved).toMatchObject({ status: 'moved', date: '2026-09-22', moved_from: strength.date });
    expect((await db.shoes.get(shoe))!.retire_km).toBe(600);
  });

  it('a typed distance saved on blur is not overwritten by "Klart" pressed right after', async () => {
    const { programId } = await importSynthetic();
    const run = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run')!;
    // Fired without awaiting, like blur followed by click.
    const a = logPlannedRun(run.id, { distance_km: 7.5 });
    const b = completePlannedSession(run.id, 'done', 6);
    await Promise.all([a, b]);
    expect((await db.logged_sessions.toArray()).filter((l) => !l.deleted_at)).toHaveLength(1);
    expect((await db.logged_runs.toArray())[0]!.distance_km).toBe(7.5);
    expect((await db.logged_sessions.toArray())[0]!.status).toBe('done');
  });

  it('"Klart" without a typed distance logs the planned distance', async () => {
    const { programId } = await importSynthetic();
    const run = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run')!;
    await completePlannedSession(run.id, 'done', 5);
    expect((await db.logged_runs.toArray())[0]!.distance_km).toBe(5);
  });

  it('structured run: parts are stored separately and the total follows them until typed by hand', async () => {
    const { programId } = await importSynthetic();
    const wed = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run' && s.date === '2026-09-23')!;
    expect(wed.notes).toMatch(/^Intervaller:/);

    await editPlannedRunField(wed.id, 'warmup_km', 3);
    await editPlannedRunField(wed.id, 'main_km', 4.1);
    await editPlannedRunField(wed.id, 'cooldown_km', 3);
    let run = (await db.logged_runs.toArray())[0]!;
    expect(run).toMatchObject({ warmup_km: 3, main_km: 4.1, cooldown_km: 3, distance_km: 10.1, distance_manual: false });

    await editPlannedRunField(wed.id, 'distance_km', 11);
    await editPlannedRunField(wed.id, 'cooldown_km', 4);
    run = (await db.logged_runs.toArray())[0]!;
    expect(run).toMatchObject({ cooldown_km: 4, distance_km: 11, distance_manual: true });

    await editPlannedRunField(wed.id, 'distance_km', null);
    run = (await db.logged_runs.toArray())[0]!;
    expect(run).toMatchObject({ distance_km: 11.1, distance_manual: false });
  });

  it('intervals are ticked and unticked one by one', async () => {
    const { programId } = await importSynthetic();
    const wed = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run' && s.date === '2026-09-23')!;
    await Promise.all([toggleInterval(wed.id, 1), toggleInterval(wed.id, 3), toggleInterval(wed.id, 2)]);
    expect((await db.logged_runs.toArray())[0]!.intervals_done).toEqual([1, 2, 3]);
    await toggleInterval(wed.id, 2);
    expect((await db.logged_runs.toArray())[0]!.intervals_done).toEqual([1, 3]);
    expect(await db.logged_runs.count()).toBe(1);
  });

  it('swapping an exercise is stored on the logged sets; the plan is untouched', async () => {
    const { programId } = await importSynthetic();
    const strength = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'strength')!;
    const item = (await db.planned_items.where('planned_session_id').equals(strength.id).toArray()).find((i) => i.kind === 'exercise')!;
    const plannedBefore = JSON.stringify(await db.planned_items.get(item.id));

    const landmine = await createExercise('Landmine Row');
    expect(await createExercise('  landmine   row ')).toBe(landmine); // reused, not duplicated

    // Swap before any set is logged: an empty first set carries the swap.
    await substituteExercise(strength.id, item.id, landmine);
    let sets = await db.logged_sets.toArray();
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ exercise_id: landmine, weight_kg: null, reps: null });

    // New sets use the swapped exercise.
    await logPlannedSet(strength.id, item.id, 2, { weight_kg: 40, reps: 10 });
    sets = await db.logged_sets.toArray();
    expect(sets.every((s) => s.exercise_id === landmine)).toBe(true);

    // The plan still says what was planned.
    expect(JSON.stringify(await db.planned_items.get(item.id))).toBe(plannedBefore);

    // Back to the planned exercise: all sets follow.
    await substituteExercise(strength.id, item.id, null);
    sets = await db.logged_sets.toArray();
    expect(sets.every((s) => s.exercise_id === item.exercise_id)).toBe(true);
  });

  it('swapping to an unknown exercise id is refused', async () => {
    const { programId } = await importSynthetic();
    const strength = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'strength')!;
    const item = (await db.planned_items.where('planned_session_id').equals(strength.id).toArray())[0]!;
    await expect(substituteExercise(strength.id, item.id, '00000000-0000-4000-8000-00000000dead')).rejects.toThrow();
    expect(await db.logged_sets.count()).toBe(0);
  });

  it('editing the same run twice updates one row', async () => {
    const { programId } = await importSynthetic();
    const run = (await db.planned_sessions.where('program_id').equals(programId).toArray()).find((s) => s.type === 'run')!;
    await logPlannedRun(run.id, { distance_km: 5 });
    await logPlannedRun(run.id, { distance_km: 6, duration_sec: 1800 });
    const runs = await db.logged_runs.toArray();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ distance_km: 6, duration_sec: 1800 });
  });
});
