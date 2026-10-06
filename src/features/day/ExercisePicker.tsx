import { useMemo, useState } from 'react';
import { createExercise } from '@/data/commands/logging';
import { useExercises } from '@/data/repository';
import { normalizeExerciseName } from '@/domain/exerciseParser';
import { searchExercises } from '@/domain/exerciseSearch';
import { Button, inputClass, Sheet } from '@/ui/components';
import { cn } from '@/ui/cn';

/**
 * Pick the exercise actually done. Search covers the catalog and your own
 * exercises (names and aliases, Swedish and English); a name that is not
 * found can be added as your own exercise.
 */
export function ExercisePicker({
  open,
  onClose,
  plannedName,
  plannedId,
  currentId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  plannedName: string;
  plannedId: string | null;
  currentId: string | null;
  onPick: (exerciseId: string | null) => Promise<void>;
}) {
  const exercises = useExercises();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => [...(exercises?.values() ?? [])].filter((e) => !e.deleted_at).map((e) => ({ ...e, canonicalName: e.canonical_name })), [exercises]);
  const results = useMemo(() => searchExercises(query, list, 25), [query, list]);
  const exact = results.some((e) => [e.canonical_name, ...e.aliases].some((n) => normalizeExerciseName(n) === normalizeExerciseName(query)));
  const swapped = currentId !== plannedId;

  const pick = async (id: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await onPick(id);
      setQuery('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Övningen kunde inte bytas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Byt övning" tall>
      <div className="flex flex-col gap-3 px-4 pb-5">
        <p className="text-sm text-muted">
          Gäller bara det här passet. I planen står fortfarande <b className="font-medium text-fg">{plannedName}</b>.
        </p>
        <label htmlFor="exercise-search" className="sr-only">
          Sök övning
        </label>
        <input
          id="exercise-search"
          type="search"
          autoComplete="off"
          placeholder="Sök, till exempel landmine"
          className={cn(inputClass, 'text-left font-normal')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {swapped && (
          <Button variant="ghost" className="self-start" disabled={busy} onClick={() => void pick(null)}>
            Använd den planerade övningen ({plannedName})
          </Button>
        )}
        <ul className="flex flex-col" aria-label="Övningar">
          {results.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void pick(e.id)}
                aria-current={e.id === currentId || undefined}
                className={cn('flex min-h-12 w-full flex-col justify-center border-b border-line py-2 text-left', e.id === currentId && 'text-accent')}
              >
                <span className="text-[14.5px] font-medium">{e.canonical_name}</span>
                {e.aliases.length > 0 && <span className="truncate text-xs text-muted">{e.aliases.slice(0, 3).join(', ')}</span>}
              </button>
            </li>
          ))}
        </ul>
        {query.trim() && !exact && (
          <Button
            disabled={busy}
            onClick={async () => {
              try {
                const id = await createExercise(query);
                await pick(id);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Övningen kunde inte läggas till.');
              }
            }}
          >
            Lägg till ”{query.trim()}” som egen övning
          </Button>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
