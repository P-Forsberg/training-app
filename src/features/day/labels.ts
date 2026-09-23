import type { PlannedItemRow } from '@/data/rows';
import { splitNameAndScheme } from '@/domain/exerciseParser';
import type { RunSurface } from '@/domain/shoeMileage';

export const SURFACES: { value: RunSurface; label: string }[] = [
  { value: 'road', label: 'Väg' },
  { value: 'gravel', label: 'Grus' },
  { value: 'trail', label: 'Stig' },
  { value: 'technical', label: 'Teknisk stig' },
  { value: 'treadmill', label: 'Löpband' },
];

/** Name and scheme as the user wrote them in the plan ("Speed Bench", "8×3 @70%"). */
export function itemLabel(item: PlannedItemRow): { name: string; scheme: string } {
  const raw = item.raw_text ?? '';
  const { name, scheme } = splitNameAndScheme(raw);
  return { name: name || raw, scheme };
}
