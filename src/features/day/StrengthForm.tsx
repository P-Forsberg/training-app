import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { deleteLoggedSet, logPlannedSet, skipPlannedExercise } from '@/data/commands/logging';
import type { LoggedSetRow, PlannedItemRow } from '@/data/rows';
import { usePreviousSets } from '@/data/repository';
import { itemLabel } from './labels';
import { Button, CommitInput } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatDate, formatDuration, formatNumber, parseDecimal } from '@/ui/format';

function plannedSetCount(item: PlannedItemRow): number {
  if (item.sets) return item.sets;
  return item.rep_scheme === 'rm' ? 3 : 1;
}

/**
 * One row per exercise, name left and scheme right. Tapping opens a grid with
 * one row per set: weight, reps, RPE. The previous log shows as grey placeholders.
 */
export function StrengthForm({
  plannedSessionId,
  items,
  sets,
  date,
  onChanged,
}: {
  plannedSessionId: string;
  items: PlannedItemRow[];
  sets: LoggedSetRow[];
  date: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const exerciseIds = items.map((i) => i.exercise_id).filter((id): id is string => !!id);
  const previous = usePreviousSets(exerciseIds, date);

  return (
    <ul className="px-4">
      {items.map((item) => {
        const { name, scheme } = itemLabel(item);
        if (item.kind !== 'exercise') {
          return (
            <li key={item.id} className="flex min-h-12 items-center gap-3 border-b border-line py-2 last:border-b-0">
              <span className="text-[14.5px] font-medium">{name}</span>
              <span className="ml-auto text-sm text-muted">{scheme}</span>
            </li>
          );
        }
        const itemSets = sets.filter((s) => s.planned_item_id === item.id).sort((a, b) => a.set_no - b.set_no);
        const skipped = itemSets.length > 0 && itemSets.every((s) => s.skipped);
        const doneSets = itemSets.filter((s) => !s.skipped && (s.weight_kg != null || s.reps != null || s.duration_sec != null)).length;
        const isOpen = !!open[item.id];
        const prev = item.exercise_id ? previous?.get(item.exercise_id) : undefined;
        return (
          <li key={item.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}
              className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
            >
              <span className={cn('text-[14.5px] font-medium', skipped && 'text-muted line-through')}>{name}</span>
              {item.parse_confidence < 1 && <span className="text-[11px] text-warn">kontrollera</span>}
              <span className="ml-auto whitespace-nowrap text-sm text-muted">
                {doneSets > 0 && <span className="mr-2 text-accent">{doneSets} set</span>}
                {scheme}
              </span>
              <ChevronDown size={16} className={cn('text-muted transition-transform', isOpen && 'rotate-180')} aria-hidden />
            </button>
            {isOpen && (
              <SetGrid
                plannedSessionId={plannedSessionId}
                item={item}
                sets={itemSets}
                previous={prev}
                skipped={skipped}
                onChanged={onChanged}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SetGrid({
  plannedSessionId,
  item,
  sets,
  previous,
  skipped,
  onChanged,
}: {
  plannedSessionId: string;
  item: PlannedItemRow;
  sets: LoggedSetRow[];
  previous?: { date: string; sets: LoggedSetRow[] };
  skipped: boolean;
  onChanged?: () => void;
}) {
  const [extra, setExtra] = useState(0);
  const timed = item.rep_scheme === 'time';
  const maxLogged = sets.reduce((m, s) => Math.max(m, s.set_no), 0);
  const count = Math.max(plannedSetCount(item), maxLogged) + extra;

  const save = async (setNo: number, patch: Parameters<typeof logPlannedSet>[3]) => {
    await logPlannedSet(plannedSessionId, item.id, setNo, patch);
    onChanged?.();
  };

  const numberCommit = (setNo: number, field: 'weight_kg' | 'reps' | 'rpe' | 'duration_sec', max: number) => async (t: string) => {
    const v = parseDecimal(t);
    if (v === undefined || (v != null && (v < 0 || v > max))) return false;
    const value = v == null ? null : field === 'reps' || field === 'duration_sec' ? Math.round(v) : v;
    await save(setNo, { [field]: value });
  };

  return (
    <div className="pb-3">
      <div className="grid grid-cols-[1.75rem_1fr_1fr_1fr_2.75rem] items-center gap-2 pb-1 text-[11px] text-muted" aria-hidden>
        <span>Set</span>
        <span>Kg</span>
        <span>{timed ? 'Sek' : 'Reps'}</span>
        <span>RPE</span>
        <span />
      </div>
      {Array.from({ length: count }, (_, i) => {
        const setNo = i + 1;
        const s = sets.find((x) => x.set_no === setNo);
        const p = previous?.sets.find((x) => x.set_no === setNo) ?? previous?.sets[previous.sets.length - 1];
        const repsPlaceholder = timed
          ? String(p?.duration_sec ?? item.duration_sec ?? '')
          : String(p?.reps ?? item.reps ?? '');
        return (
          <div key={setNo} className={cn('grid grid-cols-[1.75rem_1fr_1fr_1fr_2.75rem] items-center gap-2 py-1', s?.skipped && 'opacity-50')}>
            <span className="text-xs text-muted">{setNo}</span>
            <CommitInput
              aria-label={`Set ${setNo}, vikt i kilo`}
              inputMode="decimal"
              className="w-full min-w-0 text-sm"
              placeholder={p?.weight_kg != null ? formatNumber(p.weight_kg) : 'kg'}
              value={formatNumber(s?.weight_kg)}
              errorText="Skriv vikten som en siffra."
              onCommit={numberCommit(setNo, 'weight_kg', 1000)}
            />
            <CommitInput
              aria-label={`Set ${setNo}, ${timed ? 'sekunder' : 'repetitioner'}`}
              inputMode="numeric"
              className="w-full min-w-0 text-sm"
              placeholder={repsPlaceholder || (timed ? 'sek' : 'reps')}
              value={formatNumber(timed ? s?.duration_sec : s?.reps)}
              errorText="Skriv en siffra."
              onCommit={numberCommit(setNo, timed ? 'duration_sec' : 'reps', timed ? 36000 : 1000)}
            />
            <CommitInput
              aria-label={`Set ${setNo}, RPE`}
              inputMode="decimal"
              className="w-full min-w-0 text-sm"
              placeholder={p?.rpe != null ? formatNumber(p.rpe) : 'RPE'}
              value={formatNumber(s?.rpe)}
              errorText="RPE är en siffra mellan 0 och 10."
              onCommit={numberCommit(setNo, 'rpe', 10)}
            />
            {s && setNo > plannedSetCount(item) ? (
              <Button variant="ghost" size="icon" aria-label={`Ta bort set ${setNo}`} onClick={() => void deleteLoggedSet(s.id)}>
                ×
              </Button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      <p className="pt-1 text-[11.5px] text-muted">
        {previous
          ? `Förra gången (${formatDate(previous.date)}): ${previous.sets
              .map((s) => (timed ? formatDuration(s.duration_sec) : `${formatNumber(s.weight_kg) || '–'} × ${s.reps ?? '–'}`))
              .join(', ')}`
          : 'Ingen tidigare logg för den här övningen.'}
      </p>
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="ghost" className="text-accent" onClick={() => setExtra((n) => n + 1)}>
          + Lägg till set
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void skipPlannedExercise(plannedSessionId, item.id, !skipped)}>
          {skipped ? 'Ångra hoppa över' : 'Hoppa över övningen'}
        </Button>
      </div>
    </div>
  );
}
