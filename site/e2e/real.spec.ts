import { expect, test, type Page } from '@playwright/test';

/** The site as it was before the committee published 2026 results: meta.json says so. */
async function before2026(page: Page) {
  await page.route('**/data/meta.json*', async (route) => {
    const res = await route.fetch();
    const meta = await res.json();
    meta.elections['26'] = { ...meta.elections['26'], status: 'not_published' };
    await route.fulfill({ response: res, json: meta });
  });
}

test('before 2026 results: 2022 results load and 2026 shows the not-published state', async ({ page }) => {
  await before2026(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('תוצאות הבחירות לכנסת ה-26 בהשוואה לכנסת ה-25');
  await expect(page.getByRole('radio', { name: 'כנסת 25' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('חלוקת המנדטים')).toBeVisible();
  await expect(page.locator('.seat-legend')).toContainText('הליכוד');
  await expect(page.locator('.seat-legend')).toContainText('32');
  await expect(page.locator('.mock-banner')).toHaveCount(0);

  // swing modes need 2026 results
  await expect(page.getByRole('radio', { name: 'תנודה למפלגה' })).toBeDisabled();

  await page.getByRole('radio', { name: 'כנסת 26' }).click();
  await expect(page.locator('.awaiting-note')).toContainText('טרם פורסמו תוצאות');
  await expect(page.locator('.chip')).toHaveText('טרם פורסמו תוצאות');
  await expect(page.locator('.map canvas')).toBeVisible();
  await page.getByRole('radio', { name: 'כנסת 25' }).click();

  // the comparison (swing) view shows the same notice instead of falling back to 2022
  await page.getByRole('radio', { name: 'השוואה' }).click();
  await expect(page.getByRole('radio', { name: 'השוואה' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('heading', { name: 'טרם פורסמו תוצאות' })).toBeVisible();
  await expect(page.locator('.empty-state')).toContainText('מפת התנודה');
  await expect(page.locator('.chip')).toHaveText('טרם פורסמו תוצאות');
});

test('before 2026 results: a shared comparison link opens on the notice', async ({ page }) => {
  await before2026(page);
  await page.goto('/#v=compare&m=partySwing&p=%D7%9E%D7%97%D7%9C');
  await expect(page.getByRole('heading', { name: 'טרם פורסמו תוצאות' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'השוואה' })).toHaveAttribute('aria-checked', 'true');
});

test('search finds a locality despite hyphen and final-letter differences', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('חפשו יישוב או שכונה').fill('תל אביב יפו');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unit-title')).toHaveText('תל אביב-יפו');
  await expect(page.locator('.crumbs')).toContainText('ארצי');
});

test('dark mode toggle applies and persists', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'מצב כהה' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(18, 18, 17)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'מצב כהה' })).toHaveAttribute('aria-pressed', 'true');
});

test('national party table shows seats next to each party', async ({ page }) => {
  await page.goto('/#v=25');
  const table = page.locator('.party-table').first();
  await expect(table.locator('thead')).toContainText('מנדטים');
  await expect(table.locator('tr', { hasText: 'הליכוד' }).locator('.seats')).toHaveText('32');
  await expect(table.locator('tr', { hasText: 'יש עתיד' }).locator('.seats')).toHaveText('24');
  // below the threshold: a dash, not 0
  await expect(table.locator('tr', { hasText: 'מרצ' }).locator('td').first()).toHaveText('—');
});

