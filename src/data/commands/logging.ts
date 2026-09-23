import { z } from 'zod';
import { isIsoDate } from '@/domain/dates';
import { DEFAULT_RETIRE_KM } from '@/domain/shoeMileage';
import { db } from '../local/db';
import type { LoggedRunRow, LoggedSessionRow, LoggedSetRow, PlannedSessionRow, ProfileRow, ShoeRow } from '../rows';
import { baseColumns, getOwnerId, nowStamp } from '../session';
import { commit, softDeleted, type Change } from '../sync/commit';

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
export async function setPlannedStatus(plannedSessionId: string, status: SessionStatus | null): Promise<void> {
  const p = await planned(plannedSessionId);
  const logged = await loggedFor(p);
  if (status === null) {
    await commit([{ table: 'logged_sessions', row: softDeleted(logged) }], { layer: 'logged' });
    return;
  }
  await commit([{ table: 'logged_sessions', row: { ...logged, status } }], { layer: 'logged' });
}

/** Edits feel/RPE/comment of a planned session's log, creating the log on first input. */
export async function updatePlannedSessionLog(plannedSessionId: string, patch: z.input<typeof SessionPatch>): Promise<void> {
  const parsed = SessionPatch.parse(patch);
  const logged = await loggedFor(await planned(plannedSessionId));
  await commit([{ table: 'logged_sessions', row: { ...logged, ...parsed } }], { layer: 'logged' });
}

export async function updateLoggedSession(id: string, patch: z.input<typeof SessionPatch>): Promise<void> {
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
});
export type RunPatch = z.input<typeof RunPatch>;

async function upsertRun(logged: LoggedSessionRow, patch: RunPatch, extra: Change[] = []): Promise<void> {
  const parsed = RunPatch.parse(patch);
  const existing = (await db.logged_runs.where('logged_session_id').equals(logged.id).toArray()).find((r) => !r.deleted_at);
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
        ...parsed,
      };
  await commit([{ table: 'logged_sessions', row: logged }, { table: 'logged_runs', row: run }, ...extra], { layer: 'logged' });
}

/** Logs (or edits) the run for a planned run session. Saves immediately; no save button. */
export async function logPlannedRun(plannedSessionId: string, patch: RunPatch): Promise<void> {
  const p = await planned(plannedSessionId);
  await upsertRun(await loggedFor(p), patch);
}

/** Logs a run that is not part of any program. */
export async function logFreeRun(date: string, patch: RunPatch, title?: string): Promise<string> {
  Date_.parse(date);
  const logged = await newLoggedSession({ date, type: 'run', status: 'done', title: title ?? null });
  await upsertRun(logged, patch);
  return logged.id;
}

/** Edits the run of an existing log (free sessions and sessions moved to another day). */
export async function updateLoggedRun(loggedSessionId: string, patch: RunPatch): Promise<void> {
  const logged = await db.logged_sessions.get(loggedSessionId);
  if (!logged) throw new Error('Loggen finns inte längre.');
  await upsertRun(logged, patch);
}

export async function deleteLoggedSession(loggedSessionId: string): Promise<void> {
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
export async function logPlannedSet(
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
export async function skipPlannedExercise(plannedSessionId: string, plannedItemId: string, skipped: boolean): Promise<void> {
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

export async function deleteLoggedSet(setId: string): Promise<void> {
  const s = await db.logged_sets.get(setId);
  if (!s) return;
  await commit([{ table: 'logged_sets', row: softDeleted(s) }], { layer: 'logged' });
}

/**
 * Moves a planned session to another day. The planned date is untouched: the
 * log gets status 'moved', the new date, and moved_from = the planned date.
 */
export async function movePlannedSession(plannedSessionId: string, newDate: string): Promise<void> {
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
export async function duplicatePlannedSession(plannedSessionId: string, date: string): Promise<string> {
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

export async function createShoe(input: z.input<typeof NewShoe>): Promise<string> {
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

export async function updateShoe(id: string, patch: Partial<Pick<ShoeRow, 'name' | 'surface_type' | 'start_km' | 'retire_km' | 'retired_on'>>): Promise<void> {
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

export async function updateProfile(patch: Partial<Pick<ProfileRow, 'display_name' | 'theme' | 'race_date' | 'goal' | 'injury_notes'>>): Promise<void> {
  const profile = await getOrCreateProfile();
  await commit([{ table: 'profiles', row: { ...profile, ...patch } }], { layer: 'logged' });
}
