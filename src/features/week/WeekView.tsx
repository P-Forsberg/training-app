import { getISOWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { href, navigate } from '@/app/router';
import { useActiveProgram, useProgramWeeks, useShoes, useWeek, type DayView } from '@/data/repository';
import { addDaysIso, daysBetween, parseIsoDate, todayIso, weekStartIso } from '@/domain/dates';
import type { DisplayStatus } from '@/domain/sessionStatus';
import { cn } from '@/ui/cn';
import { Block, Button, Chip, EmptyState, Note, ProgressBar, StatusDot } from '@/ui/components';
import { formatDate, formatKm, WEEKDAYS_SHORT } from '@/ui/format';
import { PageHeader } from '@/ui/PageHeader';
import { useSwipe } from '@/ui/useSwipe';

/** Picks the week to show: the requested one, else today's week clamped to the program. */
function useDefaultMonday(date: string | undefined): string | undefined {
  const program = useActiveProgram();
  const weeks = useProgramWeeks(program?.id);
  return useMemo(() => {
    if (date) return weekStartIso(date);
    if (program === undefined || weeks === undefined) return undefined;
    const today = weekStartIso(todayIso());
    if (!program || !weeks.length) return today;
    const first = weeks[0]!.start_date;
    const last = weeks[weeks.length - 1]!.start_date;
    if (today < first) return first;
    if (today > last) return last;
    return today;
  }, [date, program, weeks]);
}

export function WeekView({ date }: { date?: string }) {
  const monday = useDefaultMonday(date);
  if (!monday) return null;
  return <Week monday={monday} />;
}

function aggregateStatus(day: DayView): DisplayStatus | null {
  const statuses = day.sessions.filter((s) => s.session.type !== 'rest').map((s) => s.status);
  if (!statuses.length) return day.extras.length ? 'done' : null;
  if (statuses.every((s) => s === 'done')) return 'done';
  if (statuses.every((s) => s === 'skipped')) return 'skipped';
  if (statuses.some((s) => s === 'done' || s === 'partial')) return 'partial';
  if (statuses.some((s) => s === 'moved')) return 'moved';
  if (statuses.some((s) => s === 'missed')) return 'missed';
  return 'planned';
}

function Week({ monday }: { monday: string }) {
  const view = useWeek(monday);
  const shoes = useShoes();
  const go = (days: number) => navigate({ name: 'week', date: addDaysIso(monday, days) }, true);
  const swipe = useSwipe(() => go(7), () => go(-7));

  if (!view) return null;
  const { program, week, flags } = view;

  if (!program) {
    return (
      <>
        <PageHeader title="Träning" />
        <EmptyState title="Inget program än" action={<a className="min-h-11 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-fg" href={href({ name: 'import' })}>Importera program</a>}>
          Importera en Excel-fil eller en bild av ditt program. Du kan också logga pass utan program.
        </EmptyState>
        <p className="mt-4 text-center">
          <a className="text-sm text-accent underline-offset-4 hover:underline" href={href({ name: 'day', date: todayIso() })}>
            Logga ett pass i dag
          </a>
        </p>
      </>
    );
  }

  const planned = flags.totals.plannedKm;
  const meta = (week?.meta ?? {}) as Record<string, unknown>;
  const weeksLeft =
    typeof meta.weeksLeft === 'number'
      ? meta.weeksLeft
      : program.race_date
        ? Math.max(0, Math.floor(daysBetween(monday, program.race_date) / 7))
        : undefined;
  const title = week ? `Vecka ${week.week_no}` : `Vecka ${getISOWeek(parseIsoDate(monday)!)}`;
  const subtitle = [week?.phase, weeksLeft != null ? `${weeksLeft} veckor kvar` : null, `${formatDate(monday)}–${formatDate(addDaysIso(monday, 6))}`]
    .filter(Boolean)
    .join(' · ');
  const wornShoes = (shoes ?? []).filter((s) => !s.shoe.retired_on && s.status !== 'ok');
  const today = todayIso();

  return (
    <div {...swipe}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button size="icon" aria-label="Föregående vecka" onClick={() => go(-7)}>
              <ChevronLeft size={18} />
            </Button>
            <Button size="icon" aria-label="Nästa vecka" onClick={() => go(7)}>
              <ChevronRight size={18} />
            </Button>
          </>
        }
      />

      <Block className="mt-1 p-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-5xl font-bold leading-none tracking-tight">{formatKm(planned)}</span>
          <span className="text-[15px] font-medium text-muted">km planerat</span>
          <span className="ml-auto text-right text-[13px] leading-snug text-muted">
            <b className="text-base font-semibold text-fg">{formatKm(view.loggedKm)}</b> km loggat
            {typeof meta.cycle === 'string' && (
              <>
                <br />
                {meta.cycle}
                {meta.programWeek != null && ` · v ${String(meta.programWeek)}`}
              </>
            )}
          </span>
        </div>
        <ProgressBar className="mt-3.5" value={planned ? view.loggedKm / planned : 0} label="Loggat av planerat" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {week?.phase && <Chip accent>{week.phase}</Chip>}
          {typeof meta.strengthMode === 'string' && <Chip>Styrka: {meta.strengthMode}</Chip>}
          <Chip>{flags.totals.runSessions} löppass</Chip>
          <Chip>{flags.totals.strengthSessions} styrkepass</Chip>
          {flags.backToBack && <Chip accent>Back-to-back</Chip>}
        </div>
      </Block>

      {week?.focus_text && (
        <div className="mt-3">
          <Note title="Veckans fokus">{week.focus_text}</Note>
        </div>
      )}

      {wornShoes.length > 0 && (
        <a href={href({ name: 'shoes' })} className="mt-3 block text-[13px] text-warn">
          {wornShoes.map((s) => `${s.shoe.name}: ${formatKm(s.km)} km, ${s.status === 'replace' ? 'dags att byta' : 'byt snart'}`).join(' · ')}
        </a>
      )}

      <ol className="mt-3.5 flex flex-col gap-2">
        {view.days.map((day, i) => (
          <li key={day.date}>
            <DayRow day={day} weekday={WEEKDAYS_SHORT[i]!} isToday={day.date === today} />
          </li>
        ))}
      </ol>
      <p className="pt-3 text-center text-xs text-muted">Tryck på en dag för att logga passet.</p>
    </div>
  );
}

