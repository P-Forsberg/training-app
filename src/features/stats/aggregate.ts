import { weekStartIso } from '@/domain/dates';
import { e1rmSeries } from '@/domain/e1rm';
import type { ProgramOverview } from '@/data/repository';

export interface WeekKm {
  label: string;
  monday: string;
  planned: number;
  logged: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Planned vs logged km per program week. Logged km count on the date they were run. */
export function kmPerWeek(o: ProgramOverview): WeekKm[] {
  const plannedByMonday = new Map<string, number>();
  const itemsBySession = new Map<string, number>();
  for (const i of o.items) if (i.kind === 'distance') itemsBySession.set(i.planned_session_id, (itemsBySession.get(i.planned_session_id) ?? 0) + (i.distance_km ?? 0));
  for (const s of o.sessions) {
    if (s.type !== 'run') continue;
    const m = weekStartIso(s.date);
    plannedByMonday.set(m, (plannedByMonday.get(m) ?? 0) + (itemsBySession.get(s.id) ?? 0));
  }
  const loggedByMonday = new Map<string, number>();
  const sessions = new Map(o.logged.map((l) => [l.id, l]));
  for (const r of o.runs) {
    const l = sessions.get(r.logged_session_id);
    if (!l || l.status === 'skipped') continue;
    const m = weekStartIso(l.date);
    loggedByMonday.set(m, (loggedByMonday.get(m) ?? 0) + (r.distance_km ?? 0));
  }
  const weekNo = new Map(o.weeks.map((w) => [w.start_date, w.week_no]));
  const mondays = [...new Set([...plannedByMonday.keys(), ...loggedByMonday.keys()])].sort();
  return mondays.map((monday) => ({
    monday,
    label: weekNo.has(monday) ? `v${weekNo.get(monday)}` : monday.slice(5),
    planned: r1(plannedByMonday.get(monday) ?? 0),
    logged: r1(loggedByMonday.get(monday) ?? 0),
  }));
}

export interface WeekParts {
  label: string;
  monday: string;
  /** Kilometres in the main set of structured runs. */
  quality: number;
  /** Warm-up plus cool-down of structured runs. */
  easyParts: number;
}

/** Structured-run kilometres per week, split into main set and warm-up/cool-down. */
export function partsPerWeek(o: ProgramOverview): WeekParts[] {
  const sessions = new Map(o.logged.map((l) => [l.id, l]));
  const by = new Map<string, { quality: number; easyParts: number }>();
  for (const r of o.runs) {
    const l = sessions.get(r.logged_session_id);
    if (!l || l.status === 'skipped') continue;
    const main = r.main_km ?? 0;
    const easy = (r.warmup_km ?? 0) + (r.cooldown_km ?? 0);
    if (!main && !easy) continue;
    const m = weekStartIso(l.date);
    const v = by.get(m) ?? { quality: 0, easyParts: 0 };
    v.quality += main;
    v.easyParts += easy;
    by.set(m, v);
  }
  const weekNo = new Map(o.weeks.map((w) => [w.start_date, w.week_no]));
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, v]) => ({
      monday,
      label: weekNo.has(monday) ? `v${weekNo.get(monday)}` : monday.slice(5),
      quality: r1(v.quality),
      easyParts: r1(v.easyParts),
    }));
}

export const SURFACE_LABELS: Record<string, string> = {
  road: 'Väg',
  gravel: 'Grus',
  trail: 'Stig',
  technical: 'Teknisk stig',
  treadmill: 'Löpband',
  unknown: 'Inte angivet',
};

export function kmPerSurface(o: ProgramOverview): { surface: string; km: number }[] {
  const sessions = new Map(o.logged.map((l) => [l.id, l]));
  const by = new Map<string, number>();
  for (const r of o.runs) {
    const l = sessions.get(r.logged_session_id);
    if (!l || l.status === 'skipped' || !r.distance_km) continue;
    const key = r.surface ?? 'unknown';
    by.set(key, (by.get(key) ?? 0) + r.distance_km);
  }
  return [...by.entries()].map(([s, km]) => ({ surface: SURFACE_LABELS[s] ?? s, km: r1(km) })).sort((a, b) => b.km - a.km);
}

export function sessionsPerMonth(o: ProgramOverview): { month: string; run: number; strength: number }[] {
  const by = new Map<string, { run: number; strength: number }>();
  for (const l of o.logged) {
    if (l.status !== 'done' && l.status !== 'partial') continue;
    const m = l.date.slice(0, 7);
    const v = by.get(m) ?? { run: 0, strength: 0 };
    if (l.type === 'run') v.run++;
    else v.strength++;
    by.set(m, v);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}

export function e1rmByExercise(o: ProgramOverview): Map<string, { date: string; e1rm: number }[]> {
  const sessions = new Map(o.logged.map((l) => [l.id, l]));
  const byEx = new Map<string, { date: string; weightKg: number | null; reps: number | null; isWarmup: boolean; skipped: boolean }[]>();
  for (const s of o.sets) {
    if (!s.exercise_id) continue;
    const l = sessions.get(s.logged_session_id);
    if (!l) continue;
    const list = byEx.get(s.exercise_id) ?? [];
    list.push({ date: l.date, weightKg: s.weight_kg, reps: s.reps, isWarmup: s.is_warmup, skipped: s.skipped });
    byEx.set(s.exercise_id, list);
  }
  const out = new Map<string, { date: string; e1rm: number }[]>();
  for (const [id, sets] of byEx) {
    const series = e1rmSeries(sets);
    if (series.length) out.set(id, series);
  }
  return out;
}
