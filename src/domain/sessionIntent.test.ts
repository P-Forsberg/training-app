import { describe, expect, it } from 'vitest';
import { addDaysIso } from './dates';
import { deriveRunIntents, intentFromTitle } from './sessionIntent';

const MON = '2026-10-12';
const run = (offset: number, title: string | null = null) => ({ id: `r${offset}`, date: addDaysIso(MON, offset), title });

describe('deriveRunIntents', () => {
  it('reads weekday + keyword from the week focus text', () => {
    const r = deriveRunIntents({
      monday: MON,
      weekTexts: ['Nu är du tillbaka i normal rytm. Tempo ons: 3x6 min.'],
      dayNotes: {},
      runs: [run(0), run(1), run(2), run(3), run(5)],
    });
    expect(r.get('r2')).toEqual({ intent: 'tempo', detail: '3x6 min', source: 'text' });
  });

  it('other runs in a week with a named quality session are easy', () => {
    const r = deriveRunIntents({ monday: MON, weekTexts: ['Tempo ons: 3x6 min.'], dayNotes: {}, runs: [run(1), run(2), run(5)] });
    expect(r.get('r1')).toMatchObject({ intent: 'easy', source: 'default' });
    expect(r.get('r5')).toMatchObject({ intent: 'easy', source: 'default' });
  });

  it('a week-wide "allt lugnt" makes every run easy', () => {
    const r = deriveRunIntents({
      monday: MON,
      weekTexts: ['ÅTERUPPBYGGNAD efter loppet. 4 pass, allt lugnt, inga hårda pass.'],
      dayNotes: {},
      runs: [run(0), run(2)],
    });
    expect(r.get('r0')).toMatchObject({ intent: 'easy', source: 'text' });
    expect(r.get('r2')).toMatchObject({ intent: 'easy', source: 'text' });
  });

  it('a quality session without a weekday is not guessed onto a day', () => {
    const r = deriveRunIntents({ monday: MON, weekTexts: ['Första fartpasset: kort fartlek, 6x2 min.'], dayNotes: {}, runs: [run(1), run(3)] });
    expect(r.get('r1')).toBeUndefined();
    expect(r.get('r3')).toBeUndefined();
  });

  it('understands full weekday names, intervals, hills and long runs', () => {
    const r = deriveRunIntents({
      monday: MON,
      weekTexts: ['Intervaller tisdag: 5x1000 m. Backar torsdag. Långpass lördag 30 km.'],
      dayNotes: {},
      runs: [run(1), run(3), run(5)],
    });
    expect(r.get('r1')).toMatchObject({ intent: 'interval', detail: '5x1000 m' });
    expect(r.get('r3')).toMatchObject({ intent: 'hills' });
    expect(r.get('r5')).toMatchObject({ intent: 'long', detail: '30 km' });
  });

  it('a day note describing an easy run tags that day', () => {
    const r = deriveRunIntents({
      monday: MON,
      weekTexts: [],
      dayNotes: { [MON]: 'DELAT PASS: 3 km lugnt som uppvärmning, lyft, sedan 8 km efter.' },
      runs: [run(0), run(2)],
    });
    expect(r.get('r0')).toMatchObject({ intent: 'easy', source: 'text' });
    expect(r.get('r2')).toBeUndefined();
  });

  it.each([
    ['Intervaller: 6×2 min i 10 km-fart, 2 min trav. 3 km uppvärmning, 3 km nedjogg.', 'interval', '6×2 min'],
    ['Backar: 8×2 min uppför, jogga ned som vila. 5 km uppvärmning, 3 km nedjogg.', 'hills', '8×2 min'],
    ['Tempo: 2×18 min i halvmarafart, 4 min trav. 3 km uppvärmning, 2 km nedjogg.', 'tempo', '2×18 min'],
    ['Progressivt 16 km: lugnt de första 11 km, sista 5 km stadigt i maratonfart.', 'progressive', '16 km'],
    ['Lugnt 9 km med 6×20 s stegringar sist.', 'easy', undefined],
  ])('quality column text %s → %s', (text, intent, detail) => {
    const r = deriveRunIntents({ monday: MON, weekTexts: [], dayNotes: { [addDaysIso(MON, 2)]: text }, runs: [run(1), run(2)] });
    expect(r.get('r2')).toEqual({ intent, ...(detail ? { detail } : {}), source: 'text' });
  });

  it('a quality session from the day column makes the other runs easy', () => {
    const r = deriveRunIntents({ monday: MON, weekTexts: [], dayNotes: { [addDaysIso(MON, 2)]: 'Tempo: 2×18 min i halvmarafart, 4 min trav. 3 km uppvärmning, 2 km nedjogg.' }, runs: [run(1), run(2)] });
    expect(r.get('r1')).toMatchObject({ intent: 'easy', source: 'default' });
  });

  it('a title set by the user wins over the text', () => {
    const r = deriveRunIntents({ monday: MON, weekTexts: ['Tempo ons: 3x6 min.'], dayNotes: {}, runs: [run(2, 'Lugnt')] });
    expect(r.get('r2')).toEqual({ intent: 'easy', source: 'title' });
  });

  it('does not match keywords inside other words', () => {
    const r = deriveRunIntents({ monday: MON, weekTexts: ['Fartygets tempot ons.'], dayNotes: {}, runs: [run(2)] });
    expect(r.get('r2')).toBeUndefined();
  });
});

describe('intentFromTitle', () => {
  it('maps the labels the menu writes', () => {
    expect(intentFromTitle('Tempo')).toBe('tempo');
    expect(intentFromTitle('Långpass')).toBe('long');
    expect(intentFromTitle('ME Lower')).toBeUndefined();
    expect(intentFromTitle(null)).toBeUndefined();
  });
});
