import { z } from 'zod';
import { addDaysIso, daysBetween, isMonday, todayIso, weekStartIso } from '@/domain/dates';
import { parseExerciseCell } from '@/domain/exerciseParser';
import type { CanonicalProgramInput, CanonicalSession, CanonicalWeek, ImportWarning, ParsedItem } from '../canonical';
import { cellDate, cellNumber, cellText, col, findSheet, type SheetData } from '../cells';

/**
 * Generic spreadsheet adapter. The user maps columns in the UI; the mapping is
 * saved in import_profiles and reused next time.
 *
 * Two layouts:
 *  - week-rows:    one row per week, one column per weekday (distance and/or text)
 *  - session-rows: one row per session with a date column
 */

export const ADAPTER_ID = 'xlsx-generic';

const Column = z.string().regex(/^[A-Za-z]{1,3}$/, 'Ange en kolumnbokstav, till exempel B.');
const OptColumn = Column.optional();
const Days = z.array(OptColumn.nullable()).length(7);

export const GenericMapping = z.discriminatedUnion('layout', [
  z.object({
    layout: z.literal('week-rows'),
    sheet: z.string().min(1),
    firstDataRow: z.number().int().min(1),
    weekNo: OptColumn,
    weekStart: Column,
    phase: OptColumn,
    focus: OptColumn,
    dayKm: Days,
    dayText: Days,
  }),
  z.object({
    layout: z.literal('session-rows'),
    sheet: z.string().min(1),
    firstDataRow: z.number().int().min(1),
    date: Column,
    type: OptColumn,
    title: OptColumn,
    distanceKm: OptColumn,
    durationMin: OptColumn,
    text: OptColumn,
  }),
]);
export type GenericMapping = z.infer<typeof GenericMapping>;

const EMPTY_DAYS = [null, null, null, null, null, null, null];

/** Guesses a mapping from header names. The user confirms or corrects it in the UI. */
export function suggestMapping(data: SheetData): GenericMapping | undefined {
  const sheet = Object.keys(data).find((k) => (data[k]?.length ?? 0) > 1);
  if (!sheet) return undefined;
  const header = (data[sheet]![0] ?? []).map((h) => cellText(h).toLowerCase());
  const letter = (i: number) => (i < 0 ? undefined : String.fromCharCode(65 + i));
  const find = (re: RegExp) => letter(header.findIndex((h) => re.test(h)));

  const dayWords = [/^mån/, /^tis/, /^ons/, /^tor/, /^fre/, /^lör/, /^sön/];
  const dayCols = dayWords.map((re) => find(re) ?? null);
  const date = find(/datum|date|måndag|vecka start|start/);

  if (dayCols.filter(Boolean).length >= 5 && date) {
    return {
      layout: 'week-rows',
      sheet,
      firstDataRow: 2,
      weekNo: find(/^vecka$|^v$|^week/),
      weekStart: date,
      phase: find(/fas|phase|block/),
      focus: find(/fokus|focus|kommentar|notes?/),
      dayKm: dayCols,
      dayText: [...EMPTY_DAYS],
    };
  }
  return {
    layout: 'session-rows',
    sheet,
    firstDataRow: 2,
    date: date ?? 'A',
    type: find(/typ|type/),
    title: find(/titel|title|pass|namn/),
    distanceKm: find(/km|distans|distance/),
    durationMin: find(/tid|min|duration/),
    text: find(/övning|beskrivning|description|innehåll|text/),
  };
}

function inferType(items: ParsedItem[], explicit?: string): CanonicalSession['type'] {
  const t = (explicit ?? '').toLowerCase();
  if (/löp|run|jogg/.test(t)) return 'run';
  if (/styrk|gym|strength|lyft/.test(t)) return 'strength';
  if (/vila|rest/.test(t)) return 'rest';
  if (t) return 'other';
  if (items.some((i) => i.kind === 'exercise' && (i.sets || i.reps || i.repScheme))) return 'strength';
  if (items.some((i) => i.kind === 'distance')) return 'run';
  return 'other';
}

function distanceItem(km: number): ParsedItem {
  return { kind: 'distance', rawText: `${String(km).replace('.', ',')} km`, distanceKm: km, perSide: false, parseConfidence: 1 };
}

