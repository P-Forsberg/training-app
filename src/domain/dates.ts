import { addDays, differenceInCalendarDays, format, isValid, parse, startOfWeek } from 'date-fns';
import type { IsoDate } from './types';

/** Monday is the first day of the week everywhere in the app. */
export const WEEK_STARTS_ON = 1 as const;

/** Format a local Date as 'yyyy-MM-dd'. Never use toISOString() for this. */
export function toIsoDate(d: Date): IsoDate {
  return format(d, 'yyyy-MM-dd');
}

/** Parse 'yyyy-MM-dd' as a local date at midnight. Returns null when invalid. */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parse(s, 'yyyy-MM-dd', new Date(2000, 0, 1));
  return isValid(d) && toIsoDate(d) === s ? d : null;
}

function mustParse(s: IsoDate): Date {
  const d = parseIsoDate(s);
  if (!d) throw new RangeError(`Invalid ISO date: ${s}`);
  return d;
}

export function isIsoDate(s: unknown): s is IsoDate {
  return typeof s === 'string' && parseIsoDate(s) !== null;
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return toIsoDate(addDays(mustParse(date), days));
}

export function weekStartIso(date: IsoDate): IsoDate {
  return toIsoDate(startOfWeek(mustParse(date), { weekStartsOn: WEEK_STARTS_ON }));
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(date: IsoDate): number {
  return (mustParse(date).getDay() + 6) % 7;
}

export function isMonday(date: IsoDate): boolean {
  return isIsoDate(date) && dayIndex(date) === 0;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(mustParse(to), mustParse(from));
}

/** The seven dates of the week starting at the given Monday. */
export function weekDates(monday: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}