function DayRow({ day, weekday, isToday }: { day: DayView; weekday: string; isToday: boolean }) {
  const planned = day.flags.plannedKm;
  const logged = day.loggedKm;
  const status = aggregateStatus(day);
  const strength = day.sessions.filter((s) => s.session.type === 'strength');
  const other = day.sessions.filter((s) => s.session.type === 'other');
  const rest = day.flags.isRest && !day.extras.length;
  const hasLog = day.sessions.some((s) => s.run) || day.extras.some((e) => e.run);

  return (
    <a
      href={href({ name: 'day', date: day.date })}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-xl border bg-surface px-3.5 py-3',
        isToday ? 'border-accent' : 'border-line hover:border-muted',
        rest && 'opacity-60',
      )}
    >
      <span className="w-9 text-[12.5px] text-muted">
        {weekday}
        <br />
        <span className="text-[11px]">{formatDate(day.date, 'd/M')}</span>
      </span>
      <span className="min-w-16 text-base font-semibold">
        {planned > 0 ? (
          hasLog && logged !== planned ? (
            <>
              {formatKm(logged)} km <small className="text-xs font-normal text-muted">av {formatKm(planned)}</small>
            </>
          ) : (
            `${formatKm(planned)} km`
          )
        ) : hasLog ? (
          `${formatKm(logged)} km`
        ) : rest ? (
          'Vila'
        ) : (
          '–'
        )}
        {day.flags.isRestAfterBackToBack && <small className="block text-[11px] font-normal text-muted">Vila efter back-to-back</small>}
      </span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {strength.map((s) => (
          <span key={s.session.id} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {s.session.title ?? 'Styrka'}
          </span>
        ))}
        {other.map((s) => (
          <span key={s.session.id} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {s.session.title ?? 'Pass'}
          </span>
        ))}
        {status && <StatusDot status={status} />}
      </span>
    </a>
  );
}
