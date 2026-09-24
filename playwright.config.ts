import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:4173', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    // Build without a backend: e2e runs the app in local-only mode, no login gate.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