test('before 2026 results: the 2026 tab lists the running lists', async ({ page }) => {
  await before2026(page);
  await page.goto('/#v=26');
  const panel = page.locator('.panel');
  // no 2022 numbers in the 2026 tab
  await expect(page.locator('.panel-note')).toHaveCount(0);
  await expect(panel.locator('.stats')).toHaveCount(0);
  await expect(panel.locator('.seat-chart figcaption')).toHaveText('חלוקת המנדטים: טרם פורסמו תוצאות');
  const lists = panel.locator('.candidate-lists');
  await expect(lists.getByRole('heading', { name: 'הרשימות המתמודדות' })).toBeVisible();
  await expect(lists.locator('tbody tr:not(.group-row)')).toHaveCount(37);
  await expect(lists.locator('.group-row')).toHaveText([/גוש הקואליציה \(7\)/, /גוש האופוזיציה \(4\)/, /מפלגות ערביות/, /אחרות/]);
  // עמך ישראל is in the coalition bloc
  const coalition = lists.locator('tbody').first();
  await expect(coalition).toContainText('עמך ישראל');
  // lineage explained by name, with the 2022 strength; results are dashes
  const dems = lists.locator('tr', { hasText: 'הדמוקרטים' });
  await expect(dems).toContainText('איחוד של העבודה ומרצ');
  await expect(dems).toContainText('ב-2022: 6.9%');
  await expect(dems.locator('td')).toHaveText(['—', '—']);
  await expect(lists.locator('tr', { hasText: 'עוצמה יהודית' }).first()).toContainText('ב-2022, כחלק מהציונות הדתית–עוצמה יהודית: 10.8%');
  await expect(lists).toContainText('הסכמי עודפים');
  await expect(lists).toContainText('כחול לבן');
  // the map is there, in the neutral "awaiting results" state
  await expect(page.locator('.map canvas')).toBeVisible();
  await expect(page.locator('.legend')).toContainText('טרם פורסמו תוצאות');
});

test('2026 results: the site opens on the comparison, with the count and 120 seats', async ({ page, request }) => {
  const status = (await (await request.get('/data/meta.json')).json()).elections['26'].status;
  test.skip(status === 'not_published', '2026 results are not published yet');
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'השוואה' })).toHaveAttribute('aria-checked', 'true');
  // the loop may publish a new count during the test: match the form, not the number
  await expect(page.locator('.chip')).toHaveText(status === 'final' ? 'סופי' : /^נספרו [\d.]+% מהקולות · עודכן /);
  await expect(page.getByRole('radio', { name: 'תנודה למפלגה' })).toBeEnabled();
  const chart = page.locator('.seat-chart');
  await expect(chart.locator('.seat-total')).toHaveText('120');
  await expect(chart.locator('figcaption')).toHaveText(status === 'final' ? 'חלוקת המנדטים' : 'חלוקת מנדטים לפי הקולות שנספרו');
  // the national table compares with 2022: Likud's row has a swing figure
  await expect(page.locator('.party-table').first().locator('tr', { hasText: 'הליכוד' })).toContainText(/[−+-]\d+\.\d/);
});

test('seat chart: pointing at a party highlights its seats', async ({ page }) => {
  await page.goto('/#v=25');
  const chart = page.locator('.seat-chart');
  await expect(chart.locator('.seat-active')).toHaveText('הצביעו על מושב או על שם רשימה');
  await chart.getByRole('button', { name: /הליכוד/ }).hover();
  await expect(chart.locator('.seat-active')).toHaveText('הליכוד: 32 מנדטים · 23.4% מהקולות');
  // vote shares are shown next to the seats in the legend, and in the map legend
  await expect(chart.getByRole('button', { name: /יש עתיד/ })).toContainText('17.8%');
  await expect(page.locator('.legend-parties li', { hasText: 'הליכוד' })).toContainText('23.4%');
  await expect(chart.locator('.seat-total')).toHaveText('32');
  await expect(chart.locator('.seat-dot.on')).toHaveCount(32);
  await expect(chart).toHaveClass(/has-active/);
  // pointing at a seat works too
  await chart.locator('.seat-dot').last().hover();
  await expect(chart.locator('.seat-active')).not.toContainText('הליכוד');
  await page.mouse.move(5, 5);
  await expect(chart.locator('.seat-total')).toHaveText('120');
});

for (const width of [1400, 783, 390]) {
  test(`party tables show vote share, nationally and locally (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#v=25&m=winner');
    const share = page.locator('.party-table').first().locator('tbody td.share-cell');
    await expect(share.first()).toHaveText('23.4%');
    await expect(share.first()).toBeVisible();
    await page.goto('/#v=25&m=winner&s=locality:5000');
    await page.reload();
    await expect(page.locator('.unit-title')).toHaveText('תל אביב-יפו');
    await expect(page.locator('.party-table').first().locator('tbody td.share-cell').first()).toHaveText(/^\d+\.\d%$/);
  });
}
