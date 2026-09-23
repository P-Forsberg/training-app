import { addDaysIso, isMonday, todayIso, weekStartIso } from '@/domain/dates';
import { parseExerciseCell } from '@/domain/exerciseParser';
import type { CanonicalProgramInput, CanonicalSession, CanonicalWeek, ImportWarning, ProgramNote } from '../canonical';
import { cellDate, cellNumber, cellText, col, findSheet, type SheetData } from '../cells';

/**
 * Adapter for workbooks with the sheets "Veckoplan" and "Styrka" (see docs/SPEC.md §5).
 * Column positions describe this file format only; no training rules live here.
 */

export const ADAPTER_ID = 'xlsx-kullamannen';

const PLAN = {
  weekNo: col('A'),
  monday: col('B'),
  phase: col('C'),
  weeksLeft: col('D'),
  firstDay: col('E'), // E–K = Monday–Sunday planned km, 0 = rest
  plannedSum: col('L'),
  runCount: col('M'),
  strengthCount: col('N'),
  strengthMode: col('O'),
  focus: col('P'),
} as const;

const STRENGTH = {
  weekNo: col('A'),
  date: col('B'),
  cycle: col('C'),
  programWeek: col('D'),
  lowerBodyMode: col('E'),
  mondayInstruction: col('F'),
  comment: col('J'),
} as const;

/** Strength columns and the weekday (0 = Monday) each one belongs to. */
const STRENGTH_DAYS = [
  { column: col('G'), dayOffset: 0, fallbackTitle: 'ME Lower' },
  { column: col('H'), dayOffset: 2, fallbackTitle: 'ME Upper' },
  { column: col('I'), dayOffset: 4, fallbackTitle: 'DE Combo' },
] as const;

const NOTE_SHEETS = ['Läs först', 'Nyckelpass'];

export function detect(data: SheetData): boolean {
  return findSheet(data, 'Veckoplan') !== undefined && findSheet(data, 'Styrka') !== undefined;
}

/** Strips a leading weekday word from a header such as "Måndag – ME Lower". */
function titleFromHeader(header: string, fallback: string): string {
  const cleaned = header.replace(/^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|mån|ons|fre)\b[\s:–—-]*/i, '').trim();
  return cleaned || fallback;
}

function formatKm(km: number): string {
  return `${String(km).replace('.', ',')} km`;
}

