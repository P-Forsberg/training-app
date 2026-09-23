import { describe, expect, it } from 'vitest';
import { e1rm, e1rmSeries } from './e1rm';

describe('e1rm', () => {
  it('Epley', () => expect(e1rm(100, 5)).toBe(116.7));
  it('single is the weight', () => expect(e1rm(140, 1)).toBe(140));
  it('rejects invalid input', () => {
    expect(e1rm(0, 5)).toBeNull();
    expect(e1rm(100, 0)).toBeNull();
    expect(e1rm(100, 20)).toBeNull();
  });
  it('series keeps the best per day and skips warm-ups', () => {
    expect(
      e1rmSeries([
        { date: '2026-10-07', weightKg: 100, reps: 3 },
        { date: '2026-10-05', weightKg: 60, reps: 5, isWarmup: true },
        { date: '2026-10-05', weightKg: 100, reps: 5 },
        { date: '2026-10-05', weightKg: 90, reps: 5 },
      ]),
    ).toEqual([
      { date: '2026-10-05', e1rm: 116.7 },
      { date: '2026-10-07', e1rm: 110 },
    ]);
  });
});
