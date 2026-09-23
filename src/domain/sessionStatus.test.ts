import { describe, expect, it } from 'vitest';
import { plannedSessionStatus } from './sessionStatus';

const planned = { date: '2026-10-06', type: 'run' };

describe('plannedSessionStatus', () => {
  it('planned in the future, missed in the past', () => {
    expect(plannedSessionStatus(planned, undefined, '2026-10-06')).toBe('planned');
    expect(plannedSessionStatus(planned, undefined, '2026-10-07')).toBe('missed');
  });
  it('rest days are never missed', () => {
    expect(plannedSessionStatus({ ...planned, type: 'rest' }, undefined, '2026-12-01')).toBe('planned');
  });
  it('uses the logged status on the planned date', () => {
    expect(plannedSessionStatus(planned, { date: '2026-10-06', status: 'done' }, '2026-10-07')).toBe('done');
  });
  it('a log on another date means moved', () => {
    expect(plannedSessionStatus(planned, { date: '2026-10-08', status: 'done' }, '2026-10-09')).toBe('moved');
  });
});
