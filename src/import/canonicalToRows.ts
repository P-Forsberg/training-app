import { dayIndex } from '@/domain/dates';
import { buildExerciseIndex, matchExercise } from '@/domain/exerciseMatch';
import type { Change } from '@/data/sync/commit';
import type {
  ExerciseRow,
  PlannedItemRow,
  PlannedSessionRow,
  ProgramNoteRow,
  ProgramRow,
  ProgramWeekRow,
} from '@/data/rows';
import type { CanonicalProgram } from './canonical';

/** Confidence given to an item whose exercise name was not found in the catalog. */
export const UNKNOWN_EXERCISE_CONFIDENCE = 0.8;

export interface RowFactory {
  owner: string;
  newId: () => string;
  now: () => string;
}

export interface ConversionResult {
  programId: string;
  changes: Change[];
  newExercises: ExerciseRow[];
}

/**
 * Turns a reviewed canonical program into rows. Pure apart from the injected
 * id/clock factory, so it is fully testable. Nothing is written here.
 */
export function canonicalToRows(program: CanonicalProgram, existingExercises: ExerciseRow[], f: RowFactory): ConversionResult {
  const base = () => {
    const ts = f.now();
    return { id: f.newId(), owner: f.owner, created_at: ts, updated_at: ts, server_updated_at: ts, deleted_at: null };
  };

  const index = buildExerciseIndex(
    existingExercises
      .filter((e) => !e.deleted_at && (e.owner === null || e.owner === f.owner))
      .map((e) => ({ ...e, canonicalName: e.canonical_name })),
  );
  const newExercises: ExerciseRow[] = [];
  const created = new Map<string, ExerciseRow>();

  const resolveExercise = (name: string): { id: string; known: boolean } => {
    const hit = matchExercise(name, index);
    if (hit) return { id: hit.exercise.id, known: true };
    const key = name.trim().toLowerCase();
    let ex = created.get(key);
    if (!ex) {
      ex = {
        ...base(),
        canonical_name: name.trim(),
        aliases: [],
        category: null,
        movement_pattern: null,
        is_barbell: false,
        notes: null,
      };
      created.set(key, ex);
      newExercises.push(ex);
    }
    return { id: ex.id, known: false };
  };

  const programRow: ProgramRow = {
    ...base(),
    name: program.name,
    discipline: program.discipline ?? null,
    start_date: program.startDate,
    race_date: program.raceDate ?? null,
    weeks: program.weeks.length,
    source: program.source,
    source_meta: program.sourceMeta as ProgramRow['source_meta'],
    schema_version: program.schemaVersion,
    is_template: false,
    is_active: true,
  };

  const changes: Change[] = [];
  changes.push({ table: 'programs', row: programRow });

  program.notes.forEach((n, i) => {
    const row: ProgramNoteRow = { ...base(), program_id: programRow.id, section: n.section, key: n.key, value: n.value, sort: i };
    changes.push({ table: 'program_notes', row });
  });

  for (const w of program.weeks) {
    const week: ProgramWeekRow = {
      ...base(),
      program_id: programRow.id,
      week_no: w.weekNo,
      start_date: w.startDate,
      phase: w.phase ?? null,
      focus_text: w.focusText ?? null,
      meta: w.meta as ProgramWeekRow['meta'],
    };
    changes.push({ table: 'program_weeks', row: week });

    const sortByDate = new Map<string, number>();
    for (const s of w.sessions) {
      const sort = sortByDate.get(s.date) ?? 0;
      sortByDate.set(s.date, sort + 1);
      const session: PlannedSessionRow = {
        ...base(),
        program_id: programRow.id,
        program_week_id: week.id,
        date: s.date,
        day_of_week: dayIndex(s.date) + 1,
        type: s.type,
        title: s.title ?? null,
        sort,
        notes: s.notes ?? null,
      };
      changes.push({ table: 'planned_sessions', row: session });

      s.items.forEach((item, i) => {
        let exerciseId: string | null = null;
        let confidence = item.parseConfidence;
        if (item.kind === 'exercise' && item.exerciseName) {
          const r = resolveExercise(item.exerciseName);
          exerciseId = r.id;
          if (!r.known) confidence = Math.min(confidence, UNKNOWN_EXERCISE_CONFIDENCE);
        }
        const row: PlannedItemRow = {
          ...base(),
          program_id: programRow.id,
          planned_session_id: session.id,
          sort: i,
          kind: item.kind,
          exercise_id: exerciseId,
          raw_text: item.rawText,
          sets: item.sets ?? null,
          reps: item.reps ?? null,
          reps_max: item.repsMax ?? null,
          rep_scheme: item.repScheme ?? null,
          load: item.load ?? null,
          load_unit: item.loadUnit ?? null,
          per_side: item.perSide,
          distance_km: item.distanceKm ?? null,
          duration_sec: item.durationSec ?? null,
          parse_confidence: confidence,
        };
        changes.push({ table: 'planned_items', row });
      });
    }
  }

  // Exercises first: planned_items reference them (push order matters for foreign keys).
  const exerciseChanges: Change[] = newExercises.map((row) => ({ table: 'exercises', row }));
  return { programId: programRow.id, changes: [...exerciseChanges, ...changes], newExercises };
}
