import { isIsoDate } from '@/domain/dates';
import type { IsoDate } from '@/domain/types';

/** A workbook as plain data: sheet name → rows of raw cell values. */
export type SheetData = Record<string, unknown[][]>;

export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return cellDate(v) ?? '';
  return String(v).trim();
}

/** Parses numbers written with comma or dot decimals. Empty and non-numeric → undefined. */
export function cellNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const s = cellText(v).replace(/\s/g, '').replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Excel serial date (1900 system) → 'yyyy-MM-dd'. Calendar arithmetic only, no time zones. */
export function excelSerialToIso(serial: number): IsoDate | undefined {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return undefined;
  const days = Math.floor(serial);
  // Day 0 = 1899-12-30 once Excel's 1900 leap-year bug is accounted for.
  const ms = Date.UTC(1899, 11, 30) + days * 86_400_000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Accepts Excel serials, ISO strings, 'yyyy-MM-dd hh:mm', 'd/m/yyyy', 'd.m.yyyy' and Dates. */
export function cellDate(v: unknown): IsoDate | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return excelSerialToIso(v);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = cellText(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    return isIsoDate(iso) ? iso : undefined;
  }
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return isIsoDate(iso) ? iso : undefined;
  }
  const n = cellNumber(s);
  return n != null ? excelSerialToIso(n) : undefined;
}

/** Column letter(s) → zero-based index. 'A' → 0, 'P' → 15, 'AA' → 26. */
export function col(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function findSheet(data: SheetData, name: string): unknown[][] | undefined {
  const wanted = name.trim().toLowerCase();
  const key = Object.keys(data).find((k) => k.trim().toLowerCase() === wanted);
  return key ? data[key] : undefined;
}
