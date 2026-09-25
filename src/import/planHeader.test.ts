import { describe, expect, it } from 'vitest';
import { columnLetter, resolvePlanColumns } from './planHeader';

const NEW_LAYOUT = [
  'Vecka', 'Måndag', 'Fas', 'Veckor kvar', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön',
  'Summa km', 'Löppass', 'Styrkepass', 'Styrkeläge', 'Onsdag – kvalitetspass', 'Veckans fokus och nyckelpass',
];

describe('resolvePlanColumns', () => {
  it('reads the 17-column layout by header names', () => {
    const r = resolvePlanColumns(NEW_LAYOUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns).toMatchObject({
      weekNo: 0,
      monday: 1,
      phase: 2,
      weeksLeft: 3,
      days: [4, 5, 6, 7, 8, 9, 10],
      plannedSum: 11,
      runCount: 12,
      strengthCount: 13,
      strengthMode: 14,
      focus: 16,
    });
    expect(r.columns.dayTexts).toEqual([{ column: 15, dayIndex: 2, label: 'kvalitetspass', header: 'Onsdag – kvalitetspass' }]);
  });

  it('still reads the old 16-column layout', () => {
    const old = ['Vecka', 'Måndag', 'Fas', 'Veckor kvar', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön', 'Summa', 'Löppass', 'Styrkepass', 'Styrkeläge', 'Fokus'];
    const r = resolvePlanColumns(old);
    expect(r.ok && r.columns.focus).toBe(15);
    expect(r.ok && r.columns.dayTexts).toEqual([]);
  });

  it('survives an added or moved column', () => {
    const moved = ['Vecka', 'Kommentar', 'Måndagsdatum', 'Fas', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag', 'Fredag - extra', 'Fokus'];
    const r = resolvePlanColumns(moved);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns.monday).toBe(2);
    expect(r.columns.days).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(r.columns.dayTexts).toEqual([{ column: 11, dayIndex: 4, label: 'extra', header: 'Fredag - extra' }]);
    expect(r.columns.focus).toBe(12);
  });

  it('reports missing required columns instead of guessing', () => {
    const r = resolvePlanColumns(['Nummer', 'Datum', 'A', 'B']);
    expect(r).toEqual({ ok: false, missing: ['Vecka', 'Mån … Sön (sju kolumner i rad)'] });
  });

  it('column letters', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(16)).toBe('Q');
    expect(columnLetter(26)).toBe('AA');
  });
});
