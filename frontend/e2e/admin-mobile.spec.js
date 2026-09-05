/**
 * Dashboard admin di ponsel, khususnya saat dipasang sebagai PWA.
 *
 * Dashboard memakai `fixed inset-0`, yang di mode standalone iOS mencakup area
 * status bar. Tanpa padding safe-area, judul dan tombol tutup berada persis di
 * bawah jam dan ikon baterai — ketukan pengguna mengenai status bar, bukan
 * tombolnya, sehingga dashboard tidak bisa ditutup sama sekali.
 */
import { test, expect } from '@playwright/test';

const ADMIN = process.env.E2E_ADMIN_USER || 'TRSTDEV';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123';

/** Tinggi status bar & home indicator iPhone dengan notch. */
const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

/**
 * Chromium melaporkan safe-area 0 karena tidak punya notch sungguhan.
 * Nilainya disuntikkan lewat token --sat/--sab yang dipakai aplikasi.
 */
async function simulasikanPerangkatBernotch(page) {
  await page.addInitScript(([top, bottom]) => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--sat', `${top}px`);
      document.documentElement.style.setProperty('--sab', `${bottom}px`);
      document.documentElement.classList.add('is-pwa-standalone');
    });
  }, [SAFE_TOP, SAFE_BOTTOM]);
}

/**
 * `isVisible()` tetap true untuk elemen yang digeser keluar layar dengan
 * transform (sidebar drawer), jadi posisinya yang menentukan.
 */
async function klikYangTerlihat(locator) {
  const jumlah = await locator.count();
  for (let i = 0; i < jumlah; i += 1) {
    const box = await locator.nth(i).boundingBox();
    if (box && box.x >= 0 && box.y >= 0) {
      await locator.nth(i).click();
      return;
    }
  }
  throw new Error('tidak ada elemen yang berada di dalam layar');
}

test('tombol tutup dashboard admin tidak tertimpa status bar', async ({ page }) => {
  await simulasikanPerangkatBernotch(page);
  await page.goto('/');

  await klikYangTerlihat(page.getByRole('button', { name: /masuk akun/i }));
  await page.getByPlaceholder('Masukkan username SAP').fill(ADMIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /masuk aplikasi/i }).click();
  await expect(page.locator('aside')).toContainText(ADMIN, { timeout: 15_000 });

  await klikYangTerlihat(page.getByRole('button', { name: 'Buka menu percakapan' }));
  await page.getByRole('button', { name: /dashboard admin/i }).first().click();

  const tutup = page.getByRole('button', { name: 'Tutup Dashboard' });
  await expect(tutup).toBeVisible();

  const ukuran = await tutup.boundingBox();
  expect(ukuran.y).toBeGreaterThanOrEqual(SAFE_TOP);
  // Area sentuh minimal yang nyaman di layar sentuh.
  expect(ukuran.height).toBeGreaterThanOrEqual(44);

  // Yang paling menentukan: ketukan di tengah tombol benar-benar mengenainya.
  const kena = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Tutup Dashboard"]');
    const r = el.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return target?.closest('[aria-label]')?.getAttribute('aria-label');
  });
  expect(kena).toBe('Tutup Dashboard');

  await tutup.click();
  await expect(page.getByPlaceholder('Tanyakan sesuatu tentang SAP…')).toBeVisible();
});
