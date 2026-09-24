import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { duplicatePlannedSession, movePlannedSession, setPlannedStatus } from '@/data/commands/logging';
import { setRunIntent } from '@/data/commands/program';
import { isIsoDate } from '@/domain/dates';
import { INTENT_LABEL, type RunIntent } from '@/domain/sessionIntent';
import type { DisplayStatus } from '@/domain/sessionStatus';
import { Button, inputClass, Sheet } from '@/ui/components';
import { cn } from '@/ui/cn';

type Settable = 'done' | 'partial' | 'skipped';

const ACTIONS: { status: Settable; label: string }[] = [
  { status: 'done', label: 'Klart' },
  { status: 'partial', label: 'Delvis' },
  { status: 'skipped', label: 'Hoppade' },
];

/** Klart / Delvis / Hoppade. Pressing the active status again clears it. */
export function StatusButtons({
  status,
  onSet,
}: {
  status: DisplayStatus;
  onSet: (status: Settable | null) => Promise<void>;
}) {
  return (
    <div className="flex gap-2 px-4 pb-4 pt-2">
      {ACTIONS.map((a) => {
        const active = status === a.status;
        return (
          <Button
            key={a.status}
            variant={a.status === 'done' && !active ? 'primary' : 'outline'}
            pressed={active}
            className={cn('flex-1', a.status === 'done' && active && 'bg-accent text-accent-fg')}
            onClick={async () => {
              await onSet(active ? null : a.status);
              if (!active && a.status === 'done') navigator.vibrate?.(12);
            }}
          >
            {a.label}
          </Button>
        );
      })}
    </div>
  );
}

/** "⋯" menu, also opened by long press on the block header: move, duplicate, skip. */
export function SessionMenu({
  plannedSessionId,
  plannedDate,
  open,
  onOpenChange,
  runIntent,
}: {
  plannedSessionId: string;
  plannedDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For runs: the type the user has set (null = none set). Undefined for other sessions. */
  runIntent?: RunIntent | null;
}) {
  const [mode, setMode] = useState<'menu' | 'move' | 'duplicate' | 'intent'>('menu');
  const [date, setDate] = useState(plannedDate);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    onOpenChange(false);
    setMode('menu');
    setError(null);
  };

  const submit = async () => {
    if (!isIsoDate(date)) {
      setError('Välj ett datum.');
      return;
    }
    if (mode === 'move') await movePlannedSession(plannedSessionId, date);
    else await duplicatePlannedSession(plannedSessionId, date);
    close();
  };

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Fler val för passet" onClick={() => onOpenChange(true)}>
        <MoreHorizontal size={18} />
      </Button>
      <Sheet
        open={open}
        onClose={close}
        title={mode === 'move' ? 'Flytta passet' : mode === 'duplicate' ? 'Duplicera passet' : mode === 'intent' ? 'Passtyp' : 'Passet'}
      >
        {mode === 'intent' ? (
          <div className="flex flex-col gap-2 px-4 pb-5">
            <p className="text-sm text-muted">Visas i veckan och på dagen. Ändringen gäller planen och går att ångra under Mer.</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(INTENT_LABEL) as RunIntent[]).map((k) => (
                <Button
                  key={k}
                  pressed={runIntent === k}
                  onClick={async () => {
                    try {
                      await setRunIntent(plannedSessionId, k);
                      close();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Det gick inte att ändra passtypen.');
                    }
                  }}
                >
                  {INTENT_LABEL[k]}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                await setRunIntent(plannedSessionId, null);
                close();
              }}
            >
              Läs från programmets text
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        ) : mode === 'menu' ? (
          <div className="flex flex-col gap-2 px-4 pb-5">
            {runIntent !== undefined && <Button onClick={() => setMode('intent')}>Ändra passtyp</Button>}
            <Button onClick={() => setMode('move')}>Flytta till annan dag</Button>
            <Button onClick={() => setMode('duplicate')}>Duplicera till annan dag</Button>
            <Button
              onClick={async () => {
                await setPlannedStatus(plannedSessionId, 'skipped');
                close();
              }}
            >
              Hoppa över
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3 px-4 pb-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="text-sm text-muted" htmlFor="session-date">
              {mode === 'move' ? 'Nytt datum. Det planerade datumet står kvar i planen.' : 'Datum för kopian.'}
            </label>
            <input id="session-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, 'text-left')} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" variant="primary">
              {mode === 'move' ? 'Flytta' : 'Duplicera'}
            </Button>
            {mode === 'move' && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await movePlannedSession(plannedSessionId, plannedDate);
                  close();
                }}
              >
                Flytta tillbaka till planerat datum
              </Button>
            )}
          </form>
        )}
      </Sheet>
    </>
  );
}
