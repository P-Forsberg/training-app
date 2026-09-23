import { useState } from 'react';
import { createShoe, updateShoe } from '@/data/commands/logging';
import { useShoes, type ShoeView } from '@/data/repository';
import { DEFAULT_RETIRE_KM, SHOE_WARN_RATIO, shoeProgress, type ShoeSurface } from '@/domain/shoeMileage';
import { todayIso } from '@/domain/dates';
import { Block, Button, CommitInput, EmptyState, Field, inputClass, ProgressBar, Segmented } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatKm, formatNumber, parseDecimal } from '@/ui/format';
import { PageHeader } from '@/ui/PageHeader';

const SURFACE_LABEL: Record<ShoeSurface, string> = { road: 'Väg', trail: 'Trail', mixed: 'Blandat' };

function statusText(s: ShoeView): string {
  if (s.shoe.retired_on) return 'Pensionerade';
  if (s.status === 'replace') return 'Dags att byta';
  if (s.status === 'soon') return 'Byt snart';
  return '';
}

export function ShoesView() {
  const shoes = useShoes();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!shoes) return null;

  return (
    <>
      <PageHeader title="Skor" subtitle={`Varning vid ${Math.round(SHOE_WARN_RATIO * 100)} procent av bytesgränsen`} />
      {!shoes.length && !adding && (
        <EmptyState title="Inga skor än" action={<Button variant="primary" onClick={() => setAdding(true)}>Lägg till skor</Button>}>
          Lägg till ett par här eller direkt i ett löppass. Varje loggat pass räknas upp automatiskt.
        </EmptyState>
      )}
      <div className="flex flex-col gap-2">
        {shoes.map((s) => (
          <Block key={s.shoe.id} className={cn(s.shoe.retired_on && 'opacity-60')}>
            <button
              type="button"
              aria-expanded={openId === s.shoe.id}
              onClick={() => setOpenId(openId === s.shoe.id ? null : s.shoe.id)}
              className="flex w-full flex-col gap-2 p-4 text-left"
            >
              <span className="flex w-full items-baseline gap-2">
                <span className="text-[15px] font-semibold">{s.shoe.name}</span>
                <span className="text-xs text-muted">{SURFACE_LABEL[s.shoe.surface_type]}</span>
                <span className="ml-auto text-sm">
                  <b className="text-lg">{formatKm(s.km)}</b> <span className="text-muted">/ {formatKm(s.shoe.retire_km)} km</span>
                </span>
              </span>
              <ProgressBar value={shoeProgress(s.km, s.shoe.retire_km)} label={`${s.shoe.name}, andel av bytesgränsen`} />
              {statusText(s) && <span className={cn('text-xs', s.status === 'replace' ? 'text-danger' : 'text-warn')}>{statusText(s)}</span>}
            </button>
            {openId === s.shoe.id && (
              <div className="border-t border-line px-4 py-2">
                <Field label="Namn" htmlFor={`shoe-name-${s.shoe.id}`}>
                  <CommitInput id={`shoe-name-${s.shoe.id}`} className="w-44 text-left font-normal" value={s.shoe.name} onCommit={(t) => (t.trim() ? updateShoe(s.shoe.id, { name: t.trim() }) : false)} />
                </Field>
                <Field label="Km innan appen" htmlFor={`shoe-start-${s.shoe.id}`}>
                  <CommitInput
                    id={`shoe-start-${s.shoe.id}`}
                    inputMode="decimal"
                    className="w-24"
                    value={formatNumber(s.shoe.start_km)}
                    onCommit={(t) => {
                      const v = parseDecimal(t);
                      return v == null || v < 0 ? false : updateShoe(s.shoe.id, { start_km: v });
                    }}
                  />
                </Field>
                <Field label="Byt vid km" htmlFor={`shoe-retire-${s.shoe.id}`}>
                  <CommitInput
                    id={`shoe-retire-${s.shoe.id}`}
                    inputMode="decimal"
                    className="w-24"
                    value={formatNumber(s.shoe.retire_km)}
                    onCommit={(t) => {
                      const v = parseDecimal(t);
                      return v == null || v < 0 ? false : updateShoe(s.shoe.id, { retire_km: v });
                    }}
                  />
                </Field>
                <div className="py-2">
                  <Button size="sm" onClick={() => void updateShoe(s.shoe.id, { retired_on: s.shoe.retired_on ? null : todayIso() })}>
                    {s.shoe.retired_on ? 'Ta tillbaka i bruk' : 'Pensionera'}
                  </Button>
                </div>
              </div>
            )}
          </Block>
        ))}
      </div>
      {adding ? <AddShoe onDone={() => setAdding(false)} /> : shoes.length > 0 && (
        <Button className="mt-3" onClick={() => setAdding(true)}>
          Lägg till skor
        </Button>
      )}
    </>
  );
}

function AddShoe({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [surface, setSurface] = useState<ShoeSurface>('road');
  const [start, setStart] = useState('0');
  const [retire, setRetire] = useState(String(DEFAULT_RETIRE_KM.road));
  const [error, setError] = useState<string | null>(null);
  return (
    <Block className="mt-3 p-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const s = parseDecimal(start);
          const r = parseDecimal(retire);
          if (!name.trim()) return setError('Skriv vad skorna heter.');
          if (s == null || r == null) return setError('Skriv km som siffror.');
          await createShoe({ name, surface_type: surface, start_km: s, retire_km: r });
          onDone();
        }}
      >
        <label htmlFor="add-shoe-name" className="text-sm text-muted">
          Namn
        </label>
        <input id="add-shoe-name" className={cn(inputClass, 'text-left font-normal')} value={name} onChange={(e) => setName(e.target.value)} />
        <Segmented
          label="Typ av sko"
          options={(Object.keys(SURFACE_LABEL) as ShoeSurface[]).map((v) => ({ value: v, label: SURFACE_LABEL[v] }))}
          value={surface}
          onChange={(v) => {
            const next = (v ?? 'road') as ShoeSurface;
            setSurface(next);
            setRetire(String(DEFAULT_RETIRE_KM[next]));
          }}
        />
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Redan gångna km
            <input className={inputClass} inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Byt vid km
            <input className={inputClass} inputMode="decimal" value={retire} onChange={(e) => setRetire(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="flex-1">
            Lägg till skor
          </Button>
          <Button onClick={onDone}>Avbryt</Button>
        </div>
      </form>
    </Block>
  );
}
