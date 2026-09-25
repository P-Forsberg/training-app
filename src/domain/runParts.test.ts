import { describe, expect, it } from 'vitest';
import { applyRunEdit, partsSum, type RunParts } from './runParts';

const empty: RunParts = { distance_km: null, warmup_km: null, main_km: null, cooldown_km: null, distance_manual: false };

describe('runParts', () => {
  it('the total follows the parts as soon as one has a value', () => {
    expect(applyRunEdit(empty, 'warmup_km', 3)).toEqual({ warmup_km: 3, distance_km: 3 });
    const r = { ...empty, warmup_km: 3, main_km: 4.1, distance_km: 7.1 };
    expect(applyRunEdit(r, 'cooldown_km', 3)).toEqual({ cooldown_km: 3, distance_km: 10.1 });
  });

  it('typing the total switches automation off for that run', () => {
    const r = { ...empty, warmup_km: 3, distance_km: 3 };
    expect(applyRunEdit(r, 'distance_km', 12)).toEqual({ distance_manual: true, distance_km: 12 });
    const manual = { ...r, distance_km: 12, distance_manual: true };
    expect(applyRunEdit(manual, 'main_km', 5)).toEqual({ main_km: 5 });
  });

  it('clearing the total switches automation back on', () => {
    const manual = { ...empty, warmup_km: 3, main_km: 5, distance_km: 12, distance_manual: true };
    expect(applyRunEdit(manual, 'distance_km', null)).toEqual({ distance_manual: false, distance_km: 8 });
    expect(applyRunEdit({ ...empty, distance_km: 5, distance_manual: true }, 'distance_km', null)).toEqual({ distance_manual: false, distance_km: null });
  });

  it('clearing the last part clears the automatic total', () => {
    expect(applyRunEdit({ ...empty, warmup_km: 3, distance_km: 3 }, 'warmup_km', null)).toEqual({ warmup_km: null, distance_km: null });
  });

  it('sums without float noise', () => {
    expect(partsSum({ warmup_km: 3.1, main_km: 4.2, cooldown_km: 2.8 })).toBe(10.1);
    expect(partsSum({ warmup_km: null, main_km: null, cooldown_km: null })).toBeNull();
  });
});
