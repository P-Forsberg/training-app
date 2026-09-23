import { useEffect } from 'react';

export type ThemeSetting = 'night' | 'day' | 'logbook' | 'system';
export type ThemeName = Exclude<ThemeSetting, 'system'>;

export const THEME_LABELS: Record<ThemeSetting, string> = {
  night: 'Natt',
  day: 'Dagsljus',
  logbook: 'Loggbok',
  system: 'Följ systemet',
};

const STORAGE_KEY = 'theme';

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ThemeName {
  if (setting === 'system') return prefersDark ? 'night' : 'day';
  return setting;
}

/** Remembers the theme locally so the next load paints in the right colours before the DB opens. */
export function storedTheme(): ThemeSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'night' || v === 'day' || v === 'logbook' || v === 'system') return v;
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return 'night';
}

export function useApplyTheme(setting: ThemeSetting | undefined): void {
  useEffect(() => {
    const effective = setting ?? storedTheme();
    try {
      localStorage.setItem(STORAGE_KEY, effective);
    } catch {
      // ignore
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = resolveTheme(effective, mq?.matches ?? true);
      document.documentElement.dataset.theme = theme;
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [setting]);
}
