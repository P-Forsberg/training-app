import { describe, expect, it } from 'vitest';
import { cellDate, cellNumber, col, excelSerialToIso } from './cells';

describe('cells', () => {
  it('excel serials', () => {
    expect(excelSerialToIso(46286)).toBe('2026-09-21');
    expect(excelSerialToIso(61)).toBe('1900-03-01');
    expect(excelSerialToIso(-1)).toBeUndefined();
  });

  it('dates in several notations', () => {
    expect(cellDate('2026-09-21')).toBe('2026-09-21');
    expect(cellDate('2026-9-1 00:00')).toBe('2026-09-01');
    expect(cellDate('21/9/2026')).toBe('2026-09-21');
    expect(cellDate('21.09.2026')).toBe('2026-09-21');
    expect(cellDate(new Date(2026, 8, 21))).toBe('2026-09-21');
    expect(cellDate('2026-02-30')).toBeUndefined();
    expect(cellDate('')).toBeUndefined();
  });

  it('numbers with decimal comma', () => {
    expect(cellNumber('12,5')).toBe(12.5);
    expect(cellNumber(' 8 ')).toBe(8);
    expect(cellNumber('vila')).toBeUndefined();
    expect(cellNumber(null)).toBeUndefined();
  });

  it('column letters', () => {
    expect(col('A')).toBe(0);
    expect(col('P')).toBe(15);
    expect(col('AA')).toBe(26);
  });
});
