import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { syntheticKullamannen } from '../../src/import/fixtures/syntheticKullamannen';

function syntheticWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(syntheticKullamannen(4))) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('import a file, open a day, log a run, see the week total update', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByTestId('import-file').setInputFiles({
    name: 'Testplan.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: syntheticWorkbook(),
  });

  // Review view: nothing is saved until the user approves.
  await expect(page.getByRole('button', { name: 'Importera 4 veckor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 ny övning' })).toBeVisible();
  await expect(page.getByText('Okänd testövning')).toBeVisible();
  await page.getByRole('button', { name: 'Importera 4 veckor' }).click();

  // Week 1 (Monday 2026-09-21): 5 + 6 + 10 + 6 + 10 = 37 km planned, nothing logged yet.
  await page.goto('/#/vecka/2026-09-21');
  await expect(page.getByRole('heading', { name: 'Vecka 1' })).toBeVisible();
  await expect(page.getByText('37', { exact: true })).toBeVisible();
  await expect(page.getByText('0 km loggat')).toBeVisible();

  // Open Tuesday and log the run with a different distance than planned.
  await page.getByRole('link', { name: /Tis/ }).click();
  await expect(page).toHaveURL(/#\/dag\/2026-09-22/);
  const distance = page.getByLabel('Distans (km)');
  await expect(distance).toHaveValue('6');
  await distance.fill('7,5');
  await distance.press('Enter');
  await page.getByRole('button', { name: 'Klart' }).click();

  await page.getByRole('link', { name: 'Tillbaka till veckan' }).click();
  await expect(page.getByText('7,5 km loggat')).toBeVisible();
  // The planned value stays visible next to the actual one.
  await expect(page.getByText('av 6')).toBeVisible();
});

test('structured quality session: tick intervals, log the parts, the total follows', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByTestId('import-file').setInputFiles({
    name: 'Testplan.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: syntheticWorkbook(),
  });
  await page.getByRole('button', { name: 'Importera 4 veckor' }).click();
  await page.getByRole('link', { name: /Mån/ }).first().waitFor();

  // Wednesday of week 1: "Intervaller: 6×2 min …, 3 km uppvärmning, 3 km nedjogg."
  await page.goto('/#/dag/2026-09-23');
  await expect(page.getByRole('heading', { name: 'Intervaller' })).toBeVisible();
  await expect(page.getByText('0 av 6 klara')).toBeVisible();
  for (const n of [1, 2, 3]) await page.getByRole('button', { name: `Intervall ${n}`, exact: true }).click();
  await expect(page.getByText('3 av 6 klara')).toBeVisible();

  await page.getByLabel('Distans i huvuddelen (km)').fill('4,1');
  await page.getByLabel('Distans i huvuddelen (km)').press('Enter');
  await page.getByRole('button', { name: /Uppvärmning/ }).click();
  await page.getByRole('button', { name: /Nedvarvning/ }).click();
  const [warmup, cooldown] = await page.getByLabel('Faktisk distans (km)').all();
  await warmup!.fill('3');
  await warmup!.press('Enter');
  await cooldown!.fill('3');
  await cooldown!.press('Enter');

  // The run total is the sum of the parts; the label shows plan and parts.
  await expect(page.getByLabel('Distans (km)', { exact: true })).toHaveValue('10,1');
  await expect(page.getByText('plan 10 · delar 10,1')).toBeVisible();

  // Typing the total by hand turns the automation off …
  await page.getByLabel('Distans (km)', { exact: true }).fill('11');
  await page.getByLabel('Distans (km)', { exact: true }).press('Enter');
  await cooldown!.fill('4');
  await cooldown!.press('Enter');
  await expect(page.getByLabel('Distans (km)', { exact: true })).toHaveValue('11');
  // … and clearing it turns it back on.
  await page.getByLabel('Distans (km)', { exact: true }).fill('');
  await page.getByLabel('Distans (km)', { exact: true }).press('Enter');
  await expect(page.getByLabel('Distans (km)', { exact: true })).toHaveValue('11,1');
});
