/** Shared domain types. Plain data, no behaviour, no external dependencies. */

/** Local calendar date as 'yyyy-MM-dd'. Never a timestamp. */
export type IsoDate = string;

export type RepScheme = 'fixed' | 'range' | 'amrap' | 'rm' | 'time';
export type LoadUnit = 'kg' | 'percent' | 'rpe' | 'bodyweight' | 'band';
export type ItemKind = 'distance' | 'duration' | 'exercise';
export type SessionType = 'run' | 'strength' | 'other' | 'rest';

/** One parsed line of a planned session. Mirrors planned_items. */
export interface ParsedItem {
  kind: ItemKind;
  rawText: string;
  exerciseName?: string;
  sets?: number;
  reps?: number;
  repsMax?: number;
  repScheme?: RepScheme;
  load?: number;
  loadUnit?: LoadUnit;
  perSide: boolean;
  distanceKm?: number;
  durationSec?: number;
  parseConfidence: number;
}

export interface PlannedSessionLike {
  id?: string;
  date: IsoDate;
  type: SessionType;
  items: Pick<ParsedItem, 'kind' | 'distanceKm' | 'durationSec'>[];
  deletedAt?: string | null;
}

export type LoggedStatus = 'done' | 'partial' | 'skipped' | 'moved';
