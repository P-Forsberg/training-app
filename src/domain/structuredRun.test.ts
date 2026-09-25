import { describe, expect, it } from 'vitest';
import { parseStructuredRun } from './structuredRun';

describe('parseStructuredRun – the five documented examples', () => {
  it('Intervaller: 6×2 min i 10 km-fart, 2 min trav. 3 km uppvärmning, 3 km nedjogg.', () => {
    expect(parseStructuredRun('Intervaller: 6×2 min i 10 km-fart, 2 min trav. 3 km uppvärmning, 3 km nedjogg.')).toEqual({
      type: 'Intervaller',
      main: '6×2 min i 10 km-fart, 2 min trav',
      warmupKm: 3,
      cooldownKm: 3,
      reps: 6,
      workMin: 2,
      restMin: 2,
    });
  });

  it('Backar: 8×2 min uppför, jogga ned som vila. 5 km uppvärmning, 3 km nedjogg.', () => {
    const r = parseStructuredRun('Backar: 8×2 min uppför, jogga ned som vila. 5 km uppvärmning, 3 km nedjogg.');
    expect(r).toEqual({
      type: 'Backar',
      main: '8×2 min uppför, jogga ned som vila',
      warmupKm: 5,
      cooldownKm: 3,
      reps: 8,
      workMin: 2,
    });
    expect(r?.restMin).toBeUndefined();
  });

  it('Tempo: 2×18 min i halvmarafart, 4 min trav. 3 km uppvärmning, 2 km nedjogg.', () => {
    expect(parseStructuredRun('Tempo: 2×18 min i halvmarafart, 4 min trav. 3 km uppvärmning, 2 km nedjogg.')).toEqual({
      type: 'Tempo',
      main: '2×18 min i halvmarafart, 4 min trav',
      warmupKm: 3,
      cooldownKm: 2,
      reps: 2,
      workMin: 18,
      restMin: 4,
    });
  });

  it('Progressivt 16 km … is one continuous run, not structured', () => {
    expect(parseStructuredRun('Progressivt 16 km: lugnt de första 11 km, sista 5 km stadigt i maratonfart.')).toBeNull();
  });

  it('Lugnt 9 km med 6×20 s stegringar sist. is one continuous run, not structured', () => {
    expect(parseStructuredRun('Lugnt 9 km med 6×20 s stegringar sist.')).toBeNull();
  });
});

describe('parseStructuredRun – variants and broken input', () => {
  it('accepts x as well as ×, and decimal warm-up', () => {
    expect(parseStructuredRun('Intervaller: 5x3 min, 2 min vila. 2,5 km uppvärmning, 2 km nedjogg.')).toMatchObject({
      reps: 5,
      workMin: 3,
      restMin: 2,
      warmupKm: 2.5,
    });
  });

  it('a structured session without reps keeps only the parts', () => {
    const r = parseStructuredRun('Tröskel: 20 min stadigt. 3 km uppvärmning, 2 km nedjogg.');
    expect(r).toMatchObject({ type: 'Tröskel', main: '20 min stadigt', warmupKm: 3, cooldownKm: 2 });
    expect(r?.reps).toBeUndefined();
  });

  it.each(['', '   ', null, undefined, 'Intervaller: 6×2 min', ':. 3 km uppvärmning, 2 km nedjogg', 'x'.repeat(3000)])('%j → null, never throws', (t) => {
    expect(() => parseStructuredRun(t as string)).not.toThrow();
    expect(parseStructuredRun(t as string)).toBeNull();
  });
});
