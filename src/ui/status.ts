export type StatusKind = 'planned' | 'done' | 'partial' | 'skipped' | 'moved' | 'missed';

/** The same words as the buttons: pressing "Klart" gives the status "Klart". */
export const STATUS_LABEL: Record<StatusKind, string> = {
  planned: 'Planerad',
  done: 'Klart',
  partial: 'Delvis',
  skipped: 'Hoppade',
  moved: 'Flyttad',
  missed: 'Missad',
};
