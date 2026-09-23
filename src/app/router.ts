import { useEffect, useState } from 'react';
import { isIsoDate } from '@/domain/dates';

/** Minimal hash router. Hash URLs work offline and in an installed PWA without server rewrites. */
export type Route =
  | { name: 'week'; date?: string }
  | { name: 'day'; date: string }
  | { name: 'calendar' }
  | { name: 'stats' }
  | { name: 'shoes' }
  | { name: 'info' }
  | { name: 'settings' }
  | { name: 'import' };

export function parseRoute(hash: string): Route {
  const [, name = '', arg = ''] = hash.replace(/^#/, '').split('/');
  switch (name) {
    case 'dag':
      return isIsoDate(arg) ? { name: 'day', date: arg } : { name: 'week' };
    case 'vecka':
      return isIsoDate(arg) ? { name: 'week', date: arg } : { name: 'week' };
    case 'kalender':
      return { name: 'calendar' };
    case 'statistik':
      return { name: 'stats' };
    case 'skor':
      return { name: 'shoes' };
    case 'info':
      return { name: 'info' };
    case 'installningar':
      return { name: 'settings' };
    case 'import':
      return { name: 'import' };
    default:
      return { name: 'week' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'week':
      return route.date ? `#/vecka/${route.date}` : '#/vecka';
    case 'day':
      return `#/dag/${route.date}`;
    case 'calendar':
      return '#/kalender';
    case 'stats':
      return '#/statistik';
    case 'shoes':
      return '#/skor';
    case 'info':
      return '#/info';
    case 'settings':
      return '#/installningar';
    case 'import':
      return '#/import';
  }
}

export function navigate(route: Route, replace = false): void {
  const target = href(route);
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
