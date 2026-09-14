import { test, expect } from '@playwright/test';

// UI contract test: all APIs are intercepted; no production/auth/database access.
test('hasil cepat tetap mencapai 100 tanpa indikator hilang saat token datang', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sap_assistant_user', JSON.stringify({ username: 'UI_TEST', role: 'user' }));
    localStorage.setItem('sap_assistant_token', 'isolated-test');
    localStorage.setItem('sap_assistant_lang', 'id');
    window.progressValues = [];
    new MutationObserver(() => {
      const bar = document.querySelector('[role="progressbar"]');
      if (bar) {
        const n = Number(bar.getAttribute('aria-valuenow'));
        if (window.progressValues.at(-1) !== n) window.progressValues.push(n);
      }
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === '/api/me') data = { username: 'UI_TEST', role: 'user' };
    else if (path === '/api/sessions') data = route.request().method() === 'POST'
      ? { session_id: 'ui-test' } : [{ session_id: 'ui-test', title: 'UI test' }];
    else if (path === '/api/modes') data = { modes: [] };
    else if (path.endsWith('/messages')) data = [];
    else if (path === '/api/chat/stream') {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const events = [
        { type: 'progress', stage: 'thinking', step: 1, max_steps: 6 },
        { type: 'token', text: 'Jawaban final pengujian.' },
        { type: 'result', data: { reply: 'Jawaban final pengujian.', session_id: 'ui-test', message_id: 2, user_message_id: 1 } },
      ];
      return route.fulfill({ contentType: 'text/event-stream', body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') });
    }
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  await page.getByPlaceholder('Tanyakan sesuatu tentang SAP…').fill('uji progres');
  await page.getByPlaceholder('Tanyakan sesuatu tentang SAP…').press('Enter');
  await expect(page.getByRole('progressbar')).toBeVisible();
  // Jawaban final tidak boleh mendahului animasi 1–100.
  await page.waitForTimeout(700);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByText('Jawaban final pengujian.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buat ulang jawaban' })).toBeVisible();
  const values = await page.evaluate(() => window.progressValues);
  expect(values).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText('Jawaban final pengujian.', { exact: true })).toHaveCount(1);
});
