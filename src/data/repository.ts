import { useDbQuery } from './live';
import { addDaysIso, todayIso, weekDates, weekStartIso } from '@/domain/dates';
import { deriveWeekFlags, type DayFlags, type WeekFlags } from '@/domain/deriveWeekFlags';
import { deriveRunIntents, type IntentInfo } from '@/domain/sessionIntent';
import { plannedSessionStatus, type DisplayStatus } from '@/domain/sessionStatus';
import { shoeMileage, shoeStatus, type ShoeStatus } from '@/domain/shoeMileage';
import type { PlannedSessionLike } from '@/domain/types';
import { db } from './local/db';
import { getOwnerId } from './session';
import type {
  ExerciseRow,
  LoggedRunRow,
  LoggedSessionRow,
  LoggedSetRow,
  PlannedItemRow,
  PlannedSessionRow,
  ProgramNoteRow,
  ProgramRow,
  ProgramWeekRow,
  ShoeRow,
} from './rows';

/**
 * Read side of the repository. The UI reads only through these functions and
 * hooks; they always read the local Dexie store, which sync keeps up to date.
 * Writes go through data/commands (command layer), never from here.
 */

const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

export interface PlannedSessionView {
  session: PlannedSessionRow;
  items: PlannedItemRow[];
  logged?: LoggedSessionRow;
  run?: LoggedRunRow;
  sets: LoggedSetRow[];
  status: DisplayStatus;
  /** Easy / tempo / … for runs, read from the program's text or a user-set title. */
  intent?: IntentInfo;
}

/** A log shown on a day without a planned session there: free sessions and sessions moved in. */
export interface ExtraLogView {
  logged: LoggedSessionRow;
  planned?: PlannedSessionRow;
  items: PlannedItemRow[];
  run?: LoggedRunRow;
  sets: LoggedSetRow[];
}

export interface DayView {
  date: string;
  sessions: PlannedSessionView[];
  extras: ExtraLogView[];
  flags: DayFlags;
  note?: string;
  loggedKm: number;
}

export interface WeekView {
  monday: string;
  program?: ProgramRow;
  week?: ProgramWeekRow;
  days: DayView[];
  flags: WeekFlags;
  loggedKm: number;
  plannedStrength: number;
}

