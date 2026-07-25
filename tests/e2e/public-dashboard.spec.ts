import { expect, test } from '@playwright/test';

test('landing page exposes the primary dashboard flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Discord operations/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute(
    'href',
    '/login',
  );
});

test('protected dashboard redirects anonymous visitors to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /Discord permissions/i })).toBeVisible();
});
