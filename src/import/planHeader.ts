import { cellText } from './cells';

/**
 * Finds the Veckoplan columns by their header names, so adding or moving a
 * column does not break the import. Weekday text columns ("Onsdag –
 * kvalitetspass") are discovered generically: the weekday comes from the
 * header, never from code.
 */

export interface DayTextColumn {
  column: number;
  /** 0 = Monday … 6 = Sunday, read from the header. */
  dayIndex: number;
  /** What follows the weekday in the header, e.g. "kvalitetspass". */
  label: string;
  header: string;
}

export interface PlanColumns {
  weekNo: number;
  monday: number;
  /** Seven consecutive columns, Monday to Sunday, planned km. */
  days: number[];
  phase?: number;
  weeksLeft?: number;
  plannedSum?: number;
  runCount?: number;
  strengthCount?: number;
  strengthMode?: number;
  focus?: number;
  dayTexts: DayTextColumn[];
}

const norm = (v: unknown) =>
  cellText(v)
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const NOT_LETTER = '(?![a-zåäö])';
const DAY_WORDS = ['mån(?:dag)?', 'tis(?:dag)?', 'ons(?:dag)?', 'tor(?:s|sdag)?', 'fre(?:dag)?', 'lör(?:dag)?', 'sön(?:dag)?'];
const DAY_SHORT = DAY_WORDS.map((w) => new RegExp(`^${w}${NOT_LETTER}(?!\\s*-)`));
const DAY_TEXT = new RegExp(`^(${DAY_WORDS.map((w) => `(?:${w})`).join('|')})${NOT_LETTER}\\s*-\\s*(.+)$`);

export function columnLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type ResolveResult = { ok: true; columns: PlanColumns } | { ok: false; missing: string[] };

export function resolvePlanColumns(headerRow: unknown[]): ResolveResult {
  const h = headerRow.map(norm);

  // The seven day columns: the first run of Mån..Sön in order.
  let dayStart = -1;
  for (let i = 0; i + 6 < h.length && dayStart < 0; i++) {
    if (DAY_SHORT.every((re, d) => re.test(h[i + d] ?? ''))) dayStart = i;
  }
  const days = dayStart >= 0 ? Array.from({ length: 7 }, (_, d) => dayStart + d) : [];
  const taken = new Set(days);

  const find = (re: RegExp) => {
    const i = h.findIndex((x, idx) => !taken.has(idx) && re.test(x));
    if (i >= 0) taken.add(i);
    return i >= 0 ? i : undefined;
  };

  const dayTexts: DayTextColumn[] = [];
  h.forEach((x, i) => {
    if (taken.has(i)) return;
    const m = DAY_TEXT.exec(x);
    if (!m) return;
    const dayIndex = DAY_WORDS.findIndex((w) => new RegExp(`^${w}$`).test(m[1]!));
    if (dayIndex < 0) return;
    dayTexts.push({ column: i, dayIndex, label: m[2]!.trim(), header: cellText(headerRow[i]) });
    taken.add(i);
  });

  const weekNo = find(/^(vecka|v|veckonummer|vecka nr|week)$/);
  const monday = find(/datum|start|^måndag$|^vecka börjar/);
  const columns: PlanColumns = {
    weekNo: weekNo ?? -1,
    monday: monday ?? -1,
    days,
    phase: find(/^fas|phase|^block/),
    weeksLeft: find(/veckor kvar|^kvar/),
    plannedSum: find(/summa|^total/),
    runCount: find(/löppass/),
    strengthCount: find(/styrkepass/),
    strengthMode: find(/styrkeläge|^läge/),
    focus: find(/fokus/),
    dayTexts,
  };

  const missing: string[] = [];
  if (weekNo === undefined) missing.push('Vecka');
  if (monday === undefined) missing.push('Måndagsdatum');
  if (!days.length) missing.push('Mån … Sön (sju kolumner i rad)');
  return missing.length ? { ok: false, missing } : { ok: true, columns };
}
