import { expect, test } from '@playwright/test';

test('2022 results load and 2026 shows the not-published state', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'טרם פורסמו תוצאות' })).toBeVisible();
  await expect(page.locator('.chip')).toHaveText('טרם פורסמו תוצאות');
  await page.getByRole('button', { name: 'הצג את תוצאות כנסת 25' }).click();
  await expect(page.locator('.map canvas')).toBeVisible();
});

test('search finds a locality despite hyphen and final-letter differences', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('חפשו יישוב או שכונה').fill('תל אביב יפו');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unit-title')).toHaveText('תל אביב-יפו');
  await expect(page.locator('.crumbs')).toContainText('ארצי');
});
