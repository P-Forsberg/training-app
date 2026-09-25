/**
 * A structured run is logged in three parts. The run's total distance follows
 * the sum of the parts until the user types a total by hand (manual); clearing
 * the total hands it back to the parts.
 */

export interface RunParts {
  distance_km: number | null;
  warmup_km: number | null;
  main_km: number | null;
  cooldown_km: number | null;
  distance_manual: boolean;
}

export type RunPartField = 'warmup_km' | 'main_km' | 'cooldown_km';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum of the parts that have a value, or null when none has. */
export function partsSum(r: Pick<RunParts, RunPartField>): number | null {
  const vals = [r.warmup_km, r.main_km, r.cooldown_km].filter((v): v is number => v != null);
  return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
}

/** Returns the fields to write after the user edited one part or the total. */
export function applyRunEdit(current: RunParts, field: RunPartField | 'distance_km', value: number | null): Partial<RunParts> {
  if (field === 'distance_km') {
    if (value == null) {
      // Cleared: automation takes over again.
      const sum = partsSum(current);
      return { distance_manual: false, distance_km: sum };
    }
    return { distance_manual: true, distance_km: value };
  }
  const next = { ...current, [field]: value };
  if (current.distance_manual) return { [field]: value };
  return { [field]: value, distance_km: partsSum(next) };
}
