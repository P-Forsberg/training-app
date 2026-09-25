import { Check, ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { editPlannedRunField, toggleInterval } from '@/data/commands/logging';
import type { LoggedRunRow } from '@/data/rows';
import type { RunPartField } from '@/domain/runParts';
import { mainSummary, type StructuredRun } from '@/domain/structuredRun';
import { Block, BlockHeader, CommitInput, Field, Rule, StatusDot } from '@/ui/components';
import { cn } from '@/ui/cn';
import { formatKm, formatNumber, parseDecimal } from '@/ui/format';
import type { StatusKind } from '@/ui/status';

type PartKey = 'warmup' | 'main' | 'cooldown';

/**
 * A quality session in three parts, built like the strength rows: warm-up,
 * main set (intervals ticked off one by one) and cool-down. Each part's
 * distance is stored separately; the run total follows their sum.
 */
export function StructuredRunBlock({
  plannedSessionId,
  structured,
  run,
}: {
  plannedSessionId: string;
  structured: StructuredRun;
  run?: LoggedRunRow;
}) {
  const [open, setOpen] = useState<Record<PartKey, boolean>>({ warmup: false, main: true, cooldown: false });
  const toggle = (k: PartKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const done = new Set(run?.intervals_done ?? []);
  const reps = structured.reps ?? 0;
  const doneCount = [...done].filter((n) => n <= reps).length;

  const partStatus = (km: number | null | undefined): StatusKind => (km != null ? 'done' : 'planned');
  const mainStatus: StatusKind = reps
    ? doneCount >= reps
      ? 'done'
      : doneCount > 0
        ? 'partial'
        : 'planned'
    : partStatus(run?.main_km);

  const distanceField = (field: RunPartField, value: number | null | undefined, id: string, label: string) => (
    <Field label={label} htmlFor={id}>
      <CommitInput
        id={id}
        inputMode="decimal"
        className="w-24"
        placeholder="km"
        value={formatNumber(value)}
        errorText="Skriv distansen som en siffra, till exempel 3,2."
        onCommit={async (t) => {
          const v = parseDecimal(t);
          if (v === undefined || (v != null && v < 0)) return false;
          await editPlannedRunField(plannedSessionId, field, v);
        }}
      />
    </Field>
  );

  return (
    <Block>
      <BlockHeader title={structured.type} meta={mainSummary(structured)} />
      <Rule />
      <ul className="px-4">
        <PartRow
          name="Uppvärmning"
          summary={`${formatKm(structured.warmupKm)} km lugnt`}
          status={partStatus(run?.warmup_km)}
          open={open.warmup}
          onToggle={() => toggle('warmup')}
        >
          {distanceField('warmup_km', run?.warmup_km, `${plannedSessionId}-warmup`, 'Faktisk distans (km)')}
        </PartRow>

        <PartRow name="Huvuddel" summary={mainSummary(structured)} status={mainStatus} open={open.main} onToggle={() => toggle('main')}>
          <p className="pb-2 text-sm">{structured.main}</p>
          {reps > 0 && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Intervaller">
                {Array.from({ length: reps }, (_, i) => i + 1).map((n) => {
                  const isDone = done.has(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={isDone}
                      aria-label={`Intervall ${n}${isDone ? ', klar' : ''}`}
                      onClick={() => {
                        void toggleInterval(plannedSessionId, n);
                        if (!isDone) navigator.vibrate?.(8);
                      }}
                      className={cn(
                        'grid size-11 place-items-center rounded-xl border text-sm font-semibold tabular-nums',
                        isDone ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted',
                      )}
                    >
                      {isDone ? <Check size={18} aria-hidden /> : n}
                    </button>
                  );
                })}
              </div>
              <p className="pt-2 text-sm text-muted" aria-live="polite">
                {doneCount} av {reps} klara
              </p>
            </>
          )}
          {distanceField('main_km', run?.main_km, `${plannedSessionId}-main`, 'Distans i huvuddelen (km)')}
        </PartRow>

        <PartRow
          name="Nedvarvning"
          summary={`${formatKm(structured.cooldownKm)} km lugnt`}
          status={partStatus(run?.cooldown_km)}
          open={open.cooldown}
          onToggle={() => toggle('cooldown')}
        >
          {distanceField('cooldown_km', run?.cooldown_km, `${plannedSessionId}-cooldown`, 'Faktisk distans (km)')}
        </PartRow>
      </ul>
    </Block>
  );
}

function PartRow({
  name,
  summary,
  status,
  open,
  onToggle,
  children,
}: {
  name: string;
  summary: string;
  status: StatusKind;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
        <StatusDot status={status} />
        <span className="text-[14.5px] font-medium">{name}</span>
        <span className="ml-auto whitespace-nowrap text-sm text-muted">{summary}</span>
        <ChevronDown size={16} className={cn('text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </li>
  );
}
