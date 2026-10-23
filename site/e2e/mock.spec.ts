import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mock-banner')).toBeVisible();
  await expect(page.locator('.map canvas')).toBeVisible();
});

test('compare view shows lineage badges and swing', async ({ page }) => {
  await expect(page.getByRole('radio', { name: 'השוואה' })).toHaveAttribute('aria-checked', 'true');
  const table = page.locator('.party-table').first();
  await expect(table).toContainText('איחוד של אמת + מרצ');
  await expect(table).toContainText('חדשה');
  await expect(table).toContainText('פוצלה מ־ט');
  await expect(table).toContainText('כולל רשימה חדשה');
  await expect(table.locator('.swing-up, .swing-down').first()).toBeVisible();
  await expect(page.locator('.blocs')).toContainText('גוש הקואליציה');
});

test('click a city on the map, then switch color mode', async ({ page }) => {
  // zoom to Jerusalem via search, then click the middle of the map
  await page.getByPlaceholder('חפשו יישוב או שכונה').fill('ירושלים');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unit-title')).toHaveText('ירושלים');
  await page.waitForTimeout(1500);
  const box = (await page.locator('.map').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.crumbs')).toContainText('ירושלים');

  await page.getByRole('radio', { name: 'תנודה למפלגה' }).check();
  await expect(page.locator('.ramp')).toBeVisible();
  await page.getByRole('combobox', { name: 'מפלגה' }).selectOption({ label: 'הדמוקרטים (אמת)' });
  await page.getByRole('radio', { name: 'תנודה לגוש' }).check();
  await expect(page.getByRole('combobox', { name: 'גוש' })).toBeVisible();
});

test('table view lists units and sorts', async ({ page }) => {
  await page.getByRole('button', { name: 'הצג כטבלה' }).click();
  const rows = page.locator('.unit-table tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1000);
  // default sort: valid votes, largest first
  const n = async (i: number) => Number((await rows.nth(i).locator('td').first().innerText()).replace(/[^\d]/g, ''));
  expect(await n(0)).toBeGreaterThanOrEqual(await n(1));
  expect(await n(1)).toBeGreaterThanOrEqual(await n(2));
  await page.locator('.unit-table thead').getByRole('button', { name: /שם/ }).click();
  await expect(page.locator('.unit-table thead th').first()).toHaveAttribute('aria-sort', 'ascending');
  await rows.first().getByRole('button').click();
  await expect(page.locator('.unit-title')).not.toHaveText('ארצי');
});
