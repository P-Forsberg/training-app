import { create } from 'zustand';
import type { CanonicalProgramInput } from '@/import/canonical';

/** A program produced elsewhere (AI) waiting for the same review view as a file import. */
export const usePendingImport = create<{ program: CanonicalProgramInput | null; set: (p: CanonicalProgramInput | null) => void }>((set) => ({
  program: null,
  set: (program) => set({ program }),
}));

/** Normalizes a model-produced program to the canonical input shape before review. */
export function fromAiProgram(p: Record<string, unknown>, source: 'ai' | 'image'): CanonicalProgramInput {
  const weeks = Array.isArray(p.weeks) ? (p.weeks as Record<string, unknown>[]) : [];
  return {
    schemaVersion: 1,
    name: typeof p.name === 'string' && p.name ? p.name : source === 'ai' ? 'Program från assistenten' : 'Program från bild',
    discipline: typeof p.discipline === 'string' ? p.discipline : undefined,
    startDate: String(p.startDate ?? ''),
    raceDate: typeof p.raceDate === 'string' && p.raceDate ? p.raceDate : undefined,
    source,
    sourceMeta: { adapter: source },
    notes: [],
    warnings: [],
    weeks: weeks.map((w) => ({
      weekNo: Number(w.weekNo),
      startDate: String(w.startDate ?? ''),
      phase: typeof w.phase === 'string' ? w.phase : undefined,
      focusText: typeof w.focusText === 'string' ? w.focusText : undefined,
      meta: {},
      sessions: (Array.isArray(w.sessions) ? (w.sessions as Record<string, unknown>[]) : []).map((s) => ({
        date: String(s.date ?? ''),
        type: (['run', 'strength', 'other', 'rest'].includes(String(s.type)) ? s.type : 'other') as 'run' | 'strength' | 'other' | 'rest',
        title: typeof s.title === 'string' ? s.title : undefined,
        items: (Array.isArray(s.items) ? (s.items as Record<string, unknown>[]) : []).map((i) => ({
          kind: (['distance', 'duration', 'exercise'].includes(String(i.kind)) ? i.kind : 'exercise') as 'distance' | 'duration' | 'exercise',
          rawText: String(i.rawText ?? ''),
          exerciseName: typeof i.exerciseName === 'string' ? i.exerciseName : undefined,
          sets: typeof i.sets === 'number' ? i.sets : undefined,
          reps: typeof i.reps === 'number' ? i.reps : undefined,
          repsMax: typeof i.repsMax === 'number' ? i.repsMax : undefined,
          repScheme: i.repScheme as 'fixed' | 'range' | 'amrap' | 'rm' | 'time' | undefined,
          load: typeof i.load === 'number' ? i.load : undefined,
          loadUnit: i.loadUnit as 'kg' | 'percent' | 'rpe' | 'bodyweight' | 'band' | undefined,
          perSide: i.perSide === true,
          distanceKm: typeof i.distanceKm === 'number' ? i.distanceKm : undefined,
          durationSec: typeof i.durationSec === 'number' ? i.durationSec : undefined,
          parseConfidence: typeof i.parseConfidence === 'number' ? Math.max(0, Math.min(1, i.parseConfidence)) : 1,
        })),
      })),
    })),
  };
}
