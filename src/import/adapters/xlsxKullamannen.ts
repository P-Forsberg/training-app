import { addDaysIso, isMonday, todayIso, weekStartIso } from '@/domain/dates';
import { parseExerciseCell } from '@/domain/exerciseParser';
import type { CanonicalProgramInput, CanonicalSession, CanonicalWeek, ImportWarning, ProgramNote } from '../canonical';
import { cellDate, cellNumber, cellText, col, findSheet, type SheetData } from '../cells';
import { columnLetter, resolvePlanColumns } from '../planHeader';

/**
 * Adapter for workbooks with the sheets "Veckoplan" and "Styrka" (see docs/SPEC.md §5).
 * Column positions describe this file format only; no training rules live here.
 */

export const ADAPTER_ID = 'xlsx-kullamannen';

// Veckoplan columns are found by header name (see import/planHeader.ts), so
// added or moved columns do not break the import. Styrka keeps fixed columns.
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

  const resolved = resolvePlanColumns(plan[0] ?? []);
  if (!resolved.ok) {
    warnings.push({
      path: 'Veckoplan!1',
      message: `Rubrikraden saknar ${resolved.missing.join(', ')}. Kontrollera rubrikerna i första raden och importera igen.`,
    });
  }
  const P = resolved.ok ? resolved.columns : null;
  const at = (row: unknown[], c: number | undefined) => (c === undefined ? undefined : row[c]);

  if (P) plan.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    const weekCell = `Veckoplan!${columnLetter(P.weekNo)}${rowNo}`;
    const weekNo = cellNumber(row[P.weekNo]);
    if (weekNo == null && !cellText(row[P.weekNo])) return; // blank or trailing row
    if (weekNo == null || !Number.isInteger(weekNo) || weekNo < 1) {
      warnings.push({ path: weekCell, message: `Veckonumret "${cellText(row[P.weekNo])}" gick inte att läsa. Raden hoppades över.` });
      return;
    }
    if (seenWeeks.has(weekNo)) {
      warnings.push({ path: weekCell, message: `Vecka ${weekNo} finns två gånger. Bara den första används.` });
      return;
    }

    const dateCell = `Veckoplan!${columnLetter(P.monday)}${rowNo}`;
    let monday = cellDate(row[P.monday]);
    if (!monday) {
      warnings.push({ path: dateCell, message: `Vecka ${weekNo} saknar giltigt datum och hoppades över. Fyll i veckans måndag och importera igen.` });
      return;
    }
    if (!isMonday(monday)) {
      const snapped = weekStartIso(monday);
      warnings.push({ path: dateCell, message: `Vecka ${weekNo}: ${monday} är ingen måndag. Veckan börjar ${snapped} i stället.` });
      monday = snapped;
    }
    seenWeeks.add(weekNo);

    const sessions: CanonicalSession[] = [];
    const runByDay = new Map<number, CanonicalSession>();
    P.days.forEach((c, d) => {
      const raw = row[c];
      const km = cellNumber(raw);
      if (km == null) {
        if (cellText(raw)) {
          warnings.push({ path: `Veckoplan!${columnLetter(c)}${rowNo}`, message: `"${cellText(raw)}" är ingen distans. Dagen lämnades tom.` });
        }
        return;
      }
      if (km <= 0) return; // 0 = rest
      const session: CanonicalSession = {
        date: addDaysIso(monday, d),
        type: 'run',
        items: [{ kind: 'distance', rawText: formatKm(km), distanceKm: km, perSide: false, parseConfidence: 1 }],
      };
      sessions.push(session);
      runByDay.set(d, session);
    });

    // Weekday text columns ("Onsdag – kvalitetspass") describe that day's run.
    for (const dt of P.dayTexts) {
      const text = cellText(row[dt.column]);
      if (!text || text === '-') continue;
      const existing = runByDay.get(dt.dayIndex);
      if (existing) {
        existing.notes = existing.notes ? `${existing.notes}\n${text}` : text;
      } else {
        warnings.push({
          path: `Veckoplan!${columnLetter(dt.column)}${rowNo}`,
          message: `Vecka ${weekNo}: "${dt.header}" har text men ingen planerad distans den dagen. Passet lades till utan distans.`,
        });
        const session: CanonicalSession = { date: addDaysIso(monday, dt.dayIndex), type: 'run', notes: text, items: [] };
        sessions.push(session);
        runByDay.set(dt.dayIndex, session);
      }
    }

    const meta: Record<string, unknown> = {};
    const setMeta = (key: string, v: unknown) => {
      const t = cellText(v);
      if (t) meta[key] = cellNumber(v) ?? t;
    };
    setMeta('weeksLeft', at(row, P.weeksLeft));
    setMeta('plannedKmSum', at(row, P.plannedSum));
    setMeta('plannedRunCount', at(row, P.runCount));
    setMeta('plannedStrengthCount', at(row, P.strengthCount));
    setMeta('strengthMode', at(row, P.strengthMode));

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

    const phase = cellText(at(row, P.phase));
    const focusText = cellText(at(row, P.focus));
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
  if (!first && resolved.ok) {
    warnings.push({ path: 'Veckoplan', message: 'Hittade inga veckor. Kontrollera att varje rad har veckonummer och måndagens datum.' });
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