export function parse(data: SheetData, mapping: GenericMapping, fileName = 'Importerat program'): CanonicalProgramInput {
  const warnings: ImportWarning[] = [];
  const rows = findSheet(data, mapping.sheet) ?? [];
  if (!findSheet(data, mapping.sheet)) {
    warnings.push({ path: mapping.sheet, message: `Fliken "${mapping.sheet}" finns inte i filen. Välj en annan flik.` });
  }
  const dataRows = rows.slice(mapping.firstDataRow - 1).map((row, i) => ({ row, rowNo: mapping.firstDataRow + i }));
  const get = (row: unknown[], c: string | null | undefined) => (c ? row[col(c)] : undefined);

  const weeks = new Map<string, CanonicalWeek>();
  const weekFor = (monday: string, weekNo?: number): CanonicalWeek => {
    let w = weeks.get(monday);
    if (!w) {
      w = { weekNo: weekNo ?? 0, startDate: monday, meta: {}, sessions: [] };
      weeks.set(monday, w);
    }
    return w;
  };

  if (mapping.layout === 'week-rows') {
    for (const { row, rowNo } of dataRows) {
      if (row.every((c) => cellText(c) === '')) continue;
      let monday = cellDate(get(row, mapping.weekStart));
      if (!monday) {
        warnings.push({ path: `${mapping.sheet}!${mapping.weekStart}${rowNo}`, message: 'Raden saknar giltigt datum och hoppades över.' });
        continue;
      }
      if (!isMonday(monday)) monday = weekStartIso(monday);
      const weekNo = cellNumber(get(row, mapping.weekNo));
      const w = weekFor(monday, weekNo != null && Number.isInteger(weekNo) && weekNo > 0 ? weekNo : undefined);
      const phase = cellText(get(row, mapping.phase));
      const focus = cellText(get(row, mapping.focus));
      if (phase) w.phase = phase;
      if (focus) w.focusText = focus;

      for (let d = 0; d < 7; d++) {
        const date = addDaysIso(monday, d);
        const km = cellNumber(get(row, mapping.dayKm[d]));
        if (km != null && km > 0) w.sessions.push({ date, type: 'run', items: [distanceItem(km)] });
        const items = parseExerciseCell(get(row, mapping.dayText[d]));
        if (items.length) w.sessions.push({ date, type: inferType(items), items });
      }
    }
  } else {
    for (const { row, rowNo } of dataRows) {
      if (row.every((c) => cellText(c) === '')) continue;
      const date = cellDate(get(row, mapping.date));
      if (!date) {
        warnings.push({ path: `${mapping.sheet}!${mapping.date}${rowNo}`, message: 'Raden saknar giltigt datum och hoppades över.' });
        continue;
      }
      const items: ParsedItem[] = [];
      const km = cellNumber(get(row, mapping.distanceKm));
      if (km != null && km > 0) items.push(distanceItem(km));
      const min = cellNumber(get(row, mapping.durationMin));
      if (min != null && min > 0) {
        items.push({ kind: 'duration', rawText: `${min} min`, durationSec: Math.round(min * 60), perSide: false, parseConfidence: 1 });
      }
      items.push(...parseExerciseCell(get(row, mapping.text)));
      const typeText = cellText(get(row, mapping.type));
      if (!items.length && !typeText) continue;
      const title = cellText(get(row, mapping.title));
      weekFor(weekStartIso(date)).sessions.push({
        date,
        type: inferType(items, typeText),
        ...(title ? { title } : {}),
        items,
      });
    }
  }

  const sorted = [...weeks.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const first = sorted[0];
  // Weeks without an explicit number are numbered from the first week; gaps are kept.
  const used = new Set(sorted.filter((w) => w.weekNo > 0).map((w) => w.weekNo));
  for (const w of sorted) {
    if (w.weekNo > 0) continue;
    let n = Math.floor(daysBetween(first!.startDate, w.startDate) / 7) + 1;
    while (used.has(n)) n++;
    w.weekNo = n;
    used.add(n);
  }
  for (const w of sorted) w.sessions.sort((a, b) => a.date.localeCompare(b.date));

  if (!first) warnings.push({ path: mapping.sheet, message: 'Hittade inga pass. Kontrollera kolumnvalen och vilken rad datan börjar på.' });

  return {
    schemaVersion: 1,
    name: fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, '') || 'Importerat program',
    startDate: first?.startDate ?? weekStartIso(todayIso()),
    source: 'xlsx',
    sourceMeta: { adapter: ADAPTER_ID, fileName, mapping },
    notes: [],
    weeks: sorted,
    warnings,
  };
}
