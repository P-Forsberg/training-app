import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { parseIsoDate } from '@/domain/dates';

export const WEEKDAYS_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
export const WEEKDAYS_LONG = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];

const kmFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
const numFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export function formatKm(km: number | null | undefined): string {
  return kmFormat.format(km ?? 0);
}

export function formatNumber(n: number | null | undefined): string {
  return n == null ? '' : numFormat.format(n);
}

/** Parses user input with comma or dot decimals. Empty → null. Invalid → undefined. */
export function parseDecimal(s: string): number | null | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "45", "45:30", "1:05:00" → seconds. Plain number = minutes. */
export function parseDuration(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+([.,]\d+)?$/.test(t)) return Math.round(Number(t.replace(',', '.')) * 60);
  const parts = t.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return undefined;
}

export function pace(distanceKm: number | null | undefined, durationSec: number | null | undefined): string {
  if (!distanceKm || !durationSec) return '';
  const secPerKm = Math.round(durationSec / distanceKm);
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')} /km`;
}

export function formatDate(iso: string, pattern = 'd MMM'): string {
  const d = parseIsoDate(iso);
  return d ? format(d, pattern, { locale: sv }) : iso;
}

export function formatDayTitle(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const s = format(d, 'EEEE d MMMM', { locale: sv });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
