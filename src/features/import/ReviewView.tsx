import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useExercises } from '@/data/repository';
import { buildExerciseIndex, matchExercise } from '@/domain/exerciseMatch';
import { parseExerciseLine } from '@/domain/exerciseParser';
import { CanonicalProgram, type CanonicalProgramInput, type ParsedItem } from '@/import/canonical';
import { Block, Button, Chip, Field, inputClass } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatDate, formatKm } from '@/ui/format';

type Program = CanonicalProgram;

function itemText(i: ParsedItem): string {
  return i.rawText;
}

function unknownExerciseNames(p: Program, index: ReturnType<typeof buildExerciseIndex>): string[] {
  if (!index.size) return [];
  const names = new Set<string>();
  for (const w of p.weeks)
    for (const s of w.sessions)
      for (const i of s.items) if (i.kind === 'exercise' && i.exerciseName && !matchExercise(i.exerciseName, index)) names.add(i.exerciseName);
  return [...names].sort((a, b) => a.localeCompare(b, 'sv'));
}

/**
 * Review before anything is written. Uncertain items are shown first and can be
 * corrected; warnings from the adapter are listed. "Importera" is the only way in.
 */
export function ReviewView({
  program: input,
  onBack,
  onImport,
}: {
  program: CanonicalProgramInput;
  onBack: () => void;
  onImport: (p: Program, profileName?: string) => Promise<string>;
}) {
  const initial = useMemo(() => CanonicalProgram.safeParse(input), [input]);
  const [program, setProgram] = useState<Program | null>(initial.success ? initial.data : null);
  const [profileName, setProfileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const isGeneric = (input.sourceMeta as Record<string, unknown> | undefined)?.adapter === 'xlsx-generic';
  const exercises = useExercises();
  const exerciseIndex = useMemo(
    () => buildExerciseIndex([...(exercises?.values() ?? [])].map((e) => ({ ...e, canonicalName: e.canonical_name }))),
    [exercises],
  );

  if (!program) {
    return (
      <Block className="p-4">
        <h2 className="font-semibold">Programmet gick inte att tolka</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-danger">
          {!initial.success && initial.error.issues.slice(0, 8).map((i, n) => <li key={n}>{`${i.path.join('.')}: ${i.message}`}</li>)}
        </ul>
        <Button className="mt-3" onClick={onBack}>
          Tillbaka
        </Button>
      </Block>
    );
  }

  const sessions = program.weeks.flatMap((w) => w.sessions);
  const newExercises = unknownExerciseNames(program, exerciseIndex);
  const totalKm = sessions.flatMap((s) => s.items).reduce((sum, i) => sum + (i.kind === 'distance' ? (i.distanceKm ?? 0) : 0), 0);
  const uncertain = program.weeks.flatMap((w, wi) =>
    w.sessions.flatMap((s, si) => s.items.map((item, ii) => ({ w, wi, si, ii, s, item })).filter((x) => x.item.parseConfidence < 1)),
  );

  const replaceItem = (wi: number, si: number, ii: number, raw: string) => {
    const parsed = parseExerciseLine(raw);
    setProgram((p) => {
      if (!p) return p;
      const weeks = structuredClone(p.weeks);
      const items = weeks[wi]!.sessions[si]!.items;
      if (parsed) items[ii] = { ...parsed, perSide: parsed.perSide ?? false };
      else items.splice(ii, 1);
      return { ...p, weeks };
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Block className="px-4 py-2">
        <Field label="Namn" htmlFor="rv-name">
          <input id="rv-name" className={cn(inputClass, 'w-52 text-left font-normal')} value={program.name} onChange={(e) => setProgram({ ...program, name: e.target.value })} />
        </Field>
        <Field label="Loppdatum" htmlFor="rv-race">
          <input
            id="rv-race"
            type="date"
            className={cn(inputClass, 'w-44 font-normal')}
            value={program.raceDate ?? ''}
            onChange={(e) => setProgram({ ...program, raceDate: e.target.value || undefined })}
          />
        </Field>
        {isGeneric && (
          <Field label="Spara kopplingen som" htmlFor="rv-profile">
            <input id="rv-profile" className={cn(inputClass, 'w-44 text-left font-normal')} placeholder="Valfritt" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </Field>
        )}
      </Block>

      <div className="flex flex-wrap gap-1.5">
        <Chip accent>{program.weeks.length} veckor</Chip>
        <Chip>{sessions.length} pass</Chip>
        <Chip>{formatKm(totalKm)} km löpning</Chip>
        <Chip>Start {formatDate(program.startDate, 'd MMM yyyy')}</Chip>
        {program.notes.length > 0 && <Chip>{program.notes.length} anteckningar</Chip>}
      </div>

      {program.warnings.length > 0 && (
        <Block className="p-4">
          <h2 className="text-[15px] font-semibold text-warn">{program.warnings.length} saker att känna till</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {program.warnings.map((w, i) => (
              <li key={i}>
                <span className="text-muted">{w.path}:</span> {w.message}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {uncertain.length > 0 && (
        <Block className="p-4">
          <h2 className="text-[15px] font-semibold">{uncertain.length} rader att kontrollera</h2>
          <p className="mt-1 text-sm text-muted">Raderna kunde inte tolkas helt. Rätta texten eller importera dem som de är; texten sparas alltid.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {uncertain.slice(0, 50).map(({ w, wi, si, ii, s, item }) => (
              <li key={`${wi}-${si}-${ii}`} className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  Vecka {w.weekNo}, {formatDate(s.date, 'EEEE d MMM')}
                </span>
                <input
                  aria-label={`Rad vecka ${w.weekNo}, ${s.date}`}
                  className={cn(inputClass, 'text-left text-sm font-normal')}
                  defaultValue={itemText(item)}
                  onBlur={(e) => e.target.value !== item.rawText && replaceItem(wi, si, ii, e.target.value)}
                />
              </li>
            ))}
          </ul>
        </Block>
      )}

      {newExercises.length > 0 && (
        <Block className="p-4">
          <h2 className="text-[15px] font-semibold">
            {newExercises.length === 1 ? '1 ny övning' : `${newExercises.length} nya övningar`}
          </h2>
          <p className="mt-1 text-sm text-muted">Namnen finns inte i övningskatalogen och läggs till som dina egna övningar. Stavas de annorlunda än du menade, rätta dem i filen.</p>
          <p className="mt-2 text-sm">{newExercises.join(', ')}</p>
        </Block>
      )}

      <Block>
        <h2 className="px-4 pt-3 text-[15px] font-semibold">Veckor</h2>
        <ul className="px-4 pb-2">
          {program.weeks.map((w) => {
            const km = w.sessions.flatMap((s) => s.items).reduce((sum, i) => sum + (i.kind === 'distance' ? (i.distanceKm ?? 0) : 0), 0);
            const open = openWeek === w.weekNo;
            return (
              <li key={w.weekNo} className="border-b border-line last:border-b-0">
                <button type="button" aria-expanded={open} onClick={() => setOpenWeek(open ? null : w.weekNo)} className="flex min-h-12 w-full items-center gap-3 text-left">
                  <span className="w-16 text-sm font-semibold">V {w.weekNo}</span>
                  <span className="text-sm text-muted">{formatDate(w.startDate)}</span>
                  <span className="truncate text-sm text-muted">{w.phase}</span>
                  <span className="ml-auto text-sm font-semibold">{formatKm(km)} km</span>
                  <ChevronDown size={16} className={cn('text-muted', open && 'rotate-180')} aria-hidden />
                </button>
                {open && (
                  <ul className="pb-3 text-sm">
                    {w.focusText && <li className="pb-2 text-muted">{w.focusText}</li>}
                    {w.sessions.map((s, i) => (
                      <li key={i} className="py-1">
                        <b className="font-medium">{formatDate(s.date, 'EEE d/M')}</b>{' '}
                        {s.type === 'run' ? 'Löpning' : (s.title ?? (s.type === 'strength' ? 'Styrka' : 'Pass'))}:{' '}
                        <span className="text-muted">{s.items.map(itemText).join(' · ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Block>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="sticky bottom-20 flex gap-2 bg-bg/95 py-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || program.weeks.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onImport(program, profileName.trim() || undefined);
            } catch (e) {
              setError(e instanceof Error ? `Importen misslyckades: ${e.message}` : 'Importen misslyckades. Försök igen.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Importerar…' : `Importera ${program.weeks.length} veckor`}
        </Button>
        <Button onClick={onBack}>Tillbaka</Button>
      </div>
    </div>
  );
}
