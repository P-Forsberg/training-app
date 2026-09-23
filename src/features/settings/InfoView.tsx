import { useMemo, useState } from 'react';
import { useActiveProgram, useProgramNotes } from '@/data/repository';
import { normalizeExerciseName } from '@/domain/exerciseParser';
import { Block, EmptyState, inputClass } from '@/ui/components';
import { cn } from '@/ui/cn';
import { PageHeader } from '@/ui/PageHeader';

/** Searchable key/value notes imported with the program ("Läs först", "Nyckelpass"). */
export function InfoView() {
  const program = useActiveProgram();
  const notes = useProgramNotes(program?.id ?? undefined);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = normalizeExerciseName(q);
    return (notes ?? []).filter((n) => !needle || normalizeExerciseName(`${n.key} ${n.value}`).includes(needle));
  }, [notes, q]);
  const sections = [...new Set(filtered.map((n) => n.section))];

  return (
    <>
      <PageHeader title="Info" subtitle={program?.name} />
      {!notes?.length ? (
        <EmptyState title="Inga anteckningar">Programmet har inga infosidor. De skapas när en fil med flikarna Läs först eller Nyckelpass importeras.</EmptyState>
      ) : (
        <>
          <label htmlFor="info-search" className="sr-only">
            Sök i anteckningarna
          </label>
          <input id="info-search" type="search" placeholder="Sök" className={cn(inputClass, 'mb-3 w-full text-left font-normal')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <Block key={section} className="p-4">
                <h2 className="mb-2 text-[15px] font-semibold">{section}</h2>
                <dl className="flex flex-col gap-3 text-sm">
                  {filtered
                    .filter((n) => n.section === section)
                    .map((n) => (
                      <div key={n.id}>
                        {n.key && <dt className="font-medium">{n.key}</dt>}
                        <dd className="whitespace-pre-line text-muted">{n.value}</dd>
                      </div>
                    ))}
                </dl>
              </Block>
            ))}
          </div>
        </>
      )}
    </>
  );
}
