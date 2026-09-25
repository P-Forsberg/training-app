import { test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { syntheticKullamannen } from '../../src/import/fixtures/syntheticKullamannen';

// Visual check, not an assertion test: writes screenshots when SCREENSHOT_DIR is set.
test.skip(!process.env.SCREENSHOT_DIR, 'set SCREENSHOT_DIR to capture screenshots');

test('capture main screens', async ({ page }) => {
  const dir = process.env.SCREENSHOT_DIR!;
  const wb = XLSX.utils.book_new();
  const data = syntheticKullamannen(4);
  for (const [name, rows] of Object.entries(data)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  await page.goto('/#/import');
  await page.getByTestId('import-file').setInputFiles({ name: 'Testplan.xlsx', mimeType: 'application/octet-stream', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer });
  await page.screenshot({ path: `${dir}/review.png`, fullPage: true });
  await page.getByRole('button', { name: /Importera/ }).click();
  await page.getByRole('link', { name: /Mån/ }).first().waitFor();
  await page.goto('/#/dag/2026-09-23');
  await page.getByRole('button', { name: 'Intervall 1', exact: true }).click();
  await page.getByRole('button', { name: 'Intervall 2', exact: true }).click();
  await page.getByRole('button', { name: /Uppvärmning/ }).click();
  await page.getByLabel('Faktisk distans (km)').first().fill('3,2');
  await page.getByLabel('Faktisk distans (km)').first().press('Enter');
  await page.screenshot({ path: `${dir}/day.png`, fullPage: true });
  await page.goto('/#/vecka/2026-09-21');
  await page.screenshot({ path: `${dir}/week.png`, fullPage: true });
  await page.goto('/#/kalender');
  await page.screenshot({ path: `${dir}/calendar.png` });
  await page.goto('/#/installningar');
  await page.getByRole('radio', { name: 'Dagsljus' }).click();
  await page.goto('/#/vecka/2026-09-21');
  await page.screenshot({ path: `${dir}/week-day-theme.png`, fullPage: true });
});
