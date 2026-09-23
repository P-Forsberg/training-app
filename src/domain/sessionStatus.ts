import type { IsoDate, LoggedStatus } from './types';

export type DisplayStatus = 'planned' | 'done' | 'partial' | 'skipped' | 'moved' | 'missed';

/**
 * Status of a planned session as shown on its planned date. "Missed" is never
 * stored: it is derived from the date and the absence of a log.
 */
export function plannedSessionStatus(
  planned: { date: IsoDate; type: string },
  logged: { date: IsoDate; status: LoggedStatus } | undefined,
  today: IsoDate,
): DisplayStatus {
  if (logged) {
    if (logged.date !== planned.date) return 'moved';
    return logged.status;
  }
  if (planned.type === 'rest') return 'planned';
  return planned.date < today ? 'missed' : 'planned';
}
