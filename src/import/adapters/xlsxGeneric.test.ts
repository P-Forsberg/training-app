import { describe, expect, it } from 'vitest';
import { CanonicalProgram } from '../canonical';
import { parse, suggestMapping, type GenericMapping } from './xlsxGeneric';

const weekRows = {
  Plan: [
    ['Vecka', 'Start', 'Fas', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön', 'Gym mån', 'Fokus'],
    [1, '2026-10-05', 'Testbas', 0, 8, 0, 8, 0, 15, 0, 'Back Squat – 5×5\nPlank – 3×30 s', 'Testfokus'],
    [2, '2026-10-12', 'Testbas', 0, 9, 0, 9, 0, 16, 10, '-', ''],
    [],
    [4, '2026-10-28', 'Testbygg', 0, 10, 0, 0, 0, 0, 0, '', ''], // Wednesday → snapped to Monday
  ],
};

const weekMapping: GenericMapping = {
  layout: 'week-rows',
  sheet: 'Plan',
  firstDataRow: 2,
  weekNo: 'A',
  weekStart: 'B',
  phase: 'C',
  focus: 'L',
  dayKm: ['D', 'E', 'F', 'G', 'H', 'I', 'J'],
  dayText: ['K', null, null, null, null, null, null],
};

describe('xlsx-generic adapter, week rows', () => {
  it('builds weeks, runs and strength sessions from mapped columns', () => {
    const p = CanonicalProgram.parse(parse(weekRows, weekMapping, 'Test.xlsx'));
    expect(p.weeks.map((w) => [w.weekNo, w.startDate])).toEqual([
      [1, '2026-10-05'],
      [2, '2026-10-12'],
      [4, '2026-10-26'],
    ]);
    const w1 = p.weeks[0]!;
    expect(w1.phase).toBe('Testbas');
    expect(w1.focusText).toBe('Testfokus');
    expect(w1.sessions.map((s) => [s.date, s.type])).toEqual([
      ['2026-10-05', 'strength'],
      ['2026-10-06', 'run'],
      ['2026-10-08', 'run'],
      ['2026-10-10', 'run'],
    ]);
    expect(p.weeks[1]!.sessions.some((s) => s.type === 'strength')).toBe(false);
  });
});

describe('xlsx-generic adapter, session rows', () => {
  const data = {
    Pass: [
      ['Datum', 'Typ', 'Namn', 'Km', 'Min', 'Innehåll'],
      ['2026-10-06', 'Löpning', 'Lugnt', 8, 45, ''],
      ['2026-10-07', '', '', '', '', 'Back Squat – 5×5\nPull-Ups – 3×AMRAP'],
      ['2026-10-21', 'Vila', '', '', '', ''],
      ['fel', 'Löpning', '', 5, '', ''],
    ],
  };
  const mapping: GenericMapping = {
    layout: 'session-rows',
    sheet: 'Pass',
    firstDataRow: 2,
    date: 'A',
    type: 'B',
    title: 'C',
    distanceKm: 'D',
    durationMin: 'E',
    text: 'F',
  };

  it('groups sessions into Monday weeks and keeps gaps in numbering', () => {
    const p = CanonicalProgram.parse(parse(data, mapping));
    expect(p.weeks.map((w) => [w.weekNo, w.startDate])).toEqual([
      [1, '2026-10-05'],
      [3, '2026-10-19'],
    ]);
    const [run, strength] = p.weeks[0]!.sessions;
    expect(run).toMatchObject({ type: 'run', title: 'Lugnt' });
    expect(run!.items.map((i) => i.kind)).toEqual(['distance', 'duration']);
    expect(strength).toMatchObject({ type: 'strength' });
    expect(p.weeks[1]!.sessions[0]!.type).toBe('rest');
    expect(p.warnings).toEqual([{ path: 'Pass!A5', message: expect.any(String) }]);
  });

  it('missing sheet gives a warning', () => {
    const p = parse(data, { ...mapping, sheet: 'Finns inte' });
    expect(p.warnings?.length).toBeGreaterThan(0);
    expect(p.weeks).toEqual([]);
  });
});

describe('suggestMapping', () => {
  it('suggests week-rows when there are weekday columns', () => {
    const m = suggestMapping(weekRows);
    expect(m).toMatchObject({ layout: 'week-rows', weekStart: 'B', weekNo: 'A', phase: 'C' });
  });
});
