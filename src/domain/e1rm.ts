/** Estimated one-rep max (Epley). Only meaningful for 1–12 reps with a real weight. */
export function e1rm(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps >= 1) || reps > 12) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface SetLike {
  date: string;
  weightKg?: number | null;
  reps?: number | null;
  isWarmup?: boolean;
  skipped?: boolean;
}

/** Best e1RM per date, sorted by date. Warm-ups and skipped sets are ignored. */
export function e1rmSeries(sets: SetLike[]): { date: string; e1rm: number }[] {
  const best = new Map<string, number>();
  for (const s of sets) {
    if (s.isWarmup || s.skipped) continue;
    const v = e1rm(s.weightKg ?? 0, s.reps ?? 0);
    if (v == null) continue;
    best.set(s.date, Math.max(best.get(s.date) ?? 0, v));
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, e1rm: v }));
}
