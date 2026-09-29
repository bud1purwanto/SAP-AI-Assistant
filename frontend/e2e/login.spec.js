import { test, expect } from '@playwright/test';

const ADMIN = process.env.E2E_ADMIN_USER || 'TRSTDEV';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123';

test('login sukses menutup popup dan mempertahankan sesi', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const authorized = Boolean(request.headers().authorization);

    if (path === '/api/login') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          access_token: 'regression-token',
          username: ADMIN,
          full_name: 'E2E Admin',
          role: 'superadmin',
          roles: ['superadmin'],
          force_change_password: false,
        }),
      });
    }

    if (path === '/api/me' || path === '/api/quota/me') {
      if (!authorized) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Sesi tidak valid. Silakan login kembali.' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(path === '/api/me'
          ? { username: ADMIN, full_name: 'E2E Admin', role: 'superadmin', roles: ['superadmin'] }
          : { used: 0, limit: null }),
      });
    }

    const body = path.includes('/modes')
      ? { chat_modes_enabled: true, modes: [] }
      : path.includes('/mcp')
        ? { sap: { sub_servers: [] }, sql: { sub_servers: [] } }
        : path.includes('/suggestions')
          ? { suggestions: [] }
          : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByPlaceholder(/Masukkan username/i).fill(ADMIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /masuk aplikasi/i }).click();

  await expect(page.locator('aside')).toContainText('E2E Admin', { timeout: 15_000 });
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sap_assistant_token')))
    .not.toBeFalsy();

  await page.waitForTimeout(1_000);
  await expect(dialog).toHaveCount(0);
});
