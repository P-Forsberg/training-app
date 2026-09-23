import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { href, navigate } from '@/app/router';
import {
  deleteLoggedSession,
  logFreeRun,
  logPlannedRun,
  setPlannedStatus,
  updateLoggedRun,
  updateLoggedSession,
  updatePlannedSessionLog,
} from '@/data/commands/logging';
import { useWeek, type ExtraLogView, type PlannedSessionView } from '@/data/repository';
import { addDaysIso, weekStartIso } from '@/domain/dates';
import type { DisplayStatus } from '@/domain/sessionStatus';
import { Block, BlockHeader, Button, Note, Rule, StatusDot } from '@/ui/components';
import { STATUS_LABEL } from '@/ui/status';
import { formatDate, formatDayTitle, formatKm } from '@/ui/format';
import { PageHeader } from '@/ui/PageHeader';
import { useLongPress, useSwipe } from '@/ui/useSwipe';
import { CommentField, RunForm } from './RunForm';
import { SessionMenu, StatusButtons } from './SessionActions';
import { itemLabel } from './labels';
import { StrengthForm } from './StrengthForm';

export function DayView({ date }: { date: string }) {
  const week = useWeek(weekStartIso(date));
  const go = (days: number) => navigate({ name: 'day', date: addDaysIso(date, days) }, true);
  const swipe = useSwipe(() => go(1), () => go(-1));
  if (!week) return null;

  const day = week.days.find((d) => d.date === date)!;
  const subtitle = [week.week ? `Vecka ${week.week.week_no}` : null, week.week?.phase].filter(Boolean).join(' · ');
  const note = day.note;
  const hasPlan = day.sessions.some((s) => s.session.type !== 'rest');

  return (
    <div {...swipe}>
      <PageHeader
        title={formatDayTitle(date)}
        subtitle={subtitle || undefined}
        actions={
          <>
            <Button size="icon" aria-label="Föregående dag" onClick={() => go(-1)}>
              <ChevronLeft size={18} />
            </Button>
            <Button size="icon" aria-label="Nästa dag" onClick={() => go(1)}>
              <ChevronRight size={18} />
            </Button>
          </>
        }
      />
      <a href={href({ name: 'week', date })} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg">
        ← Tillbaka till veckan
      </a>

      <div className="flex flex-col gap-3">
        {note ? (
          <Note title="Dagens instruktion">{note}</Note>
        ) : (
          week.week?.focus_text && <Note title="Veckans fokus">{week.week.focus_text}</Note>
        )}

        {!hasPlan && !day.extras.length && (
          <Block>
            <BlockHeader title="Vilodag" meta={day.flags.isRestAfterBackToBack ? 'Vila efter back-to-back' : 'Ingen träning planerad'} />
          </Block>
        )}

        {day.sessions
          .filter((s) => s.session.type !== 'rest')
          .map((s) => (
            <PlannedBlock key={s.session.id} view={s} />
          ))}

        {day.extras.map((e) => (
          <ExtraBlock key={e.logged.id} view={e} />
        ))}

        <Button
          variant="ghost"
          className="self-start text-accent"
          onClick={async () => {
            await logFreeRun(date, {}, 'Eget löppass');
          }}
        >
          + Logga ett löppass som inte är planerat
        </Button>
      </div>
    </div>
  );
}

function plannedKmOf(view: { items: { kind: string; distance_km: number | null }[] }): number | undefined {
  const km = view.items.filter((i) => i.kind === 'distance').reduce((s, i) => s + (i.distance_km ?? 0), 0);
  return km > 0 ? km : undefined;
}

function summary(view: PlannedSessionView): string {
  const { session, run, status } = view;
  const statusText = STATUS_LABEL[status].toLowerCase();
  if (session.type === 'run') {
    const km = run?.distance_km ?? plannedKmOf(view);
    return `Löppass${km != null ? ` ${formatKm(km)} km` : ''} · ${statusText}`;
  }
  return `${session.title ?? 'Styrka'} · ${statusText}`;
}

