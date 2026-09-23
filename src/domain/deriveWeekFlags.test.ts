import { describe, expect, it } from 'vitest';
import { addDaysIso } from './dates';
import { deriveWeekFlags } from './deriveWeekFlags';
import type { PlannedSessionLike } from './types';

const MON = '2026-10-05';

function run(offset: number, km: number, monday = MON): PlannedSessionLike {
  return { date: addDaysIso(monday, offset), type: 'run', items: [{ kind: 'distance', distanceKm: km }] };
}
function strength(offset: number, monday = MON): PlannedSessionLike {
  return { date: addDaysIso(monday, offset), type: 'strength', items: [{ kind: 'exercise' }] };
}

describe('deriveWeekFlags', () => {
  it('detects a back-to-back weekend', () => {
    const f = deriveWeekFlags(MON, [run(1, 10), run(5, 30), run(6, 20)]);
    expect(f.backToBack).toBe(true);
    expect(f.days[5]!.isBackToBack).toBe(true);
    expect(f.days[6]!.isBackToBack).toBe(true);
    expect(f.days[1]!.isBackToBack).toBe(false);
  });

  it('is not back-to-back with only one weekend day', () => {
    expect(deriveWeekFlags(MON, [run(5, 30)]).backToBack).toBe(false);
  });

  it('a zero-km weekend run does not make back-to-back', () => {
    expect(deriveWeekFlags(MON, [run(5, 30), run(6, 0)]).backToBack).toBe(false);
  });

  it('days without planned content are rest days; rest-type sessions count as rest', () => {
    const f = deriveWeekFlags(MON, [run(1, 10), { date: addDaysIso(MON, 4), type: 'rest', items: [] }]);
    expect(f.days.map((d) => d.isRest)).toEqual([true, false, true, true, true, true, true]);
  });

  it('no weekday is assumed to be rest: a Friday run is a run', () => {
    const f = deriveWeekFlags(MON, [run(4, 8)]);
    expect(f.days[4]!.isRest).toBe(false);
    expect(f.days[4]!.hasRun).toBe(true);
  });

  it('sums the week', () => {
    const f = deriveWeekFlags(MON, [run(1, 10.25), run(3, 12), strength(0), strength(2), run(5, 30), run(6, 20)]);
    expect(f.totals).toMatchObject({ plannedKm: 72.3, runSessions: 4, strengthSessions: 2 });
    expect(f.days[0]).toMatchObject({ hasStrength: true, hasRun: false, isRest: false });
  });

  it('ignores sessions outside the week and soft-deleted ones', () => {
    const f = deriveWeekFlags(MON, [run(-1, 99), run(7, 99), { ...run(2, 50), deletedAt: '2026-10-01T00:00:00Z' }]);
    expect(f.totals.plannedKm).toBe(0);
  });

  it('flags the next Monday without running as rest after back-to-back', () => {
    const next = addDaysIso(MON, 7);
    const f = deriveWeekFlags(MON, [run(5, 30), run(6, 20)], { nextWeekSessions: [strength(0, next), run(1, 8, next)] });
    expect(f.restAfterBackToBack).toBe(true);
  });

  it('does not flag when next Monday has a run', () => {
    const next = addDaysIso(MON, 7);
    const f = deriveWeekFlags(MON, [run(5, 30), run(6, 20)], { nextWeekSessions: [run(0, 5, next)] });
    expect(f.restAfterBackToBack).toBe(false);
  });

  it('does not assume week N+1 exists', () => {
    const f = deriveWeekFlags(MON, [run(5, 30), run(6, 20)]);
    expect(f.restAfterBackToBack).toBe(false);
  });

  it('marks this Monday as rest after the previous back-to-back weekend', () => {
    const prev = addDaysIso(MON, -7);
    const f = deriveWeekFlags(MON, [strength(0), run(1, 10)], { previousWeekSessions: [run(5, 30, prev), run(6, 25, prev)] });
    expect(f.days[0]!.isRestAfterBackToBack).toBe(true);
    expect(f.days[1]!.isRestAfterBackToBack).toBe(false);
  });

  it('empty week', () => {
    const f = deriveWeekFlags(MON, []);
    expect(f.days).toHaveLength(7);
    expect(f.days.every((d) => d.isRest)).toBe(true);
    expect(f.totals).toEqual({ plannedKm: 0, runSessions: 0, strengthSessions: 0, plannedDurationSec: 0 });
  });
});
