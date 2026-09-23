import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/local/db';
import { GenericMapping, ADAPTER_ID } from '@/import/adapters/xlsxGeneric';
import { cellText, col, type SheetData } from '@/import/cells';
import { Block, Button, Field, Segmented, Select } from '@/ui/components';
import { WEEKDAYS_SHORT } from '@/ui/format';

function columnLetters(rows: unknown[][]): string[] {
  const width = rows.slice(0, 20).reduce((m, r) => Math.max(m, r.length), 0);
  return Array.from({ length: Math.min(width, 52) }, (_, i) =>
    i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`,
  );
}

function ColumnSelect({
  id,
  value,
  letters,
  header,
  onChange,
  optional = true,
}: {
  id: string;
  value: string | null | undefined;
  letters: string[];
  header: unknown[];
  onChange: (v: string | undefined) => void;
  optional?: boolean;
}) {
  return (
    <Select id={id} className="w-40" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {optional && <option value="">Ingen</option>}
      {letters.map((l) => (
        <option key={l} value={l}>
          {l}
          {cellText(header[col(l)]) ? ` – ${cellText(header[col(l)]).slice(0, 18)}` : ''}
        </option>
      ))}
    </Select>
  );
}

/** Lets the user map columns for the generic spreadsheet adapter. */
export function MappingForm({
  data,
  initial,
  onDone,
  onCancel,
}: {
  data: SheetData;
  initial: GenericMapping;
  onDone: (m: GenericMapping) => void;
  onCancel: () => void;
}) {
  const [m, setM] = useState<GenericMapping>(initial);
  const [error, setError] = useState<string | null>(null);
  const profiles = useLiveQuery(async () => (await db.import_profiles.where('adapter').equals(ADAPTER_ID).toArray()).filter((p) => !p.deleted_at), []);
  const rows = data[m.sheet] ?? [];
  const header = rows[Math.max(0, m.firstDataRow - 2)] ?? [];
  const letters = columnLetters(rows);

  const set = (patch: Partial<GenericMapping>) => setM((prev) => ({ ...prev, ...patch }) as GenericMapping);

  const switchLayout = (layout: GenericMapping['layout']) => {
    if (layout === m.layout) return;
    const empty = [null, null, null, null, null, null, null];
    setM(
      layout === 'week-rows'
        ? { layout, sheet: m.sheet, firstDataRow: m.firstDataRow, weekStart: 'A', dayKm: [...empty], dayText: [...empty] }
        : { layout, sheet: m.sheet, firstDataRow: m.firstDataRow, date: 'A' },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {!!profiles?.length && (
        <Block className="p-4">
          <label className="text-sm text-muted" htmlFor="profile">
            Använd en sparad koppling
          </label>
          <Select
            id="profile"
            className="mt-1 w-full"
            defaultValue=""
            onChange={(e) => {
              const p = profiles.find((x) => x.id === e.target.value);
              const parsed = p ? GenericMapping.safeParse(p.mapping) : undefined;
              if (parsed?.success) setM(parsed.data);
            }}
          >
            <option value="">Välj</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Block>
      )}

      <Block className="px-4 py-2">
        <Field label="Flik" htmlFor="map-sheet">
          <Select id="map-sheet" className="w-40" value={m.sheet} onChange={(e) => set({ sheet: e.target.value })}>
            {Object.keys(data).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Första raden med data" htmlFor="map-first">
          <input
            id="map-first"
            type="number"
            min={1}
            className="min-h-11 w-20 rounded-lg border border-line bg-surface-2 px-3 text-right"
            value={m.firstDataRow}
            onChange={(e) => set({ firstDataRow: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <Field label="En rad är">
          <Segmented
            label="Layout"
            options={[
              { value: 'week-rows', label: 'En vecka' },
              { value: 'session-rows', label: 'Ett pass' },
            ]}
            value={m.layout}
            onChange={(v) => v && switchLayout(v as GenericMapping['layout'])}
          />
        </Field>
      </Block>

      <Block className="px-4 py-2">
        {m.layout === 'week-rows' ? (
          <>
            <Field label="Veckans måndag" htmlFor="map-start">
              <ColumnSelect id="map-start" optional={false} value={m.weekStart} letters={letters} header={header} onChange={(v) => set({ weekStart: v ?? 'A' })} />
            </Field>
            <Field label="Veckonummer" htmlFor="map-weekno">
              <ColumnSelect id="map-weekno" value={m.weekNo} letters={letters} header={header} onChange={(v) => set({ weekNo: v })} />
            </Field>
            <Field label="Fas" htmlFor="map-phase">
              <ColumnSelect id="map-phase" value={m.phase} letters={letters} header={header} onChange={(v) => set({ phase: v })} />
            </Field>
            <Field label="Fokus eller kommentar" htmlFor="map-focus">
              <ColumnSelect id="map-focus" value={m.focus} letters={letters} header={header} onChange={(v) => set({ focus: v })} />
            </Field>
            {WEEKDAYS_SHORT.map((d, i) => (
              <div key={d} className="border-b border-line py-1 last:border-b-0">
                <Field label={`${d}: km`} htmlFor={`map-km-${i}`}>
                  <ColumnSelect
                    id={`map-km-${i}`}
                    value={m.dayKm[i]}
                    letters={letters}
                    header={header}
                    onChange={(v) => set({ dayKm: m.dayKm.map((x, j) => (j === i ? (v ?? null) : x)) })}
                  />
                </Field>
                <Field label={`${d}: övningar`} htmlFor={`map-text-${i}`}>
                  <ColumnSelect
                    id={`map-text-${i}`}
                    value={m.dayText[i]}
                    letters={letters}
                    header={header}
                    onChange={(v) => set({ dayText: m.dayText.map((x, j) => (j === i ? (v ?? null) : x)) })}
                  />
                </Field>
              </div>
            ))}
          </>
        ) : (
          <>
            <Field label="Datum" htmlFor="map-date">
              <ColumnSelect id="map-date" optional={false} value={m.date} letters={letters} header={header} onChange={(v) => set({ date: v ?? 'A' })} />
            </Field>
            <Field label="Typ (löpning, styrka, vila)" htmlFor="map-type">
              <ColumnSelect id="map-type" value={m.type} letters={letters} header={header} onChange={(v) => set({ type: v })} />
            </Field>
            <Field label="Namn på passet" htmlFor="map-title">
              <ColumnSelect id="map-title" value={m.title} letters={letters} header={header} onChange={(v) => set({ title: v })} />
            </Field>
            <Field label="Distans (km)" htmlFor="map-km">
              <ColumnSelect id="map-km" value={m.distanceKm} letters={letters} header={header} onChange={(v) => set({ distanceKm: v })} />
            </Field>
            <Field label="Tid (min)" htmlFor="map-min">
              <ColumnSelect id="map-min" value={m.durationMin} letters={letters} header={header} onChange={(v) => set({ durationMin: v })} />
            </Field>
            <Field label="Övningar eller beskrivning" htmlFor="map-text">
              <ColumnSelect id="map-text" value={m.text} letters={letters} header={header} onChange={(v) => set({ text: v })} />
            </Field>
          </>
        )}
      </Block>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => {
            const parsed = GenericMapping.safeParse(m);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? 'Kopplingen är inte komplett.');
              return;
            }
            onDone(parsed.data);
          }}
        >
          Granska
        </Button>
        <Button onClick={onCancel}>Avbryt</Button>
      </div>
    </div>
  );
}
