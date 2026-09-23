import { addDaysIso, dayIndex, weekDates } from './dates';
import type { IsoDate, PlannedSessionLike } from './types';

/**
 * Derives week-level training facts from planned data only. No training rule
 * lives anywhere else in the code: UI and AI both read these flags.
 */

export interface DayFlags {
  date: IsoDate;
  /** No planned content at all (no sessions, or only rest sessions / empty sessions). */
  isRest: boolean;
  hasRun: boolean;
  hasStrength: boolean;
  plannedKm: number;
  /** Part of a weekend where both Saturday and Sunday have planned distance. */
  isBackToBack: boolean;
  /** Monday without running directly after a back-to-back weekend. */
  isRestAfterBackToBack: boolean;
}

export interface WeekFlags {
  weekStart: IsoDate;
  days: DayFlags[];
  backToBack: boolean;
  /** The Monday after this week's back-to-back weekend has no running. */
  restAfterBackToBack: boolean;
  totals: {
    plannedKm: number;
    runSessions: number;
    strengthSessions: number;
    plannedDurationSec: number;
  };
}

export interface DeriveWeekOptions {
  /** Sessions of the previous week, to flag this Monday after a back-to-back. */
  previousWeekSessions?: PlannedSessionLike[];
  /** Sessions of the next week, if it exists. Programs can have gaps. */
  nextWeekSessions?: PlannedSessionLike[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function live(sessions: PlannedSessionLike[] | undefined): PlannedSessionLike[] {
  return (sessions ?? []).filter((s) => !s.deletedAt);
}

function hasContent(s: PlannedSessionLike): boolean {
  if (s.type === 'rest') return false;
  // A run/strength session counts even without parsed items (e.g. raw text only).
  return true;
}

function sessionKm(s: PlannedSessionLike): number {
  if (s.type !== 'run') return 0;
  return s.items.reduce((sum, i) => sum + (i.kind === 'distance' ? (i.distanceKm ?? 0) : 0), 0);
}

function sessionDuration(s: PlannedSessionLike): number {
  return s.items.reduce((sum, i) => sum + (i.durationSec ?? 0), 0);
}

function dayKm(sessions: PlannedSessionLike[], date: IsoDate): number {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + sessionKm(s), 0);
}

function hasRunOn(sessions: PlannedSessionLike[], date: IsoDate): boolean {
  return sessions.some((s) => s.date === date && s.type === 'run' && hasContent(s));
}

function isBackToBackWeekend(sessions: PlannedSessionLike[], monday: IsoDate): boolean {
  const sat = addDaysIso(monday, 5);
  const sun = addDaysIso(monday, 6);
  return dayKm(sessions, sat) > 0 && dayKm(sessions, sun) > 0;
}

export function deriveWeekFlags(
  weekStart: IsoDate,
  sessions: PlannedSessionLike[],
  options: DeriveWeekOptions = {},
): WeekFlags {
  const current = live(sessions);
  const dates = weekDates(weekStart);
  const inWeek = current.filter((s) => dates.includes(s.date));

  const backToBack = isBackToBackWeekend(inWeek, weekStart);

  const previous = options.previousWeekSessions ? live(options.previousWeekSessions) : undefined;
  const previousBackToBack = previous ? isBackToBackWeekend(previous, addDaysIso(weekStart, -7)) : false;

  const next = options.nextWeekSessions ? live(options.nextWeekSessions) : undefined;
  const nextMonday = addDaysIso(weekStart, 7);
  const restAfterBackToBack = backToBack && next !== undefined && !hasRunOn(next, nextMonday);

  const days: DayFlags[] = dates.map((date) => {
    const daySessions = inWeek.filter((s) => s.date === date);
    const hasRun = daySessions.some((s) => s.type === 'run' && hasContent(s));
    const hasStrength = daySessions.some((s) => s.type === 'strength' && hasContent(s));
    const idx = dayIndex(date);
    return {
      date,
      isRest: !daySessions.some(hasContent),
      hasRun,
      hasStrength,
      plannedKm: round1(dayKm(daySessions, date)),
      isBackToBack: backToBack && (idx === 5 || idx === 6),
      isRestAfterBackToBack: idx === 0 && previousBackToBack && !hasRun,
    };
  });

  return {
    weekStart,
    days,
    backToBack,
    restAfterBackToBack,
    totals: {
      plannedKm: round1(inWeek.reduce((sum, s) => sum + sessionKm(s), 0)),
      runSessions: inWeek.filter((s) => s.type === 'run' && hasContent(s)).length,
      strengthSessions: inWeek.filter((s) => s.type === 'strength' && hasContent(s)).length,
      plannedDurationSec: inWeek.reduce((sum, s) => sum + sessionDuration(s), 0),
    },
  };
}
