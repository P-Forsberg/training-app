import { useState } from 'react';
import { createShoe, type RunPatch } from '@/data/commands/logging';
import type { LoggedRunRow, LoggedSessionRow } from '@/data/rows';
import { useShoes } from '@/data/repository';
import { DEFAULT_RETIRE_KM, isSurfaceMismatch, type RunSurface, type ShoeSurface } from '@/domain/shoeMileage';
import { Button, CommitInput, Field, inputClass, Segmented, Select } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatDuration, formatKm, formatNumber, pace, parseDecimal, parseDuration } from '@/ui/format';
import { SURFACES } from './labels';

const FEEL = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

/**
 * Run logging fields. The distance field starts at the planned value and saves
 * on change; there is no save button.
 */
export function RunForm({
  idPrefix,
  plannedKm,
  run,
  logged,
  saveRun,
  saveSession,
}: {
  idPrefix: string;
  plannedKm?: number;
  run?: LoggedRunRow;
  logged?: LoggedSessionRow;
  saveRun: (patch: RunPatch) => Promise<void>;
  saveSession: (patch: { feel?: number | null; comment?: string | null }) => Promise<void>;
}) {
  const shoes = useShoes();
  const [addingShoe, setAddingShoe] = useState(false);
  const shoe = shoes?.find((s) => s.shoe.id === run?.shoe_id)?.shoe;
  const distance = run?.distance_km ?? plannedKm ?? null;

  return (
    <div className="px-4 pb-2">
      <Field label="Distans (km)" htmlFor={`${idPrefix}-km`} hint={plannedKm != null ? `plan ${formatKm(plannedKm)}` : undefined}>
        <CommitInput
          id={`${idPrefix}-km`}
          inputMode="decimal"
          className="w-24"
          value={formatNumber(distance)}
          errorText="Skriv distansen som en siffra, till exempel 12,5."
          onCommit={async (t) => {
            const v = parseDecimal(t);
            if (v === undefined || (v != null && v < 0)) return false;
            await saveRun({ distance_km: v });
          }}
        />
      </Field>
      <Field label="Tid" htmlFor={`${idPrefix}-time`} hint={pace(run?.distance_km, run?.duration_sec) || undefined}>
        <CommitInput
          id={`${idPrefix}-time`}
          inputMode="numeric"
          placeholder="min"
          title="Minuter (45) eller t:mm:ss"
          className="w-28"
          value={formatDuration(run?.duration_sec)}
          errorText="Skriv tiden i minuter (45) eller som 1:05:30."
          onCommit={async (t) => {
            const v = parseDuration(t);
            if (v === undefined) return false;
            await saveRun({ duration_sec: v });
          }}
        />
      </Field>
      <Field label="Underlag" htmlFor={`${idPrefix}-surface`}>
        <Select
          id={`${idPrefix}-surface`}
          className="w-36"
          value={run?.surface ?? ''}
          onChange={(e) => void saveRun({ surface: (e.target.value || null) as RunSurface | null })}
        >
          <option value="">Välj</option>
          {SURFACES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Skor" htmlFor={`${idPrefix}-shoe`}>
        <Select
          id={`${idPrefix}-shoe`}
          className="w-44"
          value={run?.shoe_id ?? ''}
          onChange={(e) => {
            if (e.target.value === '__new') setAddingShoe(true);
            else void saveRun({ shoe_id: e.target.value || null });
          }}
        >
          <option value="">Inga valda</option>
          {shoes
            ?.filter((s) => !s.shoe.retired_on || s.shoe.id === run?.shoe_id)
            .map((s) => (
              <option key={s.shoe.id} value={s.shoe.id}>
                {s.shoe.name} · {formatKm(s.km)} km
              </option>
            ))}
          <option value="__new">+ Lägg till skor</option>
        </Select>
      </Field>
      {shoe && isSurfaceMismatch({ surfaceType: shoe.surface_type }, run?.surface, run?.distance_km) && (
        <p className="py-1 text-xs text-warn">{shoe.name} är märkta som vägskor. Långa pass på teknisk stig sliter extra på dem.</p>
      )}
      {addingShoe && (
        <NewShoeForm
          onDone={async (id) => {
            setAddingShoe(false);
            if (id) await saveRun({ shoe_id: id });
          }}
        />
      )}
      <Field label="Känsla">
        <Segmented label="Känsla 1 till 5" options={FEEL} value={logged?.feel ?? null} onChange={(v) => void saveSession({ feel: v })} />
      </Field>
      <Field label="Natt">
        <Segmented
          label="Natt"
          options={[
            { value: 'yes', label: 'Ja' },
            { value: 'no', label: 'Nej' },
          ]}
          value={run ? (run.is_night ? 'yes' : 'no') : null}
          onChange={(v) => void saveRun({ is_night: v === 'yes' })}
        />
      </Field>
      <CommentField idPrefix={idPrefix} value={logged?.comment ?? ''} onCommit={(comment) => saveSession({ comment })} />
    </div>
  );
}

export function CommentField({ idPrefix, value, onCommit }: { idPrefix: string; value: string; onCommit: (v: string | null) => Promise<void> }) {
  const [text, setText] = useState(value);
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <label htmlFor={`${idPrefix}-comment`} className="text-sm text-muted">
        Anteckning
      </label>
      <textarea
        id={`${idPrefix}-comment`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) void onCommit(text.trim() || null);
        }}
        className={cn(inputClass, 'min-h-16 py-2 text-left text-sm font-normal')}
      />
    </div>
  );
}

function NewShoeForm({ onDone }: { onDone: (id?: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [surface, setSurface] = useState<ShoeSurface>('road');
  const [startKm, setStartKm] = useState('0');
  const [retireKm, setRetireKm] = useState(String(DEFAULT_RETIRE_KM.road));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="my-2 flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const start = parseDecimal(startKm);
        const retire = parseDecimal(retireKm);
        if (!name.trim()) return setError('Skriv vad skorna heter.');
        if (start == null || retire == null) return setError('Skriv km som siffror.');
        const id = await createShoe({ name, surface_type: surface, start_km: start, retire_km: retire });
        await onDone(id);
      }}
    >
      <label className="text-sm text-muted" htmlFor="new-shoe-name">
        Namn
      </label>
      <input id="new-shoe-name" className={cn(inputClass, 'text-left')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Till exempel Speedgoat 6" />
      <Segmented
        label="Typ av sko"
        options={[
          { value: 'road', label: 'Väg' },
          { value: 'trail', label: 'Trail' },
          { value: 'mixed', label: 'Blandat' },
        ]}
        value={surface}
        onChange={(v) => {
          const next = (v ?? 'road') as ShoeSurface;
          setSurface(next);
          setRetireKm(String(DEFAULT_RETIRE_KM[next]));
        }}
      />
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Redan gångna km
          <input className={inputClass} inputMode="decimal" value={startKm} onChange={(e) => setStartKm(e.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Byt vid km
          <input className={inputClass} inputMode="decimal" value={retireKm} onChange={(e) => setRetireKm(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1">
          Lägg till skor
        </Button>
        <Button onClick={() => void onDone()}>Avbryt</Button>
      </div>
    </form>
  );
}
