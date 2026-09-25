import { loadActiveProgram, loadShoes, loadWeek } from '@/data/repository';
import { db } from '@/data/local/db';
import { getOwnerId } from '@/data/session';
import { addDaysIso, todayIso, weekStartIso } from '@/domain/dates';
import { INTENT_LABEL } from '@/domain/sessionIntent';
import { parseStructuredRun } from '@/domain/structuredRun';

/**
 * The context always sent with a question (docs/SPEC.md §8), built from the
 * local store so it reflects what the user sees, including unsynced logs.
 * Kept compact: the model can ask for more with getContext.
 */
export async function buildAiContext(date = todayIso()) {
  const owner = await getOwnerId();
  const [profile, program, week, shoes] = await Promise.all([db.profiles.get(owner), loadActiveProgram(), loadWeek(date), loadShoes()]);

  const shoeNames = new Map(shoes.map((s) => [s.shoe.id, s.shoe.name]));
  const shoeName = (id: string | null | undefined) => (id ? shoeNames.get(id) : undefined);

  const dayView = async (d: string) => {
    const w = d >= week.monday && d <= addDaysIso(week.monday, 6) ? week : await loadWeek(d);
    const day = w.days.find((x) => x.date === d)!;
    return {
      date: d,
      note: day.note,
      restAfterBackToBack: day.flags.isRestAfterBackToBack || undefined,
      sessions: day.sessions.map((s) => ({
        sessionId: s.session.id,
        type: s.session.type,
        title: s.session.title,
        runType: s.intent ? INTENT_LABEL[s.intent.intent] : undefined,
        description: s.session.notes ?? undefined,
        structured: parseStructuredRun(s.session.notes) ?? undefined,
        items: s.items.map((i) => i.raw_text),
        status: s.status,
        logged: s.logged
          ? {
              rpe: s.logged.rpe,
              feel: s.logged.feel,
              km: s.run?.distance_km,
              parts: s.run && (s.run.warmup_km != null || s.run.main_km != null || s.run.cooldown_km != null)
                ? { warmupKm: s.run.warmup_km, mainKm: s.run.main_km, cooldownKm: s.run.cooldown_km, intervalsDone: s.run.intervals_done?.length ?? 0 }
                : undefined,
              shoe: shoeName(s.run?.shoe_id),
              sets: s.sets.filter((x) => !x.skipped).map((x) => `${x.weight_kg ?? '-'}kg×${x.reps ?? '-'}${x.rpe ? `@${x.rpe}` : ''}`),
            }
          : undefined,
      })),
      extraLogs: day.extras.map((e) => ({ type: e.logged.type, status: e.logged.status, km: e.run?.distance_km })),
    };
  };

  const since = addDaysIso(date, -28);
  const logged = (await db.logged_sessions.where('date').between(since, date, true, true).toArray()).filter((l) => !l.deleted_at);
  const runs = new Map((await db.logged_runs.where('logged_session_id').anyOf(logged.map((l) => l.id)).toArray()).map((r) => [r.logged_session_id, r]));
  const recentLogs = logged
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => [l.date, l.type, l.status, runs.get(l.id)?.distance_km ?? null, l.rpe, l.feel, shoeName(runs.get(l.id)?.shoe_id) ?? ''].join('|'));

  // Every run this week with its type and description, so the assistant can
  // reason about moving the quality session to another day.
  const weekRuns = week.days.flatMap((d) =>
    d.sessions
      .filter((s) => s.session.type === 'run')
      .map((s) => ({
        sessionId: s.session.id,
        date: d.date,
        plannedKm: d.flags.plannedKm,
        runType: s.intent ? INTENT_LABEL[s.intent.intent] : undefined,
        description: s.session.notes ?? undefined,
        status: s.status,
      })),
  );

  const weekSums = [];
  for (let i = 4; i >= 1; i--) {
    const w = await loadWeek(addDaysIso(weekStartIso(date), -7 * i));
    weekSums.push({ weekStart: w.monday, plannedKm: w.flags.totals.plannedKm, loggedKm: w.loggedKm });
  }
  const lastRated = [...logged].reverse().find((l) => l.rpe != null || l.feel != null);

  return {
    today: date,
    goal: profile?.goal ?? null,
    raceDate: program?.race_date ?? profile?.race_date ?? null,
    injuryNotes: profile?.injury_notes ?? null,
    program: program ? { id: program.id, name: program.name, startDate: program.start_date } : null,
    currentWeek: {
      weekNo: week.week?.week_no ?? null,
      phase: week.week?.phase ?? null,
      focus: week.week?.focus_text ?? null,
      meta: week.week?.meta ?? null,
      backToBack: week.flags.backToBack,
      totals: week.flags.totals,
      loggedKm: week.loggedKm,
    },
    yesterday: await dayView(addDaysIso(date, -1)),
    todayPlan: await dayView(date),
    tomorrow: await dayView(addDaysIso(date, 1)),
    weekRuns,
    recentLogsFormat: 'date|type|status|km|rpe|feel|shoe',
    recentLogs,
    weekSums,
    latestRpe: lastRated?.rpe ?? null,
    latestFeel: lastRated?.feel ?? null,
    shoes: shoes
      .filter((s) => !s.shoe.retired_on)
      .map((s) => ({ name: s.shoe.name, km: s.km, retireKm: s.shoe.retire_km, surface: s.shoe.surface_type, status: s.status })),
  };
}
