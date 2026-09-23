import type { SheetData } from './cells';

/**
 * Reads an xlsx/xls/csv file into plain rows. SheetJS is loaded lazily so it
 * stays out of the main bundle. Dates come through as Excel serial numbers and
 * are converted by cellDate(), never via JavaScript time zones.
 */
export async function readWorkbook(file: ArrayBuffer): Promise<SheetData> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(file, { type: 'array', cellDates: false });
  const out: SheetData = {};
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    out[name] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  }
  return out;
}