export function parse(data: SheetData, fileName = 'Importerat program'): CanonicalProgramInput {
  const warnings: ImportWarning[] = [];
  const plan = findSheet(data, 'Veckoplan') ?? [];
  const strength = findSheet(data, 'Styrka') ?? [];

  const strengthHeader = strength[0] ?? [];
  const strengthByWeek = new Map<number, { row: unknown[]; index: number }>();
  strength.slice(1).forEach((row, i) => {
    const weekNo = cellNumber(row[STRENGTH.weekNo]);
    if (weekNo != null && Number.isInteger(weekNo) && weekNo > 0) strengthByWeek.set(weekNo, { row, index: i + 2 });
  });

  const weeks: CanonicalWeek[] = [];
  const seenWeeks = new Set<number>();

  plan.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    const weekNo = cellNumber(row[PLAN.weekNo]);
    if (weekNo == null && !cellText(row[PLAN.weekNo])) return; // blank or trailing row
    if (weekNo == null || !Number.isInteger(weekNo) || weekNo < 1) {
      warnings.push({ path: `Veckoplan!A${rowNo}`, message: `Veckonumret "${cellText(row[PLAN.weekNo])}" gick inte att läsa. Raden hoppades över.` });
      return;
    }
    if (seenWeeks.has(weekNo)) {
      warnings.push({ path: `Veckoplan!A${rowNo}`, message: `Vecka ${weekNo} finns två gånger. Bara den första används.` });
      return;
    }

    let monday = cellDate(row[PLAN.monday]);
    if (!monday) {
      warnings.push({ path: `Veckoplan!B${rowNo}`, message: `Vecka ${weekNo} saknar giltigt datum och hoppades över. Fyll i veckans måndag och importera igen.` });
      return;
    }
    if (!isMonday(monday)) {
      const snapped = weekStartIso(monday);
      warnings.push({ path: `Veckoplan!B${rowNo}`, message: `Vecka ${weekNo}: ${monday} är ingen måndag. Veckan börjar ${snapped} i stället.` });
      monday = snapped;
    }
    seenWeeks.add(weekNo);

    const sessions: CanonicalSession[] = [];
    for (let d = 0; d < 7; d++) {
      const raw = row[PLAN.firstDay + d];
      const km = cellNumber(raw);
      if (km == null) {
        if (cellText(raw)) {
          warnings.push({ path: `Veckoplan!${String.fromCharCode(69 + d)}${rowNo}`, message: `"${cellText(raw)}" är ingen distans. Dagen lämnades tom.` });
        }
        continue;
      }
      if (km <= 0) continue; // 0 = rest
      sessions.push({
        date: addDaysIso(monday, d),
        type: 'run',
        items: [{ kind: 'distance', rawText: formatKm(km), distanceKm: km, perSide: false, parseConfidence: 1 }],
      });
    }

    const meta: Record<string, unknown> = {};
    const setMeta = (key: string, v: unknown) => {
      const t = cellText(v);
      if (t) meta[key] = cellNumber(v) ?? t;
    };
    setMeta('weeksLeft', row[PLAN.weeksLeft]);
    setMeta('plannedKmSum', row[PLAN.plannedSum]);
    setMeta('plannedRunCount', row[PLAN.runCount]);
    setMeta('plannedStrengthCount', row[PLAN.strengthCount]);
    setMeta('strengthMode', row[PLAN.strengthMode]);

    const s = strengthByWeek.get(weekNo);
    if (s) {
      strengthByWeek.delete(weekNo);
      setMeta('cycle', s.row[STRENGTH.cycle]);
      setMeta('programWeek', s.row[STRENGTH.programWeek]);
      setMeta('lowerBodyMode', s.row[STRENGTH.lowerBodyMode]);
      setMeta('strengthComment', s.row[STRENGTH.comment]);
      const instruction = cellText(s.row[STRENGTH.mondayInstruction]);
      if (instruction) meta.dayNotes = { [monday]: instruction };

      const strengthDate = cellDate(s.row[STRENGTH.date]);
      if (strengthDate && weekStartIso(strengthDate) !== monday) {
        warnings.push({ path: `Styrka!B${s.index}`, message: `Vecka ${weekNo} har olika datum i Veckoplan och Styrka. Datumet i Veckoplan används.` });
      }

      for (const day of STRENGTH_DAYS) {
        const items = parseExerciseCell(s.row[day.column]);
        if (items.length === 0) continue;
        sessions.push({
          date: addDaysIso(monday, day.dayOffset),
          type: 'strength',
          title: titleFromHeader(cellText(strengthHeader[day.column]), day.fallbackTitle),
          items,
        });
      }
    }

    const phase = cellText(row[PLAN.phase]);
    const focusText = cellText(row[PLAN.focus]);
    weeks.push({
      weekNo,
      startDate: monday,
      ...(phase ? { phase } : {}),
      ...(focusText ? { focusText } : {}),
      meta,
      sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)),
    });
  });

  for (const [weekNo, { index }] of strengthByWeek) {
    warnings.push({ path: `Styrka!A${index}`, message: `Vecka ${weekNo} finns i Styrka men inte i Veckoplan och importerades inte.` });
  }

  const notes: ProgramNote[] = [];
  for (const sheetName of NOTE_SHEETS) {
    const rows = findSheet(data, sheetName);
    if (!rows) continue;
    for (const row of rows) {
      const key = cellText(row[0]);
      const value = cellText(row[1]);
      if (key || value) notes.push({ section: sheetName, key, value });
    }
  }

  weeks.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const first = weeks[0];
  if (!first) {
    warnings.push({ path: 'Veckoplan', message: 'Hittade inga veckor. Kontrollera att veckonummer står i kolumn A och måndagens datum i kolumn B.' });
  }

  return {
    schemaVersion: 1,
    name: fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, '') || 'Importerat program',
    startDate: first?.startDate ?? weekStartIso(todayIso()),
    source: 'xlsx',
    sourceMeta: { adapter: ADAPTER_ID, fileName },
    notes,
    weeks,
    warnings,
  };
}
