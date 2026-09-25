import { describe, expect, it } from 'vitest';
import { CanonicalProgram } from '../canonical';
import { QUALITY_EXAMPLES, syntheticKullamannen } from '../fixtures/syntheticKullamannen';
import { detect, parse } from './xlsxKullamannen';

describe('xlsx-kullamannen adapter', () => {
  it('detects the layout by sheet names, case-insensitively', () => {
    expect(detect(syntheticKullamannen())).toBe(true);
    expect(detect({ veckoplan: [], STYRKA: [] })).toBe(true);
    expect(detect({ Veckoplan: [] })).toBe(false);
  });

  it('produces a valid canonical program', () => {
    const result = CanonicalProgram.safeParse(parse(syntheticKullamannen(), 'Testplan.xlsx'));
    expect(result.success).toBe(true);
    const p = result.data!;
    expect(p.name).toBe('Testplan');
    expect(p.startDate).toBe('2026-09-21');
    expect(p.weeks).toHaveLength(4);
    expect(p.warnings).toEqual([]);
  });

  it('maps runs from the day columns and skips 0 km', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen()));
    const w1 = p.weeks[0]!;
    const runs = w1.sessions.filter((s) => s.type === 'run');
    expect(runs.map((r) => [r.date, r.items[0]!.distanceKm])).toEqual([
      ['2026-09-21', 5],
      ['2026-09-22', 6],
      ['2026-09-23', 10],
      ['2026-09-24', 6],
      ['2026-09-26', 10],
    ]);
  });

  it('puts the weekday text column on that day’s run, weekday taken from the header', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen(5)));
    const wednesdays = p.weeks.map((w) => w.sessions.find((s) => s.type === 'run' && s.date === w.sessions.find((x) => x.type === 'strength' && x.title === 'ME Upper')!.date));
    expect(wednesdays.map((s) => s?.notes)).toEqual(QUALITY_EXAMPLES);
    // Only the Wednesday run carries the text.
    expect(p.weeks[0]!.sessions.filter((s) => s.notes)).toHaveLength(1);
  });

  it('reads focus from the renamed, moved column Q', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen()));
    expect(p.weeks[0]!.focusText).toBe('Testfokus vecka 1');
  });

  it('still imports the old 16-column layout', () => {
    const data = syntheticKullamannen(2);
    data.Veckoplan = data.Veckoplan!.map((row, i) => {
      const r = [...row];
      r.splice(15, 1); // drop "Onsdag – kvalitetspass"
      if (i === 0) r[15] = 'Fokus';
      return r;
    });
    const p = CanonicalProgram.parse(parse(data));
    expect(p.weeks).toHaveLength(2);
    expect(p.weeks[0]!.focusText).toBe('Testfokus vecka 1');
    expect(p.weeks[0]!.sessions.some((s) => s.notes)).toBe(false);
  });

  it('a text on a day without distance still creates the run, with a warning', () => {
    const data = syntheticKullamannen(1);
    data.Veckoplan![1]![6] = 0; // Wednesday km
    const p = CanonicalProgram.parse(parse(data));
    const wed = p.weeks[0]!.sessions.find((s) => s.type === 'run' && s.date === '2026-09-23');
    expect(wed).toMatchObject({ notes: QUALITY_EXAMPLES[0], items: [] });
    expect(p.warnings).toHaveLength(1);
  });

  it('a header row without the required columns gives one clear warning', () => {
    const data = syntheticKullamannen(1);
    data.Veckoplan![0] = data.Veckoplan![0]!.map(() => 'X');
    const p = parse(data);
    expect(p.weeks).toEqual([]);
    expect(p.warnings?.[0]).toEqual({ path: 'Veckoplan!1', message: expect.stringContaining('Rubrikraden saknar Vecka') });
  });

  it('maps strength columns to Monday, Wednesday and Friday with parsed items', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen()));
    const strength = p.weeks[0]!.sessions.filter((s) => s.type === 'strength');
    expect(strength.map((s) => [s.date, s.title, s.items.length])).toEqual([
      ['2026-09-21', 'ME Lower', 3],
      ['2026-09-23', 'ME Upper', 2],
      ['2026-09-25', 'DE Combo', 3],
    ]);
    expect(strength[0]!.items[0]).toMatchObject({ exerciseName: 'Box Squat', repScheme: 'rm', reps: 1, repsMax: 3 });
  });

  it('"-" means no strength session that day', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen(4)));
    const last = p.weeks[3]!;
    expect(last.sessions.some((s) => s.type === 'strength' && s.date === '2026-10-16')).toBe(false);
  });

  it('keeps week metadata, focus text and the Monday instruction', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen()));
    const w = p.weeks[1]!;
    expect(w).toMatchObject({ weekNo: 2, startDate: '2026-09-28', phase: 'Testfas', focusText: 'Testfokus vecka 2' });
    expect(w.meta).toMatchObject({
      weeksLeft: 2,
      strengthMode: 'Full',
      cycle: 'Testcykel',
      programWeek: 2,
      dayNotes: { '2026-09-28': 'Testinstruktion vecka 2' },
    });
  });

  it('imports key/value sheets as notes', () => {
    const p = CanonicalProgram.parse(parse(syntheticKullamannen()));
    expect(p.notes).toEqual([
      { section: 'Läs först', key: 'Testnyckel', value: 'Testvärde' },
      { section: 'Läs först', key: 'Annan nyckel', value: 'Annat värde' },
      { section: 'Nyckelpass', key: 'Långpass', value: 'Testbeskrivning' },
    ]);
  });

  it('allows gaps and warns instead of failing on broken rows', () => {
    const data = syntheticKullamannen(3);
    const plan = data.Veckoplan!;
    plan.splice(2, 1); // remove week 2 → gap
    plan.push([9, 'inte ett datum', 'X']);
    plan.push(['nio', 46300]);
    plan.push([10, '2026-12-02', 'Testfas', 0, 'fem', 0, 0, 0, 0, 0, 0]); // Wednesday, non-numeric km
    const p = CanonicalProgram.parse(parse(data));
    expect(p.weeks.map((w) => w.weekNo)).toEqual([1, 3, 10]);
    expect(p.weeks[2]!.startDate).toBe('2026-11-30');
    expect(p.warnings.map((w) => w.path)).toEqual(
      expect.arrayContaining(['Veckoplan!B4', 'Veckoplan!A5', 'Veckoplan!B6', 'Veckoplan!E6', 'Styrka!A3']),
    );
  });

  it('an empty workbook yields a warning, not an exception', () => {
    const p = parse({ Veckoplan: [], Styrka: [] });
    expect(p.weeks).toEqual([]);
    expect(p.warnings).toHaveLength(1);
  });
});
