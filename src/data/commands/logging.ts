import { z } from 'zod';
import { isIsoDate } from '@/domain/dates';
import { applyRunEdit, type RunPartField, type RunParts } from '@/domain/runParts';
import { DEFAULT_RETIRE_KM } from '@/domain/shoeMileage';
import { db } from '../local/db';
import type { LoggedRunRow, LoggedSessionRow, LoggedSetRow, PlannedSessionRow, ProfileRow, ShoeRow } from '../rows';
import { baseColumns, getOwnerId, nowStamp } from '../session';
import { commit, serial, softDeleted, type Change } from '../sync/commit';

/**
 * Logging commands. They only ever write logged_*, shoes and profiles: the
 * planned layer is untouched (enforced by commit({ layer: 'logged' })).
 */

const Date_ = z.string().refine(isIsoDate);

export type SessionStatus = LoggedSessionRow['status'];

/** Finds the live logged session for a planned session. */
export async function findLoggedFor(plannedSessionId: string): Promise<LoggedSessionRow | undefined> {
  const rows = await db.logged_sessions.where('planned_session_id').equals(plannedSessionId).toArray();
  return rows.filter((r) => !r.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

async function newLoggedSession(
  init: Pick<LoggedSessionRow, 'date' | 'type'> & Partial<LoggedSessionRow>,
): Promise<LoggedSessionRow> {
  const owner = await getOwnerId();
  return {
    ...baseColumns(owner),
    planned_session_id: null,
    title: null,
    status: 'partial',
    moved_from: null,
    feel: null,
    rpe: null,
    comment: null,
    ...init,
  };
}

/** Returns the logged session for a planned session, creating one in memory if missing. */
async function loggedFor(planned: PlannedSessionRow): Promise<LoggedSessionRow> {
  return (
    (await findLoggedFor(planned.id)) ??
    newLoggedSession({ planned_session_id: planned.id, date: planned.date, type: planned.type, title: planned.title })
  );
}

async function planned(id: string): Promise<PlannedSessionRow> {
  const p = await db.planned_sessions.get(id);
  if (!p) throw new Error('Passet finns inte längre i planen.');
  return p;
}

export const SessionPatch = z.object({
  status: z.enum(['done', 'partial', 'skipped', 'moved']).optional(),
  feel: z.number().int().min(1).max(5).nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  comment: z.string().nullable().optional(),
});

/** Marks a planned session as done / partial / skipped, creating its log if needed. */
async function setPlannedStatusImpl(plannedSessionId: string, status: SessionStatus | null): Promise<void> {
  const p = await planned(plannedSessionId);
  const logged = await loggedFor(p);
  if (status === null) {
    await commit([{ table: 'logged_sessions', row: softDeleted(logged) }], { layer: 'logged' });
    return;
  }
  await commit([{ table: 'logged_sessions', row: { ...logged, status } }], { layer: 'logged' });
}

/** Edits feel/RPE/comment of a planned session's log, creating the log on first input. */
async function updatePlannedSessionLogImpl(plannedSessionId: string, patch: z.input<typeof SessionPatch>): Promise<void> {
  const parsed = SessionPatch.parse(patch);
  const logged = await loggedFor(await planned(plannedSessionId));
  await commit([{ table: 'logged_sessions', row: { ...logged, ...parsed } }], { layer: 'logged' });
}

async function updateLoggedSessionImpl(id: string, patch: z.input<typeof SessionPatch>): Promise<void> {
  const parsed = SessionPatch.parse(patch);
  const row = await db.logged_sessions.get(id);
  if (!row) throw new Error('Loggen finns inte längre.');
  await commit([{ table: 'logged_sessions', row: { ...row, ...parsed } }], { layer: 'logged' });
}

export const RunPatch = z.object({
  distance_km: z.number().min(0).max(1000).nullable().optional(),
  duration_sec: z.number().int().min(0).nullable().optional(),
  surface: z.enum(['road', 'gravel', 'trail', 'technical', 'treadmill']).nullable().optional(),
  elevation_m: z.number().int().nullable().optional(),
  is_night: z.boolean().optional(),
  shoe_id: z.string().uuid().nullable().optional(),
  warmup_km: z.number().min(0).max(1000).nullable().optional(),
  main_km: z.number().min(0).max(1000).nullable().optional(),
  cooldown_km: z.number().min(0).max(1000).nullable().optional(),
  intervals_done: z.array(z.number().int().positive()).optional(),
  distance_manual: z.boolean().optional(),
});
export type RunPatch = z.input<typeof RunPatch>;

/** Defaults for rows created before the structured-run columns existed. */
function withRunDefaults(r: LoggedRunRow): LoggedRunRow {
  return {
    ...r,
    warmup_km: r.warmup_km ?? null,
    main_km: r.main_km ?? null,
    cooldown_km: r.cooldown_km ?? null,
    intervals_done: r.intervals_done ?? [],
    distance_manual: r.distance_manual ?? false,
  };
}

async function currentRun(loggedId: string): Promise<LoggedRunRow | undefined> {
  const r = (await db.logged_runs.where('logged_session_id').equals(loggedId).toArray()).find((x) => !x.deleted_at);
  return r ? withRunDefaults(r) : undefined;
}

async function upsertRun(logged: LoggedSessionRow, patch: RunPatch, extra: Change[] = []): Promise<void> {
  const parsed = RunPatch.parse(patch);
  const existing = await currentRun(logged.id);
  const owner = await getOwnerId();
  const run: LoggedRunRow = existing
    ? { ...existing, ...parsed }
    : {
        ...baseColumns(owner),
        logged_session_id: logged.id,
        distance_km: null,
        duration_sec: null,
        surface: null,
        elevation_m: null,
        is_night: false,
        shoe_id: null,
        warmup_km: null,
        main_km: null,
        cooldown_km: null,
        intervals_done: [],
        distance_manual: false,
        ...parsed,
      };
  await commit([{ table: 'logged_sessions', row: logged }, { table: 'logged_runs', row: run }, ...extra], { layer: 'logged' });
}

/**
 * Edits the total or one part of a planned run. The total follows the parts
 * until the user types it by hand (see domain/runParts).
 */
async function editPlannedRunFieldImpl(plannedSessionId: string, field: RunPartField | 'distance_km', value: number | null): Promise<void> {
  if (value != null && !(value >= 0 && value <= 1000)) throw new Error('Distansen måste vara mellan 0 och 1000 km.');
  const logged = await loggedFor(await planned(plannedSessionId));
  const run = await currentRun(logged.id);
  const current: RunParts = {
    distance_km: run?.distance_km ?? null,
    warmup_km: run?.warmup_km ?? null,
    main_km: run?.main_km ?? null,
    cooldown_km: run?.cooldown_km ?? null,
    distance_manual: run?.distance_manual ?? false,
  };
  await upsertRun(logged, applyRunEdit(current, field, value));
}

/** Ticks or unticks interval number n (1-based) of a planned structured run. */
async function toggleIntervalImpl(plannedSessionId: string, n: number): Promise<void> {
  if (!Number.isInteger(n) || n < 1) throw new Error('Ogiltigt intervallnummer.');
  const logged = await loggedFor(await planned(plannedSessionId));
  const done = new Set((await currentRun(logged.id))?.intervals_done ?? []);
  if (done.has(n)) done.delete(n);
  else done.add(n);
  await upsertRun(logged, { intervals_done: [...done].sort((a, b) => a - b) });
}

/** Logs (or edits) the run for a planned run session. Saves immediately; no save button. */
async function logPlannedRunImpl(plannedSessionId: string, patch: RunPatch): Promise<void> {
  const p = await planned(plannedSessionId);
  await upsertRun(await loggedFor(p), patch);
}

/** Logs a run that is not part of any program. */
async function logFreeRunImpl(date: string, patch: RunPatch, title?: string): Promise<string> {
  Date_.parse(date);
  const logged = await newLoggedSession({ date, type: 'run', status: 'done', title: title ?? null });
  await upsertRun(logged, patch);
  return logged.id;
}

/** Edits the run of an existing log (free sessions and sessions moved to another day). */
async function updateLoggedRunImpl(loggedSessionId: string, patch: RunPatch): Promise<void> {
  const logged = await db.logged_sessions.get(loggedSessionId);
  if (!logged) throw new Error('Loggen finns inte längre.');
  await upsertRun(logged, patch);
}

async function deleteLoggedSessionImpl(loggedSessionId: string): Promise<void> {
  const logged = await db.logged_sessions.get(loggedSessionId);
  if (!logged) return;
  await commit([{ table: 'logged_sessions', row: softDeleted(logged) }], { layer: 'logged' });
}

export async function getRunFor(loggedSessionId: string): Promise<LoggedRunRow | undefined> {
  return (await db.logged_runs.where('logged_session_id').equals(loggedSessionId).toArray()).find((r) => !r.deleted_at);
}

export const SetPatch = z.object({
  weight_kg: z.number().min(0).max(1000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  duration_sec: z.number().int().min(0).nullable().optional(),
  is_warmup: z.boolean().optional(),
  skipped: z.boolean().optional(),
});
export type SetPatch = z.input<typeof SetPatch>;

/** Writes one set of a planned exercise. Creates the logged session on first input. */
async function logPlannedSetImpl(
  plannedSessionId: string,
  plannedItemId: string,
  setNo: number,
  patch: SetPatch,
): Promise<void> {
  const parsed = SetPatch.parse(patch);
  const p = await planned(plannedSessionId);
  const item = await db.planned_items.get(plannedItemId);
  if (!item) throw new Error('Övningen finns inte längre i planen.');
  const logged = await loggedFor(p);
  const owner = await getOwnerId();
  const existing = (await db.logged_sets.where('logged_session_id').equals(logged.id).toArray()).find(
    (s) => s.planned_item_id === plannedItemId && s.set_no === setNo && !s.deleted_at,
  );
  const set: LoggedSetRow = existing
    ? { ...existing, ...parsed }
    : {
        ...baseColumns(owner),
        logged_session_id: logged.id,
        planned_item_id: plannedItemId,
        exercise_id: item.exercise_id,
        set_no: setNo,
        weight_kg: null,
        reps: null,
        rpe: null,
        duration_sec: null,
        is_warmup: false,
        skipped: false,
        ...parsed,
      };
  await commit([{ table: 'logged_sessions', row: logged }, { table: 'logged_sets', row: set }], { layer: 'logged' });
}

/** Marks every set of an exercise as skipped (or un-skips). */
async function skipPlannedExerciseImpl(plannedSessionId: string, plannedItemId: string, skipped: boolean): Promise<void> {
  const p = await planned(plannedSessionId);
  const item = await db.planned_items.get(plannedItemId);
  if (!item) throw new Error('Övningen finns inte längre i planen.');
  const logged = await loggedFor(p);
  const owner = await getOwnerId();
  const sets = (await db.logged_sets.where('logged_session_id').equals(logged.id).toArray()).filter(
    (s) => s.planned_item_id === plannedItemId && !s.deleted_at,
  );
  const changes: Change[] = [{ table: 'logged_sessions', row: logged }];
  if (sets.length) {
    for (const s of sets) changes.push({ table: 'logged_sets', row: { ...s, skipped } });
  } else {
    const count = Math.max(1, item.sets ?? 1);
    for (let n = 1; n <= count; n++) {
      changes.push({
        table: 'logged_sets',
        row: {
          ...baseColumns(owner),
          logged_session_id: logged.id,
          planned_item_id: plannedItemId,
          exercise_id: item.exercise_id,
          set_no: n,
          weight_kg: null,
          reps: null,
          rpe: null,
          duration_sec: null,
          is_warmup: false,
          skipped,
        },
      });
    }
  }
  await commit(changes, { layer: 'logged' });
}

async function deleteLoggedSetImpl(setId: string): Promise<void> {
  const s = await db.logged_sets.get(setId);
  if (!s) return;
  await commit([{ table: 'logged_sets', row: softDeleted(s) }], { layer: 'logged' });
}

/**
 * Moves a planned session to another day. The planned date is untouched: the
 * log gets status 'moved', the new date, and moved_from = the planned date.
 */
async function movePlannedSessionImpl(plannedSessionId: string, newDate: string): Promise<void> {
  Date_.parse(newDate);
  const p = await planned(plannedSessionId);
  const logged = await loggedFor(p);
  const row: LoggedSessionRow =
    newDate === p.date
      ? { ...logged, date: p.date, moved_from: null, status: logged.status === 'moved' ? 'partial' : logged.status }
      : { ...logged, date: newDate, moved_from: p.date, status: 'moved' };
  await commit([{ table: 'logged_sessions', row }], { layer: 'logged' });
}

/** Adds a free (unplanned) copy of a planned session on another day. */
async function duplicatePlannedSessionImpl(plannedSessionId: string, date: string): Promise<string> {
  Date_.parse(date);
  const p = await planned(plannedSessionId);
  const logged = await newLoggedSession({ date, type: p.type, title: p.title, status: 'partial' });
  await commit([{ table: 'logged_sessions', row: logged }], { layer: 'logged' });
  return logged.id;
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

export const NewShoe = z.object({
  name: z.string().trim().min(1, 'Skorna behöver ett namn.'),
  surface_type: z.enum(['road', 'trail', 'mixed']).default('road'),
  start_km: z.number().min(0).default(0),
  retire_km: z.number().min(0).optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

async function createShoeImpl(input: z.input<typeof NewShoe>): Promise<string> {
  const parsed = NewShoe.parse(input);
  const owner = await getOwnerId();
  const row: ShoeRow = {
    ...baseColumns(owner),
    name: parsed.name,
    brand: parsed.brand ?? null,
    model: parsed.model ?? null,
    surface_type: parsed.surface_type,
    start_km: parsed.start_km,
    retire_km: parsed.retire_km ?? DEFAULT_RETIRE_KM[parsed.surface_type],
    purchased_on: null,
    retired_on: null,
  };
  await commit([{ table: 'shoes', row }], { layer: 'logged' });
  return row.id;
}

async function updateShoeImpl(id: string, patch: Partial<Pick<ShoeRow, 'name' | 'surface_type' | 'start_km' | 'retire_km' | 'retired_on'>>): Promise<void> {
  const row = await db.shoes.get(id);
  if (!row) throw new Error('Skorna finns inte längre.');
  await commit([{ table: 'shoes', row: { ...row, ...patch } }], { layer: 'logged' });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getOrCreateProfile(): Promise<ProfileRow> {
  const owner = await getOwnerId();
  const existing = await db.profiles.get(owner);
  if (existing) return existing;
  const ts = nowStamp();
  return {
    id: owner,
    owner,
    display_name: null,
    locale: 'sv',
    units: 'metric',
    theme: 'night',
    race_date: null,
    goal: null,
    injury_notes: null,
    created_at: ts,
    updated_at: ts,
    server_updated_at: ts,
    deleted_at: null,
  };
}

async function updateProfileImpl(patch: Partial<Pick<ProfileRow, 'display_name' | 'theme' | 'race_date' | 'goal' | 'injury_notes'>>): Promise<void> {
  const profile = await getOrCreateProfile();
  await commit([{ table: 'profiles', row: { ...profile, ...patch } }], { layer: 'logged' });
}

/**
 * "Klart" / "Delvis" / "Hoppade" on a planned session. "Klart" on a run with no
 * logged distance records the planned distance. `keepMoved` keeps a moved log
 * on its new date (status becomes the result, moved_from stays).
 */
async function completePlannedSessionImpl(plannedSessionId: string, status: SessionStatus | null, plannedKm?: number): Promise<void> {
  const p = await planned(plannedSessionId);
  const logged = await loggedFor(p);
  if (status === null) {
    // Clearing a moved session's result keeps the move.
    const row = logged.moved_from ? { ...logged, status: 'moved' as const } : softDeleted(logged);
    await commit([{ table: 'logged_sessions', row }], { layer: 'logged' });
    return;
  }
  const next = { ...logged, status };
  if (status === 'done' && p.type === 'run' && plannedKm != null) {
    const run = await getRunFor(logged.id);
    if (run?.distance_km == null) {
      await upsertRun(next, { distance_km: plannedKm });
      return;
    }
  }
  await commit([{ table: 'logged_sessions', row: next }], { layer: 'logged' });
}

// Every write command runs serialized (see serial() in sync/commit.ts).
export const completePlannedSession = serial(completePlannedSessionImpl);
export const editPlannedRunField = serial(editPlannedRunFieldImpl);
export const toggleInterval = serial(toggleIntervalImpl);
export const setPlannedStatus = serial(setPlannedStatusImpl);
export const updatePlannedSessionLog = serial(updatePlannedSessionLogImpl);
export const updateLoggedSession = serial(updateLoggedSessionImpl);
export const logPlannedRun = serial(logPlannedRunImpl);
export const logFreeRun = serial(logFreeRunImpl);
export const updateLoggedRun = serial(updateLoggedRunImpl);
export const deleteLoggedSession = serial(deleteLoggedSessionImpl);
export const logPlannedSet = serial(logPlannedSetImpl);
export const skipPlannedExercise = serial(skipPlannedExerciseImpl);
export const deleteLoggedSet = serial(deleteLoggedSetImpl);
export const movePlannedSession = serial(movePlannedSessionImpl);
export const duplicatePlannedSession = serial(duplicatePlannedSessionImpl);
export const createShoe = serial(createShoeImpl);
export const updateShoe = serial(updateShoeImpl);
export const updateProfile = serial(updateProfileImpl);
