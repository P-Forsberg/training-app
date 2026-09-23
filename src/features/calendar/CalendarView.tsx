import { addMonths, eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useEffect, useMemo } from 'react';
import { href } from '@/app/router';
import { useOverview } from '@/data/repository';
import { dayIndex, parseIsoDate, todayIso, toIsoDate } from '@/domain/dates';
import { plannedSessionStatus, type DisplayStatus } from '@/domain/sessionStatus';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/components';
import { WEEKDAYS_SHORT } from '@/ui/format';
import { PageHeader } from '@/ui/PageHeader';

const PHASE_VARS = 6;

interface DayInfo {
  run?: DisplayStatus;
  strength?: DisplayStatus;
  phase?: string;
}

function worst(a: DisplayStatus | undefined, b: DisplayStatus): DisplayStatus {
  const rank: DisplayStatus[] = ['done', 'partial', 'moved', 'skipped', 'planned', 'missed'];
  return !a || rank.indexOf(b) > rank.indexOf(a) ? b : a;
}

function dotClass(status: DisplayStatus | undefined): string {
  switch (status) {
    case 'done':
      return 'bg-accent border-accent';
    case 'partial':
      return 'border-accent bg-[linear-gradient(90deg,var(--accent)_50%,transparent_50%)]';
    case 'skipped':
      return 'bg-muted border-muted';
    case 'missed':
      return 'border-danger';
    case 'moved':
      return 'border-dashed border-accent';
    default:
      return 'border-muted';
  }
}

/** Month by month over the whole program: dots for run (round) and strength (square), tint per phase. */
export function CalendarView() {
  const o = useOverview();
  const today = todayIso();

  const { months, days, phaseIndex } = useMemo(() => {
    const days = new Map<string, DayInfo>();
    const phaseIndex = new Map<string, number>();
    if (!o?.program) return { months: [] as Date[], days, phaseIndex };

    const weekByDate = new Map<string, string>();
    for (const w of o.weeks) {
      if (w.phase && !phaseIndex.has(w.phase)) phaseIndex.set(w.phase, phaseIndex.size % PHASE_VARS);
      for (let i = 0; i < 7; i++) {
        const d = parseIsoDate(w.start_date)!;
        d.setDate(d.getDate() + i);
        if (w.phase) weekByDate.set(toIsoDate(d), w.phase);
      }
    }
    const loggedByPlanned = new Map(o.logged.filter((l) => l.planned_session_id).map((l) => [l.planned_session_id!, l]));
    for (const s of o.sessions) {
      if (s.type === 'rest') continue;
      const info = days.get(s.date) ?? {};
      const status = plannedSessionStatus(s, loggedByPlanned.get(s.id), today);
      if (s.type === 'run') info.run = worst(info.run, status);
      else info.strength = worst(info.strength, status);
      days.set(s.date, info);
    }
    for (const l of o.logged) {
      if (l.planned_session_id && o.sessions.some((s) => s.id === l.planned_session_id && s.date === l.date)) continue;
      const info = days.get(l.date) ?? {};
      if (l.type === 'run') info.run = worst(info.run, l.status === 'moved' ? 'planned' : l.status);
      else info.strength = worst(info.strength, l.status === 'moved' ? 'planned' : l.status);
      days.set(l.date, info);
    }
    for (const [date, phase] of weekByDate) days.set(date, { ...(days.get(date) ?? {}), phase });

    const dates = [...days.keys()].sort();
    const first = startOfMonth(parseIsoDate(dates[0] ?? today)!);
    const last = startOfMonth(parseIsoDate(dates[dates.length - 1] ?? today)!);
    const months: Date[] = [];
    for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
    return { months, days, phaseIndex };
  }, [o, today]);

  useEffect(() => {
    document.getElementById(`month-${today.slice(0, 7)}`)?.scrollIntoView({ block: 'start' });
  }, [months.length, today]);

  if (!o) return null;
  if (!o.program) {
    return (
      <>
        <PageHeader title="Kalender" />
        <EmptyState title="Inget program än">Importera ett program för att se det i kalendern.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Kalender" subtitle={o.program.name} />
      {phaseIndex.size > 0 && (
        <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Faser">
          {[...phaseIndex].map(([phase, i]) => (
            <li key={phase} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: `var(--phase-${i + 1})` }} aria-hidden />
              {phase}
            </li>
          ))}
        </ul>
      )}
      <p className="mb-2 text-xs text-muted">Rund prick = löppass, fyrkant = styrkepass. Fylld = klart, röd ring = missat.</p>
      {months.map((m) => {
        const key = format(m, 'yyyy-MM');
        const monthDays = eachDayOfInterval({ start: m, end: endOfMonth(m) }).map(toIsoDate);
        const offset = dayIndex(monthDays[0]!);
        return (
          <section key={key} id={`month-${key}`} className="scroll-mt-20">
            <h2 className="mb-2 mt-4 text-sm font-semibold capitalize text-muted">{format(m, 'LLLL yyyy', { locale: sv })}</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS_SHORT.map((d) => (
                <div key={d} className="pb-1 text-center text-[11px] text-muted" aria-hidden>
                  {d}
                </div>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {monthDays.map((date) => {
                const info = days.get(date);
                const phase = info?.phase ? phaseIndex.get(info.phase) : undefined;
                const label = [
                  format(parseIsoDate(date)!, 'EEEE d MMMM', { locale: sv }),
                  info?.run && `löppass ${info.run}`,
                  info?.strength && `styrkepass ${info.strength}`,
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <a
                    key={date}
                    href={href({ name: 'day', date })}
                    aria-label={label}
                    className={cn(
                      'relative flex aspect-square min-h-11 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-surface text-[12.5px]',
                      date === today ? 'border-accent' : 'border-line',
                      !info && 'text-muted',
                    )}
                  >
                    {phase != null && <span className="absolute inset-x-0 top-0 h-1" style={{ background: `var(--phase-${phase + 1})` }} aria-hidden />}
                    {Number(date.slice(8))}
                    <span className="flex h-2 gap-1" aria-hidden>
                      {info?.run && <span className={cn('size-2 rounded-full border', dotClass(info.run))} />}
                      {info?.strength && <span className={cn('size-2 rounded-[2px] border', dotClass(info.strength))} />}
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
