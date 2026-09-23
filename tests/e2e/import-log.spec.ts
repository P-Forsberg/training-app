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

  // Week 1 (Monday 2026-09-21): 5 + 6 + 6 + 10 = 27 km planned, nothing logged yet.
  await page.goto('/#/vecka/2026-09-21');
  await expect(page.getByRole('heading', { name: 'Vecka 1' })).toBeVisible();
  await expect(page.getByText('27', { exact: true })).toBeVisible();
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
