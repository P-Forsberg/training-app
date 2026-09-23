import { z } from 'zod';
import { isIsoDate, isMonday } from '@/domain/dates';

/**
 * Canonical Program JSON. Every import source (xlsx, image, AI) produces this,
 * and everything goes through the same review view before it is saved.
 * Versioned: bump schemaVersion and add a migration function when the shape changes.
 */

export const IsoDate = z.string().refine(isIsoDate, { message: 'Datum måste ha formen ÅÅÅÅ-MM-DD.' });

export const ParsedItem = z.object({
  kind: z.enum(['distance', 'duration', 'exercise']),
  rawText: z.string(),
  exerciseName: z.string().optional(),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  repsMax: z.number().int().positive().optional(),
  repScheme: z.enum(['fixed', 'range', 'amrap', 'rm', 'time']).optional(),
  load: z.number().optional(),
  loadUnit: z.enum(['kg', 'percent', 'rpe', 'bodyweight', 'band']).optional(),
  perSide: z.boolean().default(false),
  distanceKm: z.number().nonnegative().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  parseConfidence: z.number().min(0).max(1),
});
export type ParsedItem = z.infer<typeof ParsedItem>;

export const CanonicalSession = z.object({
  date: IsoDate,
  type: z.enum(['run', 'strength', 'other', 'rest']),
  title: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(ParsedItem),
});
export type CanonicalSession = z.infer<typeof CanonicalSession>;

export const CanonicalWeek = z.object({
  weekNo: z.number().int().positive(),
  startDate: IsoDate.refine(isMonday, { message: 'En vecka måste börja på en måndag.' }),
  phase: z.string().optional(),
  focusText: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).default({}),
  sessions: z.array(CanonicalSession),
});
export type CanonicalWeek = z.infer<typeof CanonicalWeek>;

export const ProgramNote = z.object({
  section: z.string(),
  key: z.string(),
  value: z.string(),
});
export type ProgramNote = z.infer<typeof ProgramNote>;

export const ImportWarning = z.object({ path: z.string(), message: z.string() });
export type ImportWarning = z.infer<typeof ImportWarning>;

export const CanonicalProgram = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1, 'Programmet behöver ett namn.'),
    discipline: z.string().optional(),
    startDate: IsoDate,
    raceDate: IsoDate.optional(),
    source: z.enum(['xlsx', 'image', 'ai', 'manual']),
    sourceMeta: z.record(z.string(), z.unknown()).default({}),
    notes: z.array(ProgramNote).default([]),
    // Gaps are allowed: week numbers need not be 1..N and weeks need not be consecutive.
    weeks: z.array(CanonicalWeek),
    warnings: z.array(ImportWarning).default([]),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<number>();
    p.weeks.forEach((w, i) => {
      if (seen.has(w.weekNo)) {
        ctx.addIssue({ code: 'custom', path: ['weeks', i, 'weekNo'], message: `Vecka ${w.weekNo} finns två gånger.` });
      }
      seen.add(w.weekNo);
    });
  });
export type CanonicalProgram = z.infer<typeof CanonicalProgram>;
export type CanonicalProgramInput = z.input<typeof CanonicalProgram>;

/** Items that need the user's attention in the review view (confidence < 1). */
export function lowConfidenceItems(p: CanonicalProgram) {
  const out: { weekNo: number; date: string; item: ParsedItem }[] = [];
  for (const w of p.weeks) {
    for (const s of w.sessions) {
      for (const item of s.items) {
        if (item.parseConfidence < 1) out.push({ weekNo: w.weekNo, date: s.date, item });
      }
    }
  }
  return out;
}