function PlannedBlock({ view }: { view: PlannedSessionView }) {
  const { session, logged, status } = view;
  const [collapsed, setCollapsed] = useState(status === 'done' || status === 'skipped');
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const plannedKm = plannedKmOf(view);
  const isRun = session.type === 'run';
  const title = isRun ? 'Löppass' : (session.title ?? (session.type === 'strength' ? 'Styrka' : 'Pass'));

  const setStatus = async (next: 'done' | 'partial' | 'skipped' | null) => {
    // "Klart" on a run without a logged distance records the planned distance.
    if (next === 'done' && isRun && view.run?.distance_km == null && plannedKm != null) {
      await logPlannedRun(session.id, { distance_km: plannedKm });
    }
    await setPlannedStatus(session.id, next);
    if (next === 'done' || next === 'skipped') setCollapsed(true);
  };

  if (status === 'moved' && logged) {
    return (
      <Block className="opacity-70">
        <BlockHeader title={title} meta={`Flyttat till ${formatDate(logged.date, 'EEEE d MMM')}`}>
          <StatusDot status="moved" />
        </BlockHeader>
        <div className="flex gap-2 px-4 pb-3">
          <a className="text-sm text-accent" href={href({ name: 'day', date: logged.date })}>
            Gå till {formatDate(logged.date, 'EEEE')}
          </a>
          <SessionMenu plannedSessionId={session.id} plannedDate={session.date} open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </Block>
    );
  }

  return (
    <Block>
      <div {...longPress} className="flex min-h-12 items-center gap-2 pl-4 pr-1">
        <button
          type="button"
          className="flex min-h-12 flex-1 items-center gap-3 text-left"
          aria-expanded={!collapsed}
          onClick={() => !longPress.wasLongPress() && setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <span className="text-[15px] font-semibold">{summary(view)}</span>
          ) : (
            <>
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <span className="ml-auto text-sm text-muted">
                {isRun ? (plannedKm != null ? `${formatKm(plannedKm)} km planerat` : '') : `${view.items.length} övningar`}
              </span>
            </>
          )}
          <StatusDot status={status} />
        </button>
        <SessionMenu plannedSessionId={session.id} plannedDate={session.date} open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
      {!collapsed && (
        <>
          <Rule />
          {isRun ? (
            <RunForm
              idPrefix={session.id}
              plannedKm={plannedKm}
              run={view.run}
              logged={logged}
              saveRun={(patch) => logPlannedRun(session.id, patch)}
              saveSession={(patch) => updatePlannedSessionLog(session.id, patch)}
            />
          ) : (
            <>
              {session.type === 'other' && view.items.length === 0 && session.notes && <p className="px-4 py-2 text-sm">{session.notes}</p>}
              <StrengthForm plannedSessionId={session.id} items={view.items} sets={view.sets} date={session.date} />
              {logged && (
                <div className="px-4">
                  <CommentField idPrefix={session.id} value={logged.comment ?? ''} onCommit={(comment) => updateLoggedSession(logged.id, { comment })} />
                </div>
              )}
            </>
          )}
          <StatusButtons status={status} onSet={setStatus} />
        </>
      )}
    </Block>
  );
}

function ExtraBlock({ view }: { view: ExtraLogView }) {
  const { logged, planned, run } = view;
  const status = logged.status as DisplayStatus;
  const movedFrom = logged.moved_from;
  const title = planned ? (planned.type === 'run' ? 'Löppass' : (planned.title ?? 'Styrka')) : (logged.title ?? 'Pass');
  const isRun = (planned?.type ?? logged.type) === 'run';
  const plannedKm = planned ? plannedKmOf(view) : undefined;

  const setStatus = async (next: 'done' | 'partial' | 'skipped' | null) => {
    if (planned) {
      if (next === 'done' && isRun && run?.distance_km == null && plannedKm != null) await logPlannedRun(planned.id, { distance_km: plannedKm });
      // A moved session keeps moved_from; its status now says how it went.
      await updateLoggedSession(logged.id, { status: next ?? 'moved' });
    } else if (next === null) {
      await deleteLoggedSession(logged.id);
    } else {
      await updateLoggedSession(logged.id, { status: next });
    }
  };

  return (
    <Block>
      <BlockHeader title={title} meta={movedFrom ? `Flyttat från ${formatDate(movedFrom, 'EEEE d MMM')}` : planned ? undefined : 'Eget pass'}>
        <StatusDot status={status === 'moved' ? 'planned' : status} />
      </BlockHeader>
      <Rule />
      {isRun ? (
        <RunForm
          idPrefix={logged.id}
          plannedKm={plannedKm}
          run={run}
          logged={logged}
          saveRun={(patch) => (planned ? logPlannedRun(planned.id, patch) : updateLoggedRun(logged.id, patch))}
          saveSession={(patch) => updateLoggedSession(logged.id, patch)}
        />
      ) : planned ? (
        <StrengthForm plannedSessionId={planned.id} items={view.items} sets={view.sets} date={logged.date} />
      ) : (
        <ul className="px-4 py-2 text-sm text-muted">
          {view.items.map((i) => (
            <li key={i.id}>{itemLabel(i).name}</li>
          ))}
        </ul>
      )}
      <StatusButtons status={status === 'moved' ? 'planned' : status} onSet={setStatus} />
    </Block>
  );
}
