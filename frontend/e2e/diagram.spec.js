/**
 * Diagram Mermaid pada jawaban asisten.
 *
 * Pustaka mermaid diimpor secara dinamis, jadi yang diperiksa bukan hanya
 * "ada svg" melainkan bahwa chunk-nya benar-benar termuat dan tergambar di
 * dalam percakapan. Diagram juga tidak boleh membuat halaman melebar ke
 * samping — keluhan yang sudah pernah terjadi pada tabel.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const ADMIN = process.env.E2E_ADMIN_USER || 'TRSTDEV';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123';

/**
 * Masuk lebih dulu. Sebagai tamu, kuota harian membuat hasil tes bergantung
 * pada urutan menjalankannya: permintaan ditolak 429 dan gejalanya menyerupai
 * diagram yang gagal digambar.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Buka menu percakapan' }).click();
  await page.getByRole('button', { name: 'Login ke akun SAP' }).click();
  await page.getByPlaceholder('Masukkan username SAP').fill(ADMIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /masuk aplikasi/i }).click();
  await expect(page.locator('aside')).toContainText(ADMIN, { timeout: 15_000 });
});

test('blok mermaid digambar sebagai bagan, bukan kode', async ({ page }) => {
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('tampilkan diagram alur procure to pay');
  await kotak.press('Enter');

  const svg = page.locator('.app-chat-scroll svg[id^="mermaid-"]');
  await expect(svg).toBeVisible({ timeout: 30_000 });

  // Penjelasan teks harus tetap ada; diagram melengkapi, bukan menggantikan.
  await expect(page.locator('.app-chat-scroll')).toContainText('EKKO');

  const ukuran = await page.evaluate(() => ({
    lebarHalaman: document.documentElement.scrollWidth,
    lebarLayar: window.innerWidth,
  }));
  expect(ukuran.lebarHalaman, 'diagram membuat halaman melebar ke samping')
    .toBeLessThanOrEqual(ukuran.lebarLayar);
});

test('diagram tidak digambar selagi jawaban masih ditulis', async ({ page }) => {
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('tampilkan diagram alur procure to pay');
  await kotak.press('Enter');

  // Teks diagram tiba sepotong-sepotong; menggambar potongan yang belum utuh
  // menghasilkan pesan galat berkedip.
  await expect(page.getByText('Menyiapkan diagram…')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.app-chat-scroll svg[id^="mermaid-"]')).toBeVisible({ timeout: 30_000 });
});
