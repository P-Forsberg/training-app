import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChartColumn, ListChecks, Settings } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { seedExerciseCatalog } from '@/data/commands/program';
import { db } from '@/data/local/db';
import { getOwnerId } from '@/data/session';
import { AiPanel } from '@/features/ai/AiPanel';
import { CalendarView } from '@/features/calendar/CalendarView';
import { DayView } from '@/features/day/DayView';
import { ImportView } from '@/features/import/ImportView';
import { InfoView } from '@/features/settings/InfoView';
import { SettingsView } from '@/features/settings/SettingsView';
import { ShoesView } from '@/features/shoes/ShoesView';
import { StatsView } from '@/features/stats/StatsView';
import { WeekView } from '@/features/week/WeekView';
import { startSync } from '@/data/sync/engine';
import { cn } from '@/ui/cn';
import { useApplyTheme, type ThemeSetting } from '@/ui/theme';
import { href, useRoute, type Route } from './router';

const queryClient = new QueryClient({ defaultOptions: { queries: { networkMode: 'offlineFirst', retry: 1 } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}

function Shell() {
  const route = useRoute();
  const theme = useLiveQuery(async () => {
    const owner = await getOwnerId();
    return (await db.profiles.get(owner))?.theme as ThemeSetting | undefined;
  }, []);
  useApplyTheme(theme);

  useEffect(() => {
    void seedExerciseCatalog();
    return startSync();
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 px-4 pb-32">{renderRoute(route)}</main>
      <TabBar route={route} />
      <AiPanel route={route} />
    </div>
  );
}

function renderRoute(route: Route): ReactNode {
  switch (route.name) {
    case 'week':
      return <WeekView date={route.date} />;
    case 'day':
      return <DayView date={route.date} />;
    case 'calendar':
      return <CalendarView />;
    case 'stats':
      return <StatsView />;
    case 'shoes':
      return <ShoesView />;
    case 'info':
      return <InfoView />;
    case 'settings':
      return <SettingsView />;
    case 'import':
      return <ImportView />;
  }
}

const TABS: { route: Route; label: string; icon: typeof ListChecks; match: Route['name'][] }[] = [
  { route: { name: 'week' }, label: 'Vecka', icon: ListChecks, match: ['week', 'day'] },
  { route: { name: 'calendar' }, label: 'Kalender', icon: CalendarDays, match: ['calendar'] },
  { route: { name: 'stats' }, label: 'Statistik', icon: ChartColumn, match: ['stats', 'shoes'] },
  { route: { name: 'settings' }, label: 'Mer', icon: Settings, match: ['settings', 'import', 'info'] },
];

function TabBar({ route }: { route: Route }) {
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-xl">
        {TABS.map((t) => {
          const active = t.match.includes(route.name);
          const Icon = t.icon;
          return (
            <a
              key={t.label}
              href={href(t.route)}
              aria-current={active ? 'page' : undefined}
              className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs', active ? 'text-accent' : 'text-muted')}
            >
              <Icon size={18} aria-hidden />
              {t.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