export async function loadActiveProgram(): Promise<ProgramRow | undefined> {
  const programs = live(await db.programs.toArray());
  const override = (await db.meta.get('active_program_override'))?.value;
  const viewing = typeof override === 'string' ? programs.find((p) => p.id === override) : undefined;
  if (viewing) return viewing;
  const owner = await getOwnerId();
  const mine = programs.filter((p) => p.owner === owner);
  return mine.find((p) => p.is_active) ?? mine.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

async function plannedInRange(programId: string, from: string, to: string) {
  const sessions = live(
    await db.planned_sessions.where('[program_id+date]').between([programId, from], [programId, to], true, true).toArray(),
  );
  const items = live(await db.planned_items.where('planned_session_id').anyOf(sessions.map((s) => s.id)).toArray());
  return { sessions, items };
}

function toLike(sessions: PlannedSessionRow[], items: PlannedItemRow[]): PlannedSessionLike[] {
  return sessions.map((s) => ({
    id: s.id,
    date: s.date,
    type: s.type,
    items: items.filter((i) => i.planned_session_id === s.id).map((i) => ({ kind: i.kind, distanceKm: i.distance_km ?? undefined, durationSec: i.duration_sec ?? undefined })),
  }));
}

function runKm(run: LoggedRunRow | undefined, logged: LoggedSessionRow): number {
  if (!run || logged.status === 'skipped') return 0;
  return run.distance_km ?? 0;
}

export async function loadWeek(mondayInput: string, today = todayIso()): Promise<WeekView> {
  const monday = weekStartIso(mondayInput);
  const sunday = addDaysIso(monday, 6);
  const dates = weekDates(monday);
  const program = await loadActiveProgram();

  let sessions: PlannedSessionRow[] = [];
  let items: PlannedItemRow[] = [];
  let week: ProgramWeekRow | undefined;
  let prevLike: PlannedSessionLike[] | undefined;
  let nextLike: PlannedSessionLike[] | undefined;

  if (program) {
    ({ sessions, items } = await plannedInRange(program.id, monday, sunday));
    const weeks = live(await db.program_weeks.where('program_id').equals(program.id).toArray());
    week = weeks.find((w) => w.start_date === monday);
    const prev = await plannedInRange(program.id, addDaysIso(monday, -7), addDaysIso(monday, -1));
    prevLike = toLike(prev.sessions, prev.items);
    const nextMonday = addDaysIso(monday, 7);
    const next = await plannedInRange(program.id, nextMonday, addDaysIso(monday, 13));
    const nextExists = weeks.some((w) => w.start_date === nextMonday) || next.sessions.length > 0;
    nextLike = nextExists ? toLike(next.sessions, next.items) : undefined;
  }

  const loggedHere = live(await db.logged_sessions.where('date').between(monday, sunday, true, true).toArray());
  const loggedForPlanned = live(await db.logged_sessions.where('planned_session_id').anyOf(sessions.map((s) => s.id)).toArray());
  const allLogged = new Map<string, LoggedSessionRow>();
  for (const l of [...loggedHere, ...loggedForPlanned]) allLogged.set(l.id, l);
  const loggedIds = [...allLogged.keys()];
  const runs = live(await db.logged_runs.where('logged_session_id').anyOf(loggedIds).toArray());
  const sets = live(await db.logged_sets.where('logged_session_id').anyOf(loggedIds).toArray());

  // Moved-in sessions may reference planned sessions outside this week.
  const outsidePlannedIds = loggedHere
    .map((l) => l.planned_session_id)
    .filter((id): id is string => !!id && !sessions.some((s) => s.id === id));
  const outsidePlanned = live(await db.planned_sessions.bulkGet(outsidePlannedIds).then((r) => r.filter((x): x is PlannedSessionRow => !!x)));
  const outsideItems = live(await db.planned_items.where('planned_session_id').anyOf(outsidePlannedIds).toArray());

  const latestLogFor = (plannedId: string) =>
    [...allLogged.values()]
      .filter((l) => l.planned_session_id === plannedId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

  const flags = deriveWeekFlags(monday, toLike(sessions, items), { previousWeekSessions: prevLike, nextWeekSessions: nextLike });
  const dayNotes = (week?.meta as { dayNotes?: Record<string, string> } | null)?.dayNotes ?? {};
  // Day instructions plus each run's own note (e.g. the week's quality session).
  const textByDate: Record<string, string> = { ...dayNotes };
  for (const s of sessions) {
    if (s.type === 'run' && s.notes) textByDate[s.date] = textByDate[s.date] ? `${textByDate[s.date]}\n${s.notes}` : s.notes;
  }
  const intents = deriveRunIntents({
    monday,
    weekTexts: [week?.focus_text],
    dayNotes: textByDate,
    runs: sessions.filter((s) => s.type === 'run').map((s) => ({ id: s.id, date: s.date, title: s.title })),
  });

  const days: DayView[] = dates.map((date, i) => {
    const daySessions = sessions
      .filter((s) => s.date === date)
      .sort((a, b) => a.sort - b.sort || (a.type === 'run' ? -1 : 1))
      .map<PlannedSessionView>((session) => {
        const logged = latestLogFor(session.id);
        return {
          session,
          items: items.filter((it) => it.planned_session_id === session.id).sort((a, b) => a.sort - b.sort),
          logged,
          run: logged ? runs.find((r) => r.logged_session_id === logged.id) : undefined,
          sets: logged ? sets.filter((s) => s.logged_session_id === logged.id) : [],
          status: plannedSessionStatus(session, logged, today),
          intent: intents.get(session.id),
        };
      });

    const extras: ExtraLogView[] = loggedHere
      .filter((l) => l.date === date)
      .filter((l) => !l.planned_session_id || !daySessions.some((s) => s.session.id === l.planned_session_id))
      .map((logged) => {
        const planned = logged.planned_session_id
          ? [...sessions, ...outsidePlanned].find((s) => s.id === logged.planned_session_id)
          : undefined;
        return {
          logged,
          planned,
          items: planned ? [...items, ...outsideItems].filter((it) => it.planned_session_id === planned.id) : [],
          run: runs.find((r) => r.logged_session_id === logged.id),
          sets: sets.filter((s) => s.logged_session_id === logged.id),
        };
      });

    const loggedKm = loggedHere.filter((l) => l.date === date).reduce((sum, l) => sum + runKm(runs.find((r) => r.logged_session_id === l.id), l), 0);

    return { date, sessions: daySessions, extras, flags: flags.days[i]!, note: dayNotes[date], loggedKm };
  });

  return {
    monday,
    program,
    week,
    days,
    flags,
    loggedKm: Math.round(days.reduce((s, d) => s + d.loggedKm, 0) * 10) / 10,
    plannedStrength: flags.totals.strengthSessions,
  };
}

export function useWeek(monday: string): WeekView | undefined {
  return useDbQuery(() => loadWeek(monday), [monday]);
}

export function useActiveProgram(): ProgramRow | undefined | null {
  return useDbQuery(async () => (await loadActiveProgram()) ?? null, []);
}

export function usePrograms(): ProgramRow[] | undefined {
  return useDbQuery(async () => live(await db.programs.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)), []);
}

export function useProgramWeeks(programId: string | undefined): ProgramWeekRow[] | undefined {
  return useDbQuery(
    async () => (programId ? live(await db.program_weeks.where('program_id').equals(programId).toArray()).sort((a, b) => a.week_no - b.week_no) : []),
    [programId],
  );
}

export function useProgramNotes(programId: string | undefined): ProgramNoteRow[] | undefined {
  return useDbQuery(
    async () => (programId ? live(await db.program_notes.where('program_id').equals(programId).toArray()).sort((a, b) => a.sort - b.sort) : []),
    [programId],
  );
}

export function useExercises(): Map<string, ExerciseRow> | undefined {
  return useDbQuery(async () => new Map(live(await db.exercises.toArray()).map((e) => [e.id, e])), []);
}

// ---------------------------------------------------------------------------
// Previous sets (ghost placeholders in the strength grid)
// ---------------------------------------------------------------------------

/** The most recent earlier session's sets per exercise, keyed by exercise id then set number. */
export async function loadPreviousSets(exerciseIds: string[], beforeDate: string): Promise<Map<string, { date: string; sets: LoggedSetRow[] }>> {
  const out = new Map<string, { date: string; sets: LoggedSetRow[] }>();
  if (!exerciseIds.length) return out;
  const sets = live(await db.logged_sets.where('exercise_id').anyOf(exerciseIds).toArray()).filter((s) => !s.skipped);
  const sessionIds = [...new Set(sets.map((s) => s.logged_session_id))];
  const sessions = new Map(live(await db.logged_sessions.bulkGet(sessionIds).then((r) => r.filter((x): x is LoggedSessionRow => !!x))).map((s) => [s.id, s]));
  for (const id of exerciseIds) {
    let best: { date: string; sessionId: string } | undefined;
    for (const s of sets) {
      if (s.exercise_id !== id) continue;
      const session = sessions.get(s.logged_session_id);
      if (!session || session.date >= beforeDate) continue;
      if (!best || session.date > best.date) best = { date: session.date, sessionId: session.id };
    }
    if (best) {
      out.set(id, {
        date: best.date,
        sets: sets.filter((s) => s.logged_session_id === best!.sessionId && s.exercise_id === id).sort((a, b) => a.set_no - b.set_no),
      });
    }
  }
  return out;
}

export function usePreviousSets(exerciseIds: string[], beforeDate: string) {
  const key = exerciseIds.join(',');
  return useDbQuery(() => loadPreviousSets(exerciseIds, beforeDate), [key, beforeDate]);
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

export interface ShoeView {
  shoe: ShoeRow;
  km: number;
  status: ShoeStatus;
}

export async function loadShoes(): Promise<ShoeView[]> {
  const shoes = live(await db.shoes.toArray());
  const sessions = new Map((await db.logged_sessions.toArray()).map((s) => [s.id, s]));
  const runs = (await db.logged_runs.toArray()).map((r) => ({
    shoeId: r.shoe_id,
    distanceKm: r.distance_km,
    deleted: !!r.deleted_at || !!sessions.get(r.logged_session_id)?.deleted_at || sessions.get(r.logged_session_id)?.status === 'skipped',
  }));
  return shoes
    .map((shoe) => {
      const km = shoeMileage({ id: shoe.id, startKm: shoe.start_km }, runs);
      return { shoe, km, status: shoeStatus(km, shoe.retire_km) };
    })
    .sort((a, b) => Number(!!a.shoe.retired_on) - Number(!!b.shoe.retired_on) || a.shoe.name.localeCompare(b.shoe.name, 'sv'));
}

export function useShoes(): ShoeView[] | undefined {
  return useDbQuery(loadShoes, []);
}

// ---------------------------------------------------------------------------
// Program overview (calendar, stats)
// ---------------------------------------------------------------------------

export interface ProgramOverview {
  program?: ProgramRow;
  weeks: ProgramWeekRow[];
  sessions: PlannedSessionRow[];
  items: PlannedItemRow[];
  logged: LoggedSessionRow[];
  runs: LoggedRunRow[];
  sets: LoggedSetRow[];
}

export async function loadOverview(): Promise<ProgramOverview> {
  const program = await loadActiveProgram();
  const weeks = program ? live(await db.program_weeks.where('program_id').equals(program.id).toArray()) : [];
  const sessions = program ? live(await db.planned_sessions.where('program_id').equals(program.id).toArray()) : [];
  const items = program ? live(await db.planned_items.where('program_id').equals(program.id).toArray()) : [];
  const logged = live(await db.logged_sessions.toArray());
  const runs = live(await db.logged_runs.toArray());
  const sets = live(await db.logged_sets.toArray());
  return { program, weeks: weeks.sort((a, b) => a.week_no - b.week_no), sessions, items, logged, runs, sets };
}

export function useOverview(): ProgramOverview | undefined {
  return useDbQuery(loadOverview, []);
}

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

export function useOutboxCounts(): { pending: number; failed: number } | undefined {
  return useDbQuery(async () => ({ pending: await db.outbox.count(), failed: await db.dead_letter.count() }), []);
}
