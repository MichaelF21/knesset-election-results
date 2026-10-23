import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mock-banner')).toBeVisible();
  await expect(page.locator('.map canvas')).toBeVisible();
});

test('compare view shows lineage badges and swing', async ({ page }) => {
  await expect(page.getByRole('radio', { name: 'השוואה' })).toHaveAttribute('aria-checked', 'true');
  const table = page.locator('.party-table').first();
  await expect(table).toContainText('איחוד של העבודה ומרצ');
  await expect(table).toContainText('חדשה');
  await expect(table).toContainText('פוצלה מהציונות הדתית–עוצמה יהודית');
  await expect(table).toContainText('איחוד של יש עתיד עם מפלגתו החדשה של נפתלי בנט');
  await expect(table).toContainText('איחוד של הכלכלית החדשה עם המילואימניקים של יועז הנדל');
  await page.getByRole('button', { name: 'הצג את כל הרשימות' }).first().click(); // small lists are folded
  await expect(table).toContainText('ב-2022: אני ואתה (פתק ך)');
  // each list explains what its swing is compared against, by list name
  await expect(table).toContainText('ההשוואה: מול יש עתיד בלבד');
  await expect(table).toContainText('ההשוואה: מול סך הרשימות ב-2022 (העבודה');
  await expect(table).toContainText('סך הרשימות שהתפצלו מהציונות הדתית–עוצמה יהודית');
  // no bare ballot letters in explanations
  await expect(table).not.toContainText('פוצלה מ־ט');
  await expect(table).not.toContainText('כולל רשימה חדשה');
  await expect(table.locator('.swing-up, .swing-down').first()).toBeVisible();
  await expect(page.locator('.blocs')).toContainText('גוש הקואליציה');
  // Blue and White withdrew: shown with a badge, not in the results; Yashar is a new list
  const withdrawn = page.locator('.withdrawn');
  await expect(withdrawn).toContainText('רשימות שפרשו');
  await expect(withdrawn).toContainText('כחול לבן');
  await expect(withdrawn.locator('.badge-withdrawn')).toHaveText('פרשה');
  await expect(table.locator('tr', { hasText: 'ישר!' })).toContainText('חדשה');
  await page.locator('.gone summary').click();
  await expect(page.locator('.gone')).toContainText('ב-2026: כחול לבן — פרשה');
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

test('comparison seats show the change against 2022 predecessors', async ({ page }) => {
  const row = page.locator('.party-table').first().locator('tr', { hasText: 'הדמוקרטים' });
  await expect(row.locator('.seats')).toBeVisible();
  await expect(row.locator('.seats-delta')).toBeVisible(); // vs. 2022 אמת + מרצ (4 + 0)
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('fits the screen, tap selects a unit, button jumps to details', async ({ page }) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('.map').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500); // let the map draw its sources before tapping
    const box = (await page.locator('.map').boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * 0.42, box.y + box.height * 0.42);
    const details = page.locator('.to-details');
    await expect(details).toBeVisible();
    await expect(page.locator('.tooltip')).toBeVisible();
    await details.click();
    await expect(page.locator('.unit-title')).toBeInViewport();
    await expect(page.locator('.unit-title')).not.toHaveText('ארצי');
  });
});
